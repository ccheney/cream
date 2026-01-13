/**
 * Trading Cycle Workflow
 *
 * Mastra-native trading cycle implementation using createWorkflow().
 *
 * Features:
 * - Sequential OODA loop: Observe → Orient → Analysts → Debate → Trader → Consensus → Act
 * - Uses Mastra workflow primitives (.then() chaining)
 * - State management via MinimalStateSchema
 * - STUB mode for backtest, LLM mode for paper/live
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

// Re-export types from steps module for external consumers
export type {
  AgentStatusEvent,
  Approval,
  CandleData,
  Decision,
  ExternalContext,
  FundamentalsAnalysis,
  IndicatorTriggerResult,
  MarketSnapshot,
  MemoryContext,
  PredictionMarketSignals,
  QuoteData,
  RegimeData,
  Research,
  ResearchTriggerResult,
  SentimentAnalysis,
  ThesisUpdate,
  WorkflowDecisionPlan,
  WorkflowState,
} from "../steps/trading-cycle/index.js";
// Workflow and schemas
export type { WorkflowInput, WorkflowResult } from "./schemas.js";
export { WorkflowInputSchema, WorkflowResultSchema } from "./schemas.js";
export { tradingCycleWorkflow } from "./workflow.js";
