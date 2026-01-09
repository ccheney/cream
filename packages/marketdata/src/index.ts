/**
 * Market Data Package
 *
 * Unified API clients for all market data providers.
 *
 * @example
 * ```ts
 * import {
 *   createDatabentoClientFromEnv,
 *   createPolygonClientFromEnv,
 *   createFmpClientFromEnv,
 *   createAlphaVantageClientFromEnv,
 * } from "@cream/marketdata";
 *
 * // Execution-grade feed (real-time quotes, order book, trades)
 * const databento = createDatabentoClientFromEnv();
 * await databento.connect();
 * databento.on((event) => {
 *   if (event.type === "message") {
 *     console.log("Market data:", event.message);
 *   }
 * });
 * await databento.subscribe({
 *   dataset: "XNAS.ITCH",
 *   schema: "mbp-1",
 *   symbols: ["AAPL", "MSFT"],
 * });
 *
 * // Cognitive feed (candles, options)
 * const polygon = createPolygonClientFromEnv();
 * const candles = await polygon.getAggregates("AAPL", 1, "hour", "2026-01-01", "2026-01-05");
 *
 * // Fundamentals (transcripts, filings)
 * const fmp = createFmpClientFromEnv();
 * const transcripts = await fmp.getEarningsTranscript("AAPL", 4, 2025);
 *
 * // Macro indicators
 * const av = createAlphaVantageClientFromEnv();
 * const yields = await av.getTreasuryYield("10year", "daily");
 * ```
 *
 * @see docs/plans/02-data-layer.md
 */

// Base client
export {
  type ApiError,
  type ClientConfig,
  createRestClient,
  DEFAULT_RATE_LIMIT,
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT_MS,
  type RateLimitConfig,
  RateLimiter,
  type RequestOptions,
  RestClient,
  type RetryConfig,
} from "./client";
// Corporate actions
export {
  type AdjustedCandle,
  adjustCandleForSplits,
  adjustCandlesForSplits,
  adjustPrice,
  adjustPriceForDividend,
  adjustVolume,
  type CandleWithTimestamp,
  calculateAnnualizedYield,
  calculateCumulativeAdjustmentFactor,
  calculateDividendAdjustedReturn,
  calculateDividendYield,
  calculateDRIPShares,
  calculateSplitRatio,
  type DividendAdjustedReturn,
  // Dividend adjustments
  type DividendInfo,
  getApplicableSplits,
  getDividendsFromDate,
  getDividendsGoingExWithin,
  getDividendsInRange,
  getRegularDividends,
  getSpecialDividends,
  getUpcomingDividends,
  isSpecialDividend,
  // Split adjustments
  type SplitAdjustment,
  sumDividends,
  toDividendInfo,
  toSplitAdjustment,
  unadjustPrice,
} from "./corporate-actions";
// Market data factory
export {
  type AdapterCandle,
  type AdapterQuote,
  createMarketDataAdapter,
  getMarketDataAdapter,
  isMarketDataAvailable,
  type MarketDataAdapter,
  MarketDataConfigError,
  MockMarketDataAdapter,
  PolygonMarketDataAdapter,
} from "./factory";
// Candle ingestion
export {
  aggregateCandles,
  type Candle,
  CandleIngestionService,
  CandleSchema,
  type CandleStorage,
  checkStaleness,
  type GapInfo,
  type IngestionOptions,
  type IngestionResult,
  type StalenessResult,
  type Timeframe,
  TimeframeSchema,
} from "./ingestion";
// Option chain scanning
export {
  buildOptionTicker,
  calculateDte,
  DEFAULT_FILTERS,
  type GreeksProvider,
  OptionChainScanner,
  type OptionFilterCriteria,
  type OptionGreeks,
  type OptionType,
  type OptionWithMarketData,
  OptionWithMarketDataSchema,
  parseOptionTicker,
  type ScoringWeights,
} from "./optionChain";
// Options Greeks calculation and portfolio exposure
export {
  calculateGreeks,
  calculateMoneyness,
  calculateOptionsExposure,
  createEmptyExposure,
  daysToYears,
  formatExposure,
  getMoneyStatus,
  normalCDF,
  normalPDF,
  type OptionGreeks as BlackScholesGreeks,
  type OptionPosition,
  type OptionsExposure,
  type OptionType as OptionsModuleOptionType,
  type SymbolExposure,
} from "./options";
// Provider clients
export * from "./providers";
// Feature snapshot builder
export {
  type BuildSnapshotOptions,
  // Builder
  buildSnapshot,
  buildSnapshots,
  type CandleDataSource,
  type CandlesByTimeframe,
  // Schema
  CandlesByTimeframeSchema,
  classifyMarketCap,
  compactSnapshot,
  createMockCandleSource,
  createMockEventSource,
  createMockUniverseSource,
  // Cache
  DEFAULT_CACHE_CONFIG,
  DEFAULT_SNAPSHOT_CONFIG,
  type ExternalEventSource,
  type ExternalEventSummary,
  ExternalEventSummarySchema,
  ExternalEventTypeSchema,
  type FeatureSnapshot,
  FeatureSnapshotSchema,
  getGlobalCache,
  getSnapshotSummary,
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
  resetGlobalCache,
  type SnapshotBuilderConfig,
  SnapshotBuilderConfigSchema,
  SnapshotCache,
  type SnapshotCacheConfig,
  type SnapshotDataSources,
  serializeSnapshot,
  type UniverseMetadata,
  UniverseMetadataSchema,
  type UniverseMetadataSource,
} from "./snapshot";
// Data quality validation
export {
  type Anomaly,
  type AnomalyDetectionConfig,
  type AnomalyDetectionResult,
  type AnomalyType,
  checkMultipleStaleness,
  // Staleness detection
  checkStaleness as checkDataStaleness,
  DEFAULT_ANOMALY_CONFIG,
  DEFAULT_STALENESS_THRESHOLDS,
  DEFAULT_US_CALENDAR,
  DEFAULT_VALIDATION_CONFIG,
  detectAllAnomalies,
  detectFlashCrashes,
  // Gap detection
  detectGaps,
  detectPriceSpikes,
  // Anomaly detection
  detectVolumeAnomalies,
  fillGaps,
  filterAnomalousCandles,
  type GapDetectionResult,
  getExpectedIntervalMs,
  getExtendedGaps,
  getNextTradingDay,
  getPreviousTradingDay,
  getQualityScore,
  getStaleSymbols,
  getTradingDaysBetween,
  type InterpolatedCandle,
  interpolateCandle,
  isEarlyClose,
  isExpectedGap,
  isFresh,
  isHoliday,
  isMarketOpen,
  isTradingDay,
  isValidCandleData,
  // Trading calendar
  isWeekend,
  type MarketCalendarConfig,
  type MarketHours,
  type StalenessCheckResult,
  type StalenessThresholds,
  shouldInterpolate,
  US_EARLY_CLOSES_2024_2026,
  US_EXTENDED_HOURS,
  US_MARKET_HOLIDAYS_2024_2026,
  US_MARKET_HOURS,
  type ValidationConfig,
  type ValidationIssue,
  type ValidationResult,
  // Combined validation
  validateCandleData,
} from "./validation";

/**
 * Package version.
 */
export const MARKETDATA_VERSION = "0.1.0";
