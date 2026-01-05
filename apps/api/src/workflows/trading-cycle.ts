/**
 * Trading Cycle Workflow
 *
 * Implements the hourly OODA loop:
 * - Observe: Fetch market snapshot
 * - Orient: Load memory context
 * - Decide: Run agents and generate plan
 * - Act: Submit orders via Rust execution engine
 *
 * For Phase 4, this is a simplified implementation without full Mastra integration.
 * Full Mastra workflow will be added in Phase 8 when real LLM agents are integrated.
 *
 * @see docs/plans/05-agents.md
 */

import { z } from "zod";

// ============================================
// Types
// ============================================

export interface WorkflowInput {
  cycleId: string;
  instruments?: string[];
}

export interface MarketSnapshot {
  instruments: string[];
  candles: Record<string, unknown>;
  quotes: Record<string, unknown>;
}

export interface MemoryContext {
  relevantCases: unknown[];
  regimeLabels: Record<string, string>;
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

export interface DecisionPlan {
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
  decisionPlan?: DecisionPlan;
  riskApproval?: Approval;
  criticApproval?: Approval;
  constraintCheck?: { passed: boolean; violations: string[] };
  orderSubmission?: { submitted: boolean; orderIds: string[]; errors: string[] };
}

export interface WorkflowResult {
  cycleId: string;
  approved: boolean;
  orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
}

// ============================================
// Workflow Steps (Stub Implementations)
// ============================================

async function fetchMarketSnapshot(instruments: string[]): Promise<MarketSnapshot> {
  console.log("[Observe] Fetching market snapshot...");
  // STUB: Return mock market data
  return {
    instruments,
    candles: {},
    quotes: {},
  };
}

async function loadMemoryContext(snapshot: MarketSnapshot): Promise<MemoryContext> {
  console.log("[Orient] Loading memory context...");
  // STUB: Return mock memory context
  return {
    relevantCases: [],
    regimeLabels: Object.fromEntries(snapshot.instruments.map((i) => [i, "RANGE"])),
  };
}

async function runTechnicalAnalyst(instruments: string[]): Promise<TechnicalAnalysis[]> {
  console.log("[Decide] Running Technical Analyst...");
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

async function runNewsAnalyst(instruments: string[]): Promise<SentimentAnalysis[]> {
  console.log("[Decide] Running News Analyst...");
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    event_impacts: [],
    overall_sentiment: "NEUTRAL",
    sentiment_strength: 0.5,
    duration_expectation: "DAYS",
    linked_event_ids: [],
  }));
}

async function runFundamentalsAnalyst(instruments: string[]): Promise<FundamentalsAnalysis[]> {
  console.log("[Decide] Running Fundamentals Analyst...");
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

async function runBullishResearcher(instruments: string[]): Promise<Research[]> {
  console.log("[Decide] Running Bullish Researcher...");
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Potential for breakout if resistance breaks.",
    supporting_factors: [{ factor: "Strong earnings", source: "FUNDAMENTAL", strength: "MODERATE" }],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "High valuation limits upside",
  }));
}

async function runBearishResearcher(instruments: string[]): Promise<Research[]> {
  console.log("[Decide] Running Bearish Researcher...");
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Elevated valuation creates downside risk.",
    supporting_factors: [{ factor: "High P/E", source: "FUNDAMENTAL", strength: "MODERATE" }],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "Strong earnings momentum",
  }));
}

async function runTraderAgent(
  cycleId: string,
  bullish: Research[],
  bearish: Research[]
): Promise<DecisionPlan> {
  console.log("[Decide] Running Trader Agent...");
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

async function runRiskManager(plan: DecisionPlan): Promise<Approval> {
  console.log("[Decide] Running Risk Manager...");
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    notes: "HOLD decisions carry no new risk.",
  };
}

async function runCritic(plan: DecisionPlan): Promise<Approval> {
  console.log("[Decide] Running Critic...");
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
  console.log("[Act] Checking constraints via Rust gRPC...");
  if (!approved) {
    return { passed: false, violations: ["Plan not approved by agents"] };
  }
  // STUB: Would call Rust gRPC CheckConstraints
  return { passed: true, violations: [] };
}

async function submitOrders(
  constraintsPassed: boolean
): Promise<{ submitted: boolean; orderIds: string[]; errors: string[] }> {
  console.log("[Act] Submitting orders via Rust gRPC...");
  if (!constraintsPassed) {
    return { submitted: false, orderIds: [], errors: ["Constraints not passed"] };
  }
  // STUB: Would call Rust gRPC SubmitOrders
  // For HOLD decisions, no orders to submit
  return { submitted: true, orderIds: [], errors: [] };
}

// ============================================
// Main Workflow Execution
// ============================================

/**
 * Execute the trading cycle workflow.
 *
 * @param input - Workflow input containing cycleId and optional instruments
 * @returns Workflow result with approval status and order submission details
 */
export async function executeTradingCycle(input: WorkflowInput): Promise<WorkflowResult> {
  const { cycleId, instruments = ["AAPL", "MSFT", "GOOGL"] } = input;

  console.log(`\n============================================================`);
  console.log(`[Workflow] Starting trading cycle: ${cycleId}`);
  console.log(`[Workflow] Instruments: ${instruments.join(", ")}`);
  console.log(`============================================================\n`);

  // ============================================
  // Observe Phase
  // ============================================
  const marketSnapshot = await fetchMarketSnapshot(instruments);

  // ============================================
  // Orient Phase
  // ============================================
  const memoryContext = await loadMemoryContext(marketSnapshot);

  // ============================================
  // Decide Phase - Analysts (Parallel)
  // ============================================
  const [technicalAnalysis, sentimentAnalysis, fundamentalsAnalysis] = await Promise.all([
    runTechnicalAnalyst(instruments),
    runNewsAnalyst(instruments),
    runFundamentalsAnalyst(instruments),
  ]);

  // ============================================
  // Decide Phase - Researchers (Parallel)
  // ============================================
  const [bullishResearch, bearishResearch] = await Promise.all([
    runBullishResearcher(instruments),
    runBearishResearcher(instruments),
  ]);

  // ============================================
  // Decide Phase - Trader
  // ============================================
  const decisionPlan = await runTraderAgent(cycleId, bullishResearch, bearishResearch);

  // ============================================
  // Decide Phase - Approvers (Parallel)
  // ============================================
  const [riskApproval, criticApproval] = await Promise.all([
    runRiskManager(decisionPlan),
    runCritic(decisionPlan),
  ]);

  const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";
  console.log(`[Decide] Consensus: ${approved ? "APPROVED" : "REJECTED"}`);

  // ============================================
  // Act Phase - Constraints and Orders
  // ============================================
  const constraintCheck = await checkConstraints(approved);
  const orderSubmission = await submitOrders(constraintCheck.passed);

  console.log(`\n============================================================`);
  console.log(`[Workflow] Cycle ${cycleId} complete`);
  console.log(`[Workflow] Orders submitted: ${orderSubmission.submitted}`);
  console.log(`============================================================\n`);

  return {
    cycleId,
    approved,
    orderSubmission,
  };
}

/**
 * Workflow object for Mastra-like interface.
 * This will be replaced with real Mastra workflow in Phase 8.
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

