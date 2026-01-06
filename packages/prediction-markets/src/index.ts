/**
 * @cream/prediction-markets
 *
 * Prediction markets integration for Cream trading system.
 * Aggregates probability data from Kalshi and Polymarket to provide
 * macro-level signals for trading decisions.
 *
 * @example
 * ```typescript
 * import {
 *   PredictionMarketEventSchema,
 *   PredictionMarketScoresSchema,
 *   type PredictionMarketEvent,
 *   type PredictionMarketScores,
 * } from "@cream/prediction-markets";
 * ```
 */

export const PACKAGE_NAME = "@cream/prediction-markets";
export const VERSION = "0.0.1";

// ============================================
// Schema & Type Exports (from @cream/domain)
// ============================================

export {
  // Aggregated data
  type AggregatedPredictionData,
  AggregatedPredictionDataSchema,
  // Helper functions
  createEmptyPredictionScores,
  getFedDirection,
  hasHighMacroUncertainty,
  hasHighPolicyRisk,
  // Aliases for convenience
  type MarketOutcome,
  MarketOutcomeSchema,
  type MarketType,
  MarketTypeSchema,
  type Platform,
  PlatformSchema,
  // Core types
  type PredictionMarketEvent,
  PredictionMarketEventSchema,
  type PredictionMarketPayload,
  PredictionMarketPayloadSchema,
  type PredictionMarketScores,
  PredictionMarketScoresSchema,
  PredictionMarketType,
  type PredictionOutcome,
  PredictionOutcomeSchema,
  PredictionPlatform,
  toNumericScores,
} from "./types";

// ============================================
// Provider & Error Exports
// ============================================

export {
  // Error classes
  AuthenticationError,
  PredictionMarketError,
  // Provider interface
  type PredictionMarketProvider,
  RateLimitError,
} from "./types";
