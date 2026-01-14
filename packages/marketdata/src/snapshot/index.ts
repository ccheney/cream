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
	type BuildSnapshotOptions,
	buildSnapshot,
	buildSnapshots,
	type CandleDataSource,
	compactSnapshot,
	createMockCandleSource,
	createMockEventSource,
	createMockUniverseSource,
	type ExternalEventSource,
	getSnapshotSummary,
	type SnapshotDataSources,
	serializeSnapshot,
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
	type Candle,
	CandleSchema,
	type CandlesByTimeframe,
	CandlesByTimeframeSchema,
	classifyMarketCap,
	DEFAULT_SNAPSHOT_CONFIG,
	type ExternalEventSummary,
	ExternalEventSummarySchema,
	ExternalEventTypeSchema,
	type FeatureSnapshot,
	FeatureSnapshotSchema,
	type IndicatorValues,
	IndicatorValuesSchema,
	isValidFeatureSnapshot,
	type MarketCapBucket,
	MarketCapBucketSchema,
	type NormalizedValues,
	NormalizedValuesSchema,
	parseFeatureSnapshot,
	type RegimeClassification,
	RegimeClassificationSchema,
	type RegimeLabel,
	RegimeLabelSchema,
	type SnapshotBuilderConfig,
	SnapshotBuilderConfigSchema,
	type Timeframe,
	TimeframeSchema,
	type UniverseMetadata,
	UniverseMetadataSchema,
} from "./schema";
