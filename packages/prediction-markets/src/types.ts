export {
  type AggregatedPredictionData,
  AggregatedPredictionDataSchema,
  createEmptyPredictionScores,
  getFedDirection,
  hasHighMacroUncertainty,
  hasHighPolicyRisk,
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
} from "@cream/domain";

export type Platform = import("@cream/domain").PredictionPlatform;
export type MarketType = import("@cream/domain").PredictionMarketType;
export type MarketOutcome = import("@cream/domain").PredictionOutcome;

import type {
  PredictionMarketEvent,
  PredictionMarketScores,
  PredictionMarketType,
  PredictionPlatform,
} from "@cream/domain";

export interface PredictionMarketProvider {
  readonly platform: PredictionPlatform;
  fetchMarkets(marketTypes: PredictionMarketType[]): Promise<PredictionMarketEvent[]>;
  fetchMarketByTicker(ticker: string): Promise<PredictionMarketEvent | null>;
  calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores;
}

export class PredictionMarketError extends Error {
  constructor(
    message: string,
    public readonly platform: PredictionPlatform | "AGGREGATOR",
    public readonly code: string,
    public override readonly cause?: Error
  ) {
    super(message, { cause });
    this.name = "PredictionMarketError";
  }
}

export class RateLimitError extends PredictionMarketError {
  constructor(
    platform: PredictionPlatform,
    public readonly retryAfterMs: number
  ) {
    super(`Rate limit exceeded for ${platform}`, platform, "RATE_LIMIT");
  }
}

export class AuthenticationError extends PredictionMarketError {
  constructor(platform: PredictionPlatform, message: string) {
    super(message, platform, "AUTH_ERROR");
  }
}
