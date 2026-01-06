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
// Type Exports
// ============================================

export type {
  // Aggregator types
  AggregatedMarketData,
  // Core types
  MarketOutcome,
  MarketType,
  // Enums
  Platform,
  PredictionMarketEvent,
  // Provider interface
  PredictionMarketProvider,
  PredictionMarketScores,
} from "./types";

// ============================================
// Schema Exports
// ============================================

export {
  // Aggregator schemas
  AggregatedMarketDataSchema,
  AuthenticationError,
  // Core schemas
  MarketOutcomeSchema,
  MarketTypeSchema,
  // Enum schemas
  PlatformSchema,
  // Error classes
  PredictionMarketError,
  PredictionMarketEventSchema,
  PredictionMarketScoresSchema,
  RateLimitError,
} from "./types";
