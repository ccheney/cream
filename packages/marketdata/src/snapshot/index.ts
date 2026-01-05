/**
 * Feature Snapshot Module
 *
 * Aggregates candles, indicators, normalized features, and regime labels
 * into a single context object for agent consumption.
 *
 * @example
 * ```typescript
 * import {
 *   buildSnapshot,
 *   SnapshotCache,
 *   FeatureSnapshotSchema,
 * } from "@cream/marketdata/snapshot";
 *
 * // Build a snapshot for a symbol
 * const snapshot = await buildSnapshot("AAPL", Date.now(), {
 *   candles: myCandleSource,
 *   events: myEventSource,
 *   universe: myUniverseSource,
 * });
 *
 * // Access the data
 * console.log(snapshot.regime.regime); // "BULL_TREND"
 * console.log(snapshot.indicators["rsi_14_1h"]); // 65.5
 * ```
 */

// Builder
export {
  buildSnapshot,
  buildSnapshots,
  compactSnapshot,
  createMockCandleSource,
  createMockEventSource,
  createMockUniverseSource,
  getSnapshotSummary,
  serializeSnapshot,
  type BuildSnapshotOptions,
  type CandleDataSource,
  type ExternalEventSource,
  type SnapshotDataSources,
  type UniverseMetadataSource,
} from "./builder";

// Cache
export {
  DEFAULT_CACHE_CONFIG,
  getGlobalCache,
  resetGlobalCache,
  SnapshotCache,
  type SnapshotCacheConfig,
} from "./cache";

// Schema
export {
  CandleSchema,
  CandlesByTimeframeSchema,
  classifyMarketCap,
  DEFAULT_SNAPSHOT_CONFIG,
  ExternalEventSummarySchema,
  ExternalEventTypeSchema,
  FeatureSnapshotSchema,
  IndicatorValuesSchema,
  isValidFeatureSnapshot,
  MarketCapBucketSchema,
  NormalizedValuesSchema,
  parseFeatureSnapshot,
  RegimeClassificationSchema,
  RegimeLabelSchema,
  SnapshotBuilderConfigSchema,
  TimeframeSchema,
  UniverseMetadataSchema,
  type Candle,
  type CandlesByTimeframe,
  type ExternalEventSummary,
  type FeatureSnapshot,
  type IndicatorValues,
  type MarketCapBucket,
  type NormalizedValues,
  type RegimeClassification,
  type RegimeLabel,
  type SnapshotBuilderConfig,
  type Timeframe,
  type UniverseMetadata,
} from "./schema";
