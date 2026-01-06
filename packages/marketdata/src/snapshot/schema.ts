/**
 * Feature Snapshot Schema
 *
 * Zod schemas for type-safe feature snapshots used by trading agents.
 * Aggregates candles, indicators, transforms, regime labels, and external events.
 *
 * @see docs/plans/02-data-layer.md - Feature Computation
 */

import { z } from "zod";

// ============================================
// Timeframe Schema
// ============================================

/**
 * Supported timeframes for candle data.
 */
export const TimeframeSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

// ============================================
// Candle Schema
// ============================================

/**
 * OHLCV candle data.
 */
export const CandleSchema = z.object({
  timestamp: z.number().describe("Unix timestamp in milliseconds"),
  open: z.number().describe("Opening price"),
  high: z.number().describe("Highest price"),
  low: z.number().describe("Lowest price"),
  close: z.number().describe("Closing price"),
  volume: z.number().describe("Volume traded"),
});

export type Candle = z.infer<typeof CandleSchema>;

/**
 * Candles by timeframe.
 */
export const CandlesByTimeframeSchema = z.record(TimeframeSchema, z.array(CandleSchema));
export type CandlesByTimeframe = z.infer<typeof CandlesByTimeframeSchema>;

// ============================================
// Indicator Schema
// ============================================

/**
 * Named indicator values.
 * Key format: {indicator}_{param}_{timeframe} (e.g., "rsi_14_1h", "sma_20_1d")
 */
export const IndicatorValuesSchema = z.record(z.string(), z.number().nullable());
export type IndicatorValues = z.infer<typeof IndicatorValuesSchema>;

// ============================================
// Transform/Normalized Schema
// ============================================

/**
 * Normalized values from transforms.
 * Key format: {transform}_{indicator}_{param}_{timeframe}
 * Examples: "zscore_rsi_14_1h", "pctrank_close_100_1d"
 */
export const NormalizedValuesSchema = z.record(z.string(), z.number().nullable());
export type NormalizedValues = z.infer<typeof NormalizedValuesSchema>;

// ============================================
// Regime Schema
// ============================================

/**
 * Market regime labels.
 */
export const RegimeLabelSchema = z.enum([
  "BULL_TREND",
  "BEAR_TREND",
  "RANGE",
  "HIGH_VOL",
  "LOW_VOL",
  "UNKNOWN",
]);
export type RegimeLabel = z.infer<typeof RegimeLabelSchema>;

/**
 * Regime classification result.
 */
export const RegimeClassificationSchema = z.object({
  regime: RegimeLabelSchema.describe("Primary regime classification"),
  confidence: z.number().min(0).max(1).describe("Classification confidence (0-1)"),
  features: z
    .object({
      returns: z.number().optional(),
      volatility: z.number().optional(),
      volumeZScore: z.number().optional(),
      trendStrength: z.number().optional(),
    })
    .optional()
    .describe("Feature values used for classification"),
  secondaryRegime: RegimeLabelSchema.optional().describe("Secondary regime if confidence is split"),
});

export type RegimeClassification = z.infer<typeof RegimeClassificationSchema>;

// ============================================
// External Event Schema
// ============================================

/**
 * External event type.
 */
export const ExternalEventTypeSchema = z.enum([
  "EARNINGS",
  "MACRO",
  "NEWS",
  "SENTIMENT_SPIKE",
  "FED_MEETING",
  "ECONOMIC_RELEASE",
]);

/**
 * External event summary for snapshot.
 */
export const ExternalEventSummarySchema = z.object({
  eventId: z.string().describe("Event identifier"),
  eventType: z.string().describe("Event type"),
  eventTime: z.string().describe("ISO-8601 timestamp"),
  summary: z.string().optional().describe("Text summary"),
  sentimentScore: z.number().min(-1).max(1).optional().describe("Sentiment score (-1 to 1)"),
  importanceScore: z.number().min(0).max(1).optional().describe("Importance score (0-1)"),
});

export type ExternalEventSummary = z.infer<typeof ExternalEventSummarySchema>;

// ============================================
// Universe Metadata Schema
// ============================================

/**
 * Market cap bucket classification.
 */
export const MarketCapBucketSchema = z.enum(["MEGA", "LARGE", "MID", "SMALL", "MICRO"]);
export type MarketCapBucket = z.infer<typeof MarketCapBucketSchema>;

/**
 * Universe metadata for the instrument.
 */
export const UniverseMetadataSchema = z.object({
  symbol: z.string().describe("Ticker symbol"),
  name: z.string().optional().describe("Company name"),
  sector: z.string().optional().describe("Sector classification"),
  industry: z.string().optional().describe("Industry classification"),
  marketCap: z.number().optional().describe("Market capitalization"),
  marketCapBucket: MarketCapBucketSchema.optional().describe("Market cap bucket"),
  avgVolume: z.number().optional().describe("Average daily volume"),
  price: z.number().optional().describe("Current price"),
});

export type UniverseMetadata = z.infer<typeof UniverseMetadataSchema>;

// ============================================
// Feature Snapshot Schema
// ============================================

/**
 * Complete feature snapshot for agent consumption.
 *
 * This aggregates all features for a single symbol at a point in time:
 * - Latest candles across multiple timeframes
 * - Technical indicators
 * - Normalized/transformed values
 * - Regime classification
 * - Recent external events
 * - Universe metadata
 */
export const FeatureSnapshotSchema = z.object({
  // Identification
  symbol: z.string().describe("Ticker symbol"),
  timestamp: z.number().describe("Unix timestamp in milliseconds"),
  createdAt: z.string().describe("ISO-8601 creation timestamp"),

  // Candle data
  candles: CandlesByTimeframeSchema.describe("Recent candles by timeframe"),

  // Latest price info
  latestPrice: z.number().describe("Most recent close price"),
  latestVolume: z.number().describe("Most recent volume"),

  // Technical indicators
  indicators: IndicatorValuesSchema.describe("Named indicator values"),

  // Normalized values
  normalized: NormalizedValuesSchema.describe("Normalized/transformed values"),

  // Regime classification
  regime: RegimeClassificationSchema.describe("Current market regime"),

  // External events
  recentEvents: z.array(ExternalEventSummarySchema).describe("Recent external events"),

  // Universe metadata
  metadata: UniverseMetadataSchema.describe("Instrument metadata"),

  // Configuration used
  config: z
    .object({
      lookbackWindow: z.number().describe("Lookback window in candles"),
      timeframes: z.array(TimeframeSchema).describe("Timeframes included"),
      eventLookbackHours: z.number().describe("Event lookback in hours"),
    })
    .describe("Configuration used to build snapshot"),
});

export type FeatureSnapshot = z.infer<typeof FeatureSnapshotSchema>;

// ============================================
// Builder Configuration Schema
// ============================================

/**
 * Feature snapshot builder configuration.
 */
export const SnapshotBuilderConfigSchema = z.object({
  /** Lookback window in candles (default: 100) */
  lookbackWindow: z.number().int().positive().default(100),

  /** Timeframes to include (default: ["1h", "4h", "1d"]) */
  timeframes: z.array(TimeframeSchema).default(["1h", "4h", "1d"]),

  /** Event lookback in hours (default: 72) */
  eventLookbackHours: z.number().int().positive().default(72),

  /** Maximum events to include (default: 10) */
  maxEvents: z.number().int().positive().default(10),

  /** Whether to include normalized values (default: true) */
  includeNormalized: z.boolean().default(true),

  /** Whether to include external events (default: true) */
  includeEvents: z.boolean().default(true),
});

export type SnapshotBuilderConfig = z.infer<typeof SnapshotBuilderConfigSchema>;

/**
 * Default builder configuration.
 */
export const DEFAULT_SNAPSHOT_CONFIG: Required<SnapshotBuilderConfig> = {
  lookbackWindow: 100,
  timeframes: ["1h", "4h", "1d"],
  eventLookbackHours: 72,
  maxEvents: 10,
  includeNormalized: true,
  includeEvents: true,
};

// ============================================
// Utility Functions
// ============================================

/**
 * Classify market cap into bucket.
 */
export function classifyMarketCap(marketCap: number | undefined): MarketCapBucket | undefined {
  if (marketCap === undefined) {
    return undefined;
  }

  if (marketCap >= 200_000_000_000) {
    return "MEGA"; // $200B+
  }
  if (marketCap >= 10_000_000_000) {
    return "LARGE"; // $10B+
  }
  if (marketCap >= 2_000_000_000) {
    return "MID"; // $2B+
  }
  if (marketCap >= 300_000_000) {
    return "SMALL"; // $300M+
  }
  return "MICRO";
}

/**
 * Validate and parse a feature snapshot.
 */
export function parseFeatureSnapshot(data: unknown): FeatureSnapshot {
  return FeatureSnapshotSchema.parse(data);
}

/**
 * Check if a feature snapshot is valid.
 */
export function isValidFeatureSnapshot(data: unknown): data is FeatureSnapshot {
  return FeatureSnapshotSchema.safeParse(data).success;
}
