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

// Provider clients
export * from "./providers";

// Option chain scanning
export {
  buildOptionTicker,
  calculateDte,
  DEFAULT_FILTERS,
  type GreeksProvider,
  type OptionFilterCriteria,
  type OptionGreeks,
  type OptionType,
  type OptionWithMarketData,
  OptionChainScanner,
  OptionWithMarketDataSchema,
  parseOptionTicker,
  type ScoringWeights,
} from "./optionChain";

// Candle ingestion
export {
  aggregateCandles,
  CandleIngestionService,
  CandleSchema,
  checkStaleness,
  TimeframeSchema,
  type Candle,
  type CandleStorage,
  type GapInfo,
  type IngestionOptions,
  type IngestionResult,
  type StalenessResult,
  type Timeframe,
} from "./ingestion";

// Data quality validation
export {
  // Staleness detection
  checkStaleness as checkDataStaleness,
  checkMultipleStaleness,
  getStaleSymbols,
  isFresh,
  DEFAULT_STALENESS_THRESHOLDS,
  type StalenessThresholds,
  type StalenessCheckResult,

  // Gap detection
  detectGaps,
  fillGaps,
  interpolateCandle,
  shouldInterpolate,
  getExtendedGaps,
  getExpectedIntervalMs,
  type GapDetectionResult,
  type InterpolatedCandle,

  // Anomaly detection
  detectVolumeAnomalies,
  detectPriceSpikes,
  detectFlashCrashes,
  detectAllAnomalies,
  filterAnomalousCandles,
  DEFAULT_ANOMALY_CONFIG,
  type Anomaly,
  type AnomalyType,
  type AnomalyDetectionConfig,
  type AnomalyDetectionResult,

  // Trading calendar
  isWeekend,
  isHoliday,
  isEarlyClose,
  isTradingDay,
  isMarketOpen,
  getNextTradingDay,
  getPreviousTradingDay,
  getTradingDaysBetween,
  isExpectedGap,
  DEFAULT_US_CALENDAR,
  US_MARKET_HOURS,
  US_EXTENDED_HOURS,
  US_MARKET_HOLIDAYS_2024_2026,
  US_EARLY_CLOSES_2024_2026,
  type MarketHours,
  type MarketCalendarConfig,

  // Combined validation
  validateCandleData,
  isValidCandleData,
  getQualityScore,
  DEFAULT_VALIDATION_CONFIG,
  type ValidationConfig,
  type ValidationIssue,
  type ValidationResult,
} from "./validation";

// Corporate actions
export {
  // Split adjustments
  type SplitAdjustment,
  type AdjustedCandle,
  type CandleWithTimestamp,
  calculateSplitRatio,
  toSplitAdjustment,
  adjustPrice,
  adjustVolume,
  calculateCumulativeAdjustmentFactor,
  getApplicableSplits,
  adjustCandleForSplits,
  adjustCandlesForSplits,
  unadjustPrice,

  // Dividend adjustments
  type DividendInfo,
  type DividendAdjustedReturn,
  toDividendInfo,
  calculateDividendYield,
  calculateAnnualizedYield,
  getDividendsFromDate,
  getDividendsInRange,
  sumDividends,
  calculateDividendAdjustedReturn,
  adjustPriceForDividend,
  calculateDRIPShares,
  isSpecialDividend,
  getRegularDividends,
  getSpecialDividends,
  getUpcomingDividends,
  getDividendsGoingExWithin,
} from "./corporate-actions";

/**
 * Package version.
 */
export const MARKETDATA_VERSION = "0.1.0";
