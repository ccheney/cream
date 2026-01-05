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

/**
 * Package version.
 */
export const MARKETDATA_VERSION = "0.1.0";
