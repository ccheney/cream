/**
 * Trading Cycle Workflow
 *
 * Implements the hourly OODA loop:
 * - Observe: Fetch market snapshot
 * - Orient: Load memory context
 * - Decide: Run agents and generate plan
 * - Act: Submit orders via Rust execution engine
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with Gemini LLM
 *
 * @see docs/plans/05-agents.md
 */

import { isBacktest } from "@cream/domain";
import {
  ConsensusGate,
  type DecisionPlan,
  runConsensusLoop,
  withAgentTimeout,
} from "@cream/mastra-kit";
import { classifyRegime, type RegimeClassification } from "@cream/regime";

import {
  type AgentContext,
  type BearishResearchOutput,
  type BullishResearchOutput,
  type FundamentalsAnalysisOutput,
  revisePlan,
  runAnalystsParallel,
  runApprovalParallel,
  runDebateParallel,
  runTrader,
  type SentimentAnalysisOutput,
  type TechnicalAnalysisOutput,
} from "../agents/mastra-agents.js";
import { getRegimeLabelsRepo } from "../db.js";

// ============================================
// Types
// ============================================

export interface ExternalContext {
  news: Array<{
    eventId: string;
    type: string;
    summary: string;
    sentiment: string;
    symbols: string[];
    importance: number;
    eventTime: string;
  }>;
  sentiment: Record<string, number>;
  macroIndicators: Record<string, number>;
}

export interface WorkflowInput {
  cycleId: string;
  instruments?: string[];
  /** Force stub mode even in PAPER/LIVE (for testing) */
  forceStub?: boolean;
  /** External context from gatherExternalContext step */
  externalContext?: ExternalContext;
}

export interface MarketSnapshot {
  instruments: string[];
  candles: Record<string, unknown>;
  quotes: Record<string, unknown>;
}

export interface RegimeData {
  regime: string;
  confidence: number;
  reasoning?: string;
}

export interface MemoryContext {
  relevantCases: unknown[];
  regimeLabels: Record<string, RegimeData>;
}

export interface TechnicalAnalysis {
  instrument_id: string;
  setup_classification: string;
  key_levels: { support: number[]; resistance: number[]; pivot: number };
  trend_assessment: string;
  momentum_assessment: string;
  volatility_assessment: string;
  technical_thesis: string;
  invalidation_conditions: string[];
}

export interface SentimentAnalysis {
  instrument_id: string;
  event_impacts: unknown[];
  overall_sentiment: string;
  sentiment_strength: number;
  duration_expectation: string;
  linked_event_ids: string[];
}

export interface FundamentalsAnalysis {
  instrument_id: string;
  fundamental_drivers: string[];
  fundamental_headwinds: string[];
  valuation_context: string;
  macro_context: string;
  event_risk: unknown[];
  fundamental_thesis: string;
  linked_event_ids: string[];
}

export interface Research {
  instrument_id: string;
  thesis: string;
  supporting_factors: { factor: string; source: string; strength: string }[];
  conviction_level: number;
  memory_case_ids: string[];
  strongest_counterargument: string;
}

export interface Decision {
  decisionId: string;
  instrumentId: string;
  action: "BUY" | "SELL" | "HOLD" | "CLOSE";
  direction: "LONG" | "SHORT" | "FLAT";
  size: { value: number; unit: string };
  strategyFamily: string;
  timeHorizon: string;
  rationale: {
    summary: string;
    bullishFactors: string[];
    bearishFactors: string[];
    decisionLogic: string;
    memoryReferences: string[];
  };
  thesisState: string;
}

export interface WorkflowDecisionPlan {
  cycleId: string;
  timestamp: string;
  decisions: Decision[];
  portfolioNotes: string;
}

export interface Approval {
  verdict: "APPROVE" | "REJECT";
  violations?: unknown[];
  required_changes?: unknown[];
  notes?: string;
}

export interface WorkflowState {
  cycleId: string;
  timestamp: string;
  marketSnapshot?: MarketSnapshot;
  memoryContext?: MemoryContext;
  technicalAnalysis?: TechnicalAnalysis[];
  sentimentAnalysis?: SentimentAnalysis[];
  fundamentalsAnalysis?: FundamentalsAnalysis[];
  bullishResearch?: Research[];
  bearishResearch?: Research[];
  decisionPlan?: WorkflowDecisionPlan;
  riskApproval?: Approval;
  criticApproval?: Approval;
  constraintCheck?: { passed: boolean; violations: string[] };
  orderSubmission?: { submitted: boolean; orderIds: string[]; errors: string[] };
}

export interface WorkflowResult {
  cycleId: string;
  approved: boolean;
  iterations: number;
  orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
  mode: "STUB" | "LLM";
}

// ============================================
// Timeout Configuration
// ============================================

const AGENT_TIMEOUT_MS = 30_000; // 30 seconds per agent
const TOTAL_CONSENSUS_TIMEOUT_MS = 300_000; // 5 minutes total

// ============================================
// Stub Implementations (for BACKTEST mode)
// ============================================

async function fetchMarketSnapshot(instruments: string[]): Promise<MarketSnapshot> {
  // STUB: Return mock market data
  return {
    instruments,
    candles: {},
    quotes: {},
  };
}

async function loadMemoryContext(snapshot: MarketSnapshot): Promise<MemoryContext> {
  // STUB: Return mock memory context with default regime
  return {
    relevantCases: [],
    regimeLabels: Object.fromEntries(
      snapshot.instruments.map((i) => [
        i,
        { regime: "RANGE", confidence: 0.5, reasoning: "Stub default regime" },
      ])
    ),
  };
}

/**
 * Compute regime classifications for instruments and store to database.
 * Uses the rule-based classifier from @cream/regime.
 */
async function computeAndStoreRegimes(
  snapshot: MarketSnapshot
): Promise<Record<string, RegimeData>> {
  const regimeLabels: Record<string, RegimeData> = {};

  // Get the repo for storing (fire-and-forget, don't block workflow)
  const repoPromise = getRegimeLabelsRepo().catch(() => null);

  for (const instrument of snapshot.instruments) {
    const candles = snapshot.candles[instrument];

    // Check if we have enough data for regime classification
    if (!candles || !Array.isArray(candles) || candles.length < 51) {
      // Not enough data - use default
      regimeLabels[instrument] = {
        regime: "RANGE",
        confidence: 0.3,
        reasoning: "Insufficient data for classification",
      };
      continue;
    }

    try {
      // Classify using rule-based classifier
      // Candle type expects timestamp as number (unix ms)
      const classification: RegimeClassification = classifyRegime({
        candles: candles as Array<{
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
          timestamp: number;
        }>,
      });

      // Map regime label (regime package uses uppercase, may need mapping)
      regimeLabels[instrument] = {
        regime: classification.regime,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      };
    } catch {
      // Classification failed - use default
      regimeLabels[instrument] = {
        regime: "RANGE",
        confidence: 0.3,
        reasoning: "Classification error",
      };
    }
  }

  // Store to database asynchronously (don't block workflow)
  repoPromise.then(async (repo) => {
    if (!repo) {
      return;
    }

    const timestamp = new Date().toISOString();
    for (const [symbol, data] of Object.entries(regimeLabels)) {
      try {
        await repo.upsert({
          symbol,
          timestamp,
          timeframe: "1h",
          regime: data.regime.toLowerCase().replace("_", "_") as
            | "bull_trend"
            | "bear_trend"
            | "range_bound"
            | "high_volatility"
            | "low_volatility"
            | "crisis",
          confidence: data.confidence,
          trendStrength: null,
          volatilityPercentile: null,
          correlationToMarket: null,
          modelName: "rule_based",
          modelVersion: "1.0.0",
        });
      } catch {
        // Storage failed - continue without blocking
      }
    }
  });

  return regimeLabels;
}

async function runTechnicalAnalystStub(instruments: string[]): Promise<TechnicalAnalysis[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    setup_classification: "NO_SETUP",
    key_levels: { support: [100], resistance: [110], pivot: 105 },
    trend_assessment: "Neutral, consolidating in range",
    momentum_assessment: "RSI at 50, neutral momentum",
    volatility_assessment: "Normal volatility regime",
    technical_thesis: "No clear setup. Waiting for breakout.",
    invalidation_conditions: ["Break below 100", "Break above 110"],
  }));
}

async function runNewsAnalystStub(instruments: string[]): Promise<SentimentAnalysis[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    event_impacts: [],
    overall_sentiment: "NEUTRAL",
    sentiment_strength: 0.5,
    duration_expectation: "DAYS",
    linked_event_ids: [],
  }));
}

async function runFundamentalsAnalystStub(instruments: string[]): Promise<FundamentalsAnalysis[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    fundamental_drivers: ["Strong earnings growth"],
    fundamental_headwinds: ["High valuation"],
    valuation_context: "Trading at 25x P/E",
    macro_context: "Fed on hold, stable rates",
    event_risk: [],
    fundamental_thesis: "Fundamentally sound but priced for perfection.",
    linked_event_ids: [],
  }));
}

async function runBullishResearcherStub(instruments: string[]): Promise<Research[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Potential for breakout if resistance breaks.",
    supporting_factors: [
      { factor: "Strong earnings", source: "FUNDAMENTAL", strength: "MODERATE" },
    ],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "High valuation limits upside",
  }));
}

async function runBearishResearcherStub(instruments: string[]): Promise<Research[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Elevated valuation creates downside risk.",
    supporting_factors: [{ factor: "High P/E", source: "FUNDAMENTAL", strength: "MODERATE" }],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "Strong earnings momentum",
  }));
}

async function runTraderAgentStub(
  cycleId: string,
  bullish: Research[],
  _bearish: Research[]
): Promise<WorkflowDecisionPlan> {
  return {
    cycleId,
    timestamp: new Date().toISOString(),
    decisions: bullish.map((br) => ({
      decisionId: `dec-${br.instrument_id}-${Date.now()}`,
      instrumentId: br.instrument_id,
      action: "HOLD" as const,
      direction: "FLAT" as const,
      size: { value: 0, unit: "SHARES" },
      strategyFamily: "EQUITY_LONG",
      timeHorizon: "SWING",
      rationale: {
        summary: "No clear edge. Bull and bear cases balanced.",
        bullishFactors: ["Strong earnings"],
        bearishFactors: ["High valuation"],
        decisionLogic: "Conviction delta < 0.2, staying flat",
        memoryReferences: [],
      },
      thesisState: "WATCHING",
    })),
    portfolioNotes: "No new positions. Monitoring for clearer setups.",
  };
}

async function runRiskManagerStub(_plan: WorkflowDecisionPlan): Promise<Approval> {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    notes: "HOLD decisions carry no new risk.",
  };
}

async function runCriticStub(_plan: WorkflowDecisionPlan): Promise<Approval> {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    notes: "Plan is logically consistent.",
  };
}

async function checkConstraints(
  approved: boolean
): Promise<{ passed: boolean; violations: string[] }> {
  if (!approved) {
    return { passed: false, violations: ["Plan not approved by agents"] };
  }
  // STUB: Would call Rust gRPC CheckConstraints
  return { passed: true, violations: [] };
}

async function submitOrders(
  constraintsPassed: boolean
): Promise<{ submitted: boolean; orderIds: string[]; errors: string[] }> {
  if (!constraintsPassed) {
    return { submitted: false, orderIds: [], errors: ["Constraints not passed"] };
  }
  // STUB: Would call Rust gRPC SubmitOrders
  // For HOLD decisions, no orders to submit
  return { submitted: true, orderIds: [], errors: [] };
}

// ============================================
// Stub Mode Execution
// ============================================

async function executeTradingCycleStub(input: WorkflowInput): Promise<WorkflowResult> {
  const { cycleId, instruments = ["AAPL", "MSFT", "GOOGL"] } = input;

  // Observe Phase
  const marketSnapshot = await fetchMarketSnapshot(instruments);

  // Orient Phase
  const _memoryContext = await loadMemoryContext(marketSnapshot);

  // Decide Phase - Analysts (Parallel)
  const [_technicalAnalysis, _sentimentAnalysis, _fundamentalsAnalysis] = await Promise.all([
    runTechnicalAnalystStub(instruments),
    runNewsAnalystStub(instruments),
    runFundamentalsAnalystStub(instruments),
  ]);

  // Decide Phase - Researchers (Parallel)
  const [bullishResearch, bearishResearch] = await Promise.all([
    runBullishResearcherStub(instruments),
    runBearishResearcherStub(instruments),
  ]);

  // Decide Phase - Trader
  const decisionPlan = await runTraderAgentStub(cycleId, bullishResearch, bearishResearch);

  // Decide Phase - Approvers (Parallel)
  const [riskApproval, criticApproval] = await Promise.all([
    runRiskManagerStub(decisionPlan),
    runCriticStub(decisionPlan),
  ]);

  const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";

  // Act Phase - Constraints and Orders
  const constraintCheck = await checkConstraints(approved);
  const orderSubmission = await submitOrders(constraintCheck.passed);

  return {
    cycleId,
    approved,
    iterations: 1,
    orderSubmission,
    mode: "STUB",
  };
}

// ============================================
// LLM Mode Execution (Real Mastra Agents)
// ============================================

async function executeTradingCycleLLM(input: WorkflowInput): Promise<WorkflowResult> {
  const { cycleId, instruments = ["AAPL", "MSFT", "GOOGL"], externalContext } = input;

  // Observe Phase
  const marketSnapshot = await fetchMarketSnapshot(instruments);

  // Orient Phase - Load memory and compute regimes in parallel
  const [memoryContext, regimeLabels] = await Promise.all([
    loadMemoryContext(marketSnapshot),
    computeAndStoreRegimes(marketSnapshot),
  ]);

  // Build agent context with external news, macro data, and regime classifications
  const agentContext: AgentContext = {
    cycleId,
    symbols: instruments,
    snapshots: marketSnapshot.candles,
    memory: { relevantCases: memoryContext.relevantCases },
    externalContext: {
      news: externalContext?.news ?? [],
      macroIndicators: externalContext?.macroIndicators ?? {},
      sentiment: externalContext?.sentiment ?? {},
    },
    regimeLabels,
  };

  // ============================================
  // Phase 1: Analysts (Parallel with timeout)
  // ============================================
  const analystsResult = await withAgentTimeout(
    runAnalystsParallel(agentContext),
    AGENT_TIMEOUT_MS * 3, // 3 agents running
    "analysts"
  );

  let analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  };

  if (analystsResult.timedOut) {
    // Return no-trade on analyst timeout
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Analyst agents timed out"] },
      mode: "LLM",
    };
  }
  analystOutputs = analystsResult.result;

  // ============================================
  // Phase 2: Debate (Parallel with timeout)
  // ============================================
  const debateResult = await withAgentTimeout(
    runDebateParallel(agentContext, analystOutputs),
    AGENT_TIMEOUT_MS * 2, // 2 agents running
    "debate"
  );

  let debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  };

  if (debateResult.timedOut) {
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Research agents timed out"] },
      mode: "LLM",
    };
  }
  debateOutputs = debateResult.result;

  // ============================================
  // Phase 3: Trader synthesizes plan
  // ============================================
  const traderResult = await withAgentTimeout(
    runTrader(agentContext, debateOutputs),
    AGENT_TIMEOUT_MS,
    "trader"
  );

  if (traderResult.timedOut) {
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Trader agent timed out"] },
      mode: "LLM",
    };
  }
  const initialPlan = traderResult.result;

  // ============================================
  // Phase 4: Consensus Loop (Risk Manager + Critic)
  // ============================================
  const gate = new ConsensusGate({
    maxIterations: 3,
    logRejections: true,
    timeout: {
      perAgentMs: AGENT_TIMEOUT_MS,
      totalMs: TOTAL_CONSENSUS_TIMEOUT_MS,
    },
    escalation: {
      enabled: !isBacktest(),
    },
  });

  const consensusResult = await runConsensusLoop(
    gate,
    initialPlan,
    // getApproval function
    async (plan: DecisionPlan) => {
      const result = await runApprovalParallel(plan, analystOutputs, debateOutputs);
      return result;
    },
    // revisePlan function
    async (plan: DecisionPlan, rejectionReasons: string[]) => {
      return revisePlan(plan, rejectionReasons, analystOutputs, debateOutputs);
    }
  );

  // ============================================
  // Act Phase - Constraints and Orders
  // ============================================
  const constraintCheck = await checkConstraints(consensusResult.approved);
  const orderSubmission = await submitOrders(constraintCheck.passed);

  return {
    cycleId,
    approved: consensusResult.approved,
    iterations: consensusResult.iterations,
    orderSubmission,
    mode: "LLM",
  };
}

// ============================================
// Main Workflow Execution
// ============================================

/**
 * Execute the trading cycle workflow.
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with Gemini LLM
 *
 * @param input - Workflow input containing cycleId and optional instruments
 * @returns Workflow result with approval status and order submission details
 */
export async function executeTradingCycle(input: WorkflowInput): Promise<WorkflowResult> {
  const useStub = input.forceStub || isBacktest();

  if (useStub) {
    return executeTradingCycleStub(input);
  }

  return executeTradingCycleLLM(input);
}

/**
 * Workflow object for Mastra-like interface.
 */
export const tradingCycleWorkflow = {
  id: "trading-cycle-workflow",
  description: "Hourly OODA loop for trading decisions",

  /**
   * Execute the workflow.
   */
  async execute(options: { triggerData: WorkflowInput }): Promise<WorkflowResult> {
    return executeTradingCycle(options.triggerData);
  },
};
