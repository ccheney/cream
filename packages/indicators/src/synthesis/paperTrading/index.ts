/**
 * Paper Trading Validation Module
 *
 * Validates indicators in live market conditions before production promotion.
 * Compares realized performance to backtested expectations over a minimum
 * 30-day period.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 889-1025)
 */

// Evaluation Functions
export {
  aggregatePaperTradingResults,
  canEvaluatePaperTrading,
  daysUntilEvaluation,
  determinePaperTradingAction,
  evaluatePaperTrading,
} from "./evaluation.js";
// Statistical Functions
export { calculateRealizedMetrics, tradingDaysBetween } from "./statistics.js";
// Types and Schemas
export {
  type ActionConfidence,
  type ActionRecommendation,
  type AggregatedResults,
  type BacktestedMetrics,
  BacktestedMetricsSchema,
  PAPER_TRADING_DEFAULTS,
  type PaperSignal,
  PaperSignalSchema,
  type PaperTradingAction,
  type PaperTradingConfig,
  PaperTradingConfigSchema,
  type PaperTradingResult,
  PaperTradingResultSchema,
  type PaperTradingStatus,
  type RealizedMetrics,
  RealizedMetricsSchema,
} from "./types.js";
