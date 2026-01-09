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

import { type FullRuntimeConfig, RuntimeConfigError } from "@cream/config";
import { type ExecutionContext, isBacktest } from "@cream/domain";
import {
  ConsensusGate,
  type DecisionPlan,
  runConsensusLoop,
  withAgentTimeout,
} from "@cream/mastra-kit";
import { classifyRegime, type RegimeClassification } from "@cream/regime";
import {
  FIXTURE_TIMESTAMP,
  getCandleFixtures,
  getSnapshotFixture,
} from "../../fixtures/market/index.js";
import {
  type AgentConfigEntry,
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
import {
  getHelixClient,
  getRegimeLabelsRepo,
  getRuntimeConfigService,
  type RuntimeEnvironment,
} from "../db.js";

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
  /** ExecutionContext with environment and source */
  context: ExecutionContext;
  instruments?: string[];
  /** Force stub mode even in PAPER/LIVE (for testing) */
  forceStub?: boolean;
  /** Use draft config instead of active config (for testing new settings) */
  useDraftConfig?: boolean;
  /** External context from gatherExternalContext step */
  externalContext?: ExternalContext;
}

/**
 * Candle data structure (OHLCV).
 */
export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Quote data structure with bid/ask prices.
 */
export interface QuoteData {
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  timestamp: number;
}

export interface MarketSnapshot {
  instruments: string[];
  /** Candle data keyed by symbol */
  candles: Record<string, CandleData[]>;
  /** Quote data keyed by symbol */
  quotes: Record<string, QuoteData>;
  /** Timestamp when the snapshot was created */
  timestamp: number;
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
  /** Config version ID used for this cycle (for audit trail) */
  configVersion: string | null;
}

// ============================================
// Default Timeout Configuration (fallback if DB not available)
// ============================================

const DEFAULT_AGENT_TIMEOUT_MS = 30_000; // 30 seconds per agent
const DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS = 300_000; // 5 minutes total
const DEFAULT_MAX_CONSENSUS_ITERATIONS = 3;

// ============================================
// Config Loading
// ============================================

/**
 * Load runtime config from database.
 * Returns null if config not available (will use defaults).
 */
async function loadRuntimeConfig(
  ctx: ExecutionContext,
  useDraft: boolean
): Promise<FullRuntimeConfig | null> {
  try {
    const service = await getRuntimeConfigService();
    const environment = ctx.environment as RuntimeEnvironment;

    if (useDraft) {
      return await service.getDraft(environment);
    }
    return await service.getActiveConfig(environment);
  } catch (error) {
    // If config not seeded, return null to use defaults
    if (error instanceof RuntimeConfigError && error.code === "NOT_SEEDED") {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Build agent configs from runtime config for AgentContext.
 * Returns undefined if no config available.
 */
type AgentType =
  | "technical_analyst"
  | "news_analyst"
  | "fundamentals_analyst"
  | "bullish_researcher"
  | "bearish_researcher"
  | "trader"
  | "risk_manager"
  | "critic";

function buildAgentConfigs(
  runtimeConfig: FullRuntimeConfig | null
): Record<AgentType, AgentConfigEntry> | undefined {
  if (!runtimeConfig?.agents) {
    return undefined;
  }

  const result: Partial<Record<AgentType, AgentConfigEntry>> = {};
  for (const [agentType, config] of Object.entries(runtimeConfig.agents)) {
    result[agentType as AgentType] = {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      enabled: config.enabled,
      systemPromptOverride: config.systemPromptOverride,
    };
  }
  return result as Record<AgentType, AgentConfigEntry>;
}

// ============================================
// Market Data Functions
// ============================================

/**
 * Fetch market snapshot for the given instruments.
 *
 * In BACKTEST mode, uses deterministic fixture data for reproducible behavior.
 * In PAPER/LIVE mode, will fetch real market data (currently uses fixtures as placeholder).
 *
 * @param instruments - Array of ticker symbols
 * @param ctx - Execution context for environment detection
 * @returns Market snapshot with candles and quotes for each instrument
 */
async function fetchMarketSnapshot(
  instruments: string[],
  ctx?: ExecutionContext
): Promise<MarketSnapshot> {
  const timestamp = ctx && isBacktest(ctx) ? FIXTURE_TIMESTAMP : Date.now();
  const candles: Record<string, CandleData[]> = {};
  const quotes: Record<string, QuoteData> = {};

  for (const symbol of instruments) {
    // Get candle fixture data (120 candles to support long indicator periods)
    const candleData = getCandleFixtures(symbol, 120);
    candles[symbol] = candleData;

    // Get quote from snapshot fixture
    const snapshot = getSnapshotFixture(symbol);
    if (snapshot.lastQuote) {
      quotes[symbol] = {
        bid: snapshot.lastQuote.bid,
        ask: snapshot.lastQuote.ask,
        bidSize: snapshot.lastQuote.bidSize,
        askSize: snapshot.lastQuote.askSize,
        timestamp: snapshot.lastQuote.timestamp,
      };
    } else {
      // Fallback quote derived from last trade price
      const lastPrice = snapshot.lastTrade?.price ?? snapshot.open;
      const spread = lastPrice * 0.0002; // 2 basis point spread
      quotes[symbol] = {
        bid: Number((lastPrice - spread / 2).toFixed(2)),
        ask: Number((lastPrice + spread / 2).toFixed(2)),
        bidSize: 100,
        askSize: 100,
        timestamp,
      };
    }
  }

  // TODO: In PAPER/LIVE mode, wire up real market data providers:
  // - Polygon for candles and quotes
  // - Databento for real-time execution-grade data
  // For now, fixture data is used as a placeholder for all environments.

  return {
    instruments,
    candles,
    quotes,
    timestamp,
  };
}

/**
 * Load memory context including relevant historical cases from HelixDB.
 *
 * Retrieves similar trade decisions from HelixDB using Case-Based Reasoning (CBR).
 * Falls back to empty context if HelixDB is unavailable.
 *
 * @param snapshot - Market snapshot with instrument data
 * @param ctx - Execution context for environment detection
 * @returns Memory context with relevant cases and initial regime labels
 */
async function loadMemoryContext(
  snapshot: MarketSnapshot,
  ctx?: ExecutionContext
): Promise<MemoryContext> {
  // Initialize regime labels with defaults (will be refined by computeAndStoreRegimes)
  const regimeLabels: Record<string, RegimeData> = {};
  for (const symbol of snapshot.instruments) {
    regimeLabels[symbol] = {
      regime: "RANGE",
      confidence: 0.3,
      reasoning: "Initial default - pending classification",
    };
  }

  // Try to retrieve relevant cases from HelixDB
  const relevantCases: unknown[] = [];

  // In BACKTEST mode, skip HelixDB queries for faster execution
  if (ctx && isBacktest(ctx)) {
    return {
      relevantCases: [],
      regimeLabels,
    };
  }

  // Try to connect to HelixDB and retrieve similar cases
  try {
    const helixClient = getHelixClient();
    if (helixClient) {
      // Query for similar trade decisions for each instrument
      // Using the SearchSimilarDecisions query if available
      for (const symbol of snapshot.instruments) {
        try {
          // Build a simple query text from the market context
          const candles = snapshot.candles[symbol];
          const lastCandle = candles?.[candles.length - 1];
          const queryText = lastCandle
            ? `Trading ${symbol} at price ${lastCandle.close.toFixed(2)}`
            : `Trading ${symbol}`;

          const result = await helixClient.query<
            Array<{
              decision_id: string;
              instrument_id: string;
              action: string;
              regime_label: string;
              rationale_text: string;
              similarity_score?: number;
            }>
          >("SearchSimilarDecisions", {
            query_text: queryText,
            instrument_id: symbol,
            limit: 5,
          });

          if (result.data && result.data.length > 0) {
            relevantCases.push(
              ...result.data.map((d) => ({
                caseId: d.decision_id,
                symbol: d.instrument_id,
                action: d.action,
                regime: d.regime_label,
                rationale: d.rationale_text,
                similarity: d.similarity_score ?? 0,
              }))
            );
          }
        } catch {
          // Continue with other instruments if one query fails
        }
      }
    }
  } catch {
    // HelixDB unavailable - continue with empty cases
    // This is expected in BACKTEST mode or when HelixDB is not running
  }

  return {
    relevantCases,
    regimeLabels,
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
  const {
    cycleId,
    context,
    instruments = ["AAPL", "MSFT", "GOOGL"],
    useDraftConfig = false,
  } = input;

  // Load config (optional for stub mode, used for audit trail)
  const runtimeConfig = await loadRuntimeConfig(context, useDraftConfig);
  const configVersion = runtimeConfig?.trading.id ?? null;

  // Observe Phase
  const marketSnapshot = await fetchMarketSnapshot(instruments, context);

  // Orient Phase
  const _memoryContext = await loadMemoryContext(marketSnapshot, context);

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
    configVersion,
  };
}

// ============================================
// LLM Mode Execution (Real Mastra Agents)
// ============================================

async function executeTradingCycleLLM(input: WorkflowInput): Promise<WorkflowResult> {
  const {
    cycleId,
    context,
    instruments = ["AAPL", "MSFT", "GOOGL"],
    externalContext,
    useDraftConfig = false,
  } = input;

  // ============================================
  // Load runtime config from DB
  // ============================================
  const runtimeConfig = await loadRuntimeConfig(context, useDraftConfig);
  const configVersion = runtimeConfig?.trading.id ?? null;

  // Extract timeout values from config (or use defaults)
  const agentTimeoutMs = runtimeConfig?.trading.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const totalConsensusTimeoutMs =
    runtimeConfig?.trading.totalConsensusTimeoutMs ?? DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS;
  const maxConsensusIterations =
    runtimeConfig?.trading.maxConsensusIterations ?? DEFAULT_MAX_CONSENSUS_ITERATIONS;

  // Build agent configs from runtime config (model, temperature, maxTokens per agent)
  const agentConfigs = buildAgentConfigs(runtimeConfig);

  // Observe Phase
  const marketSnapshot = await fetchMarketSnapshot(instruments, context);

  // Orient Phase - Load memory and compute regimes in parallel
  const [memoryContext, regimeLabels] = await Promise.all([
    loadMemoryContext(marketSnapshot, context),
    computeAndStoreRegimes(marketSnapshot),
  ]);

  // Build agent context with external news, macro data, regime classifications, and agent configs
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
    agentConfigs,
  };

  // ============================================
  // Phase 1: Analysts (Parallel with timeout)
  // ============================================
  const analystsResult = await withAgentTimeout(
    runAnalystsParallel(agentContext),
    agentTimeoutMs * 3, // 3 agents running
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
      configVersion,
    };
  }
  analystOutputs = analystsResult.result;

  // ============================================
  // Phase 2: Debate (Parallel with timeout)
  // ============================================
  const debateResult = await withAgentTimeout(
    runDebateParallel(agentContext, analystOutputs),
    agentTimeoutMs * 2, // 2 agents running
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
      configVersion,
    };
  }
  debateOutputs = debateResult.result;

  // ============================================
  // Phase 3: Trader synthesizes plan
  // ============================================
  const traderResult = await withAgentTimeout(
    runTrader(agentContext, debateOutputs),
    agentTimeoutMs,
    "trader"
  );

  if (traderResult.timedOut) {
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Trader agent timed out"] },
      mode: "LLM",
      configVersion,
    };
  }
  const initialPlan = traderResult.result;

  // ============================================
  // Phase 4: Consensus Loop (Risk Manager + Critic)
  // Config values used: maxConsensusIterations, agentTimeoutMs, totalConsensusTimeoutMs
  // ============================================
  const gate = new ConsensusGate({
    maxIterations: maxConsensusIterations,
    logRejections: true,
    timeout: {
      perAgentMs: agentTimeoutMs,
      totalMs: totalConsensusTimeoutMs,
    },
    escalation: {
      enabled: !isBacktest(input.context),
    },
  });

  const consensusResult = await runConsensusLoop(
    gate,
    initialPlan,
    // getApproval function (passes agent configs for model settings)
    async (plan: DecisionPlan) => {
      const result = await runApprovalParallel(
        plan,
        analystOutputs,
        debateOutputs,
        undefined, // portfolioState
        undefined, // constraints
        undefined, // factorZooContext
        agentConfigs
      );
      return result;
    },
    // revisePlan function (passes agent configs for model settings)
    async (plan: DecisionPlan, rejectionReasons: string[]) => {
      return revisePlan(plan, rejectionReasons, analystOutputs, debateOutputs, agentConfigs);
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
    configVersion,
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
  const useStub = input.forceStub || isBacktest(input.context);

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
