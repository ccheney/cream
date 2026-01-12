/**
 * Market Data Package
 *
 * Unified API clients for all market data providers.
 *
 * Primary provider: Alpaca Markets (Algo Trader Plus) for unified market data.
 *
 * @example
 * ```ts
 * import {
 *   createAlpacaClientFromEnv,
 *   createAlpacaStocksClientFromEnv,
 *   createFmpClientFromEnv,
 *   createAlphaVantageClientFromEnv,
 * } from "@cream/marketdata";
 *
 * // Alpaca REST API (candles, quotes, options)
 * const alpaca = createAlpacaClientFromEnv();
 * const bars = await alpaca.getBars("AAPL", "1Hour", "2026-01-01", "2026-01-05");
 * const quotes = await alpaca.getQuotes(["AAPL", "MSFT"]);
 * const options = await alpaca.getOptionSnapshots(["AAPL250117C00150000"]);
 *
 * // Alpaca WebSocket (real-time streaming)
 * const ws = createAlpacaStocksClientFromEnv("sip");
 * await ws.connect();
 * ws.on((event) => {
 *   if (event.type === "quote") {
 *     console.log(`${event.message.S}: $${event.message.bp}/$${event.message.ap}`);
 *   }
 * });
 * ws.subscribe("quotes", ["AAPL", "MSFT"]);
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
 * @see docs/plans/31-alpaca-data-consolidation.md
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
  AlpacaMarketDataAdapter,
  createMarketDataAdapter,
  getMarketDataAdapter,
  isMarketDataAvailable,
  type MarketDataAdapter,
  MarketDataConfigError,
  MockMarketDataAdapter,
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
// Options IV solver and realtime provider
export {
  buildOptionSymbol,
  calculateGreeks,
  calculateMoneyness,
  calculateOptionsExposure,
  createEmptyExposure,
  createRealtimeOptionsProvider,
  daysToYears,
  formatExposure,
  getMoneyStatus,
  type IVSolverInput,
  type IVSolverResult,
  normalCDF,
  normalPDF,
  type OpraQuoteMessage,
  OpraQuoteMessageSchema,
  type OpraTradeMessage,
  OpraTradeMessageSchema,
  type OptionGreeks as BlackScholesGreeks,
  type OptionPosition,
  type OptionsDataProvider,
  type OptionsExposure,
  type OptionType as OptionsModuleOptionType,
  parseOptionSymbol,
  RealtimeOptionsProvider,
  type RealtimeOptionsProviderConfig,
  type SymbolExposure,
  solveIV,
  solveIVFromQuote,
  timeToExpiry,
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
  US_EXTENDED_HOURS,
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
