/**
 * Prediction Markets Types
 *
 * Shared types for prediction markets integration with Kalshi and Polymarket.
 */

import { z } from "zod";

// ============================================
// Platform and Market Type Enums
// ============================================

export const PlatformSchema = z.enum(["KALSHI", "POLYMARKET"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const MarketTypeSchema = z.enum([
  "FED_RATE",
  "ECONOMIC_DATA",
  "RECESSION",
  "GEOPOLITICAL",
  "REGULATORY",
  "ELECTION",
]);
export type MarketType = z.infer<typeof MarketTypeSchema>;

// ============================================
// Market Outcome Schema
// ============================================

export const MarketOutcomeSchema = z.object({
  outcome: z.string(), // "25bps cut"
  probability: z.number().min(0).max(1),
  price: z.number(),
  volume24h: z.number().optional(),
});
export type MarketOutcome = z.infer<typeof MarketOutcomeSchema>;

// ============================================
// Prediction Market Event Schema
// ============================================

export const PredictionMarketEventSchema = z.object({
  eventId: z.string(), // "pm_kalshi_fed_jan26"
  eventType: z.literal("PREDICTION_MARKET"),
  eventTime: z.string(), // Resolution time (ISO 8601)
  payload: z.object({
    platform: PlatformSchema,
    marketType: MarketTypeSchema,
    marketTicker: z.string(), // "KXFED-26JAN29"
    marketQuestion: z.string(), // "Will Fed cut rates in Jan 2026?"
    outcomes: z.array(MarketOutcomeSchema),
    lastUpdated: z.string(), // ISO 8601
    openInterest: z.number().optional(),
    volume24h: z.number().optional(),
    liquidityScore: z.number().min(0).max(1).optional(),
  }),
  relatedInstrumentIds: z.array(z.string()), // ["XLF", "TLT", "IYR"]
});
export type PredictionMarketEvent = z.infer<typeof PredictionMarketEventSchema>;

// ============================================
// Prediction Market Scores Schema
// ============================================

export const PredictionMarketScoresSchema = z.object({
  // Fed/Macro Signals
  fedCutProbability: z.number().min(0).max(1).optional(),
  fedHikeProbability: z.number().min(0).max(1).optional(),
  recessionProbability12m: z.number().min(0).max(1).optional(),

  // Economic Surprise Indicators
  cpiSurpriseDirection: z.number().min(-1).max(1).optional(), // -1 below, +1 above
  gdpSurpriseDirection: z.number().min(-1).max(1).optional(),

  // Policy Uncertainty
  shutdownProbability: z.number().min(0).max(1).optional(),
  tariffEscalationProbability: z.number().min(0).max(1).optional(),

  // Aggregate Signals
  macroUncertaintyIndex: z.number().min(0).max(1).optional(),
  policyEventRisk: z.number().min(0).max(1).optional(),
});
export type PredictionMarketScores = z.infer<typeof PredictionMarketScoresSchema>;

// ============================================
// Provider Client Interface
// ============================================

export interface PredictionMarketProvider {
  readonly platform: Platform;
  fetchMarkets(marketTypes: MarketType[]): Promise<PredictionMarketEvent[]>;
  fetchMarketByTicker(ticker: string): Promise<PredictionMarketEvent | null>;
  calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores;
}

// ============================================
// Aggregator Types
// ============================================

export interface AggregatedMarketData {
  events: PredictionMarketEvent[];
  scores: PredictionMarketScores;
  lastUpdated: string;
  platforms: Platform[];
}

export const AggregatedMarketDataSchema = z.object({
  events: z.array(PredictionMarketEventSchema),
  scores: PredictionMarketScoresSchema,
  lastUpdated: z.string(),
  platforms: z.array(PlatformSchema),
});

// ============================================
// Error Types
// ============================================

export class PredictionMarketError extends Error {
  constructor(
    message: string,
    public readonly platform: Platform | "AGGREGATOR",
    public readonly code: string,
    public override readonly cause?: Error
  ) {
    super(message, { cause });
    this.name = "PredictionMarketError";
  }
}

export class RateLimitError extends PredictionMarketError {
  constructor(
    platform: Platform,
    public readonly retryAfterMs: number
  ) {
    super(`Rate limit exceeded for ${platform}`, platform, "RATE_LIMIT");
  }
}

export class AuthenticationError extends PredictionMarketError {
  constructor(platform: Platform, message: string) {
    super(message, platform, "AUTH_ERROR");
  }
}
