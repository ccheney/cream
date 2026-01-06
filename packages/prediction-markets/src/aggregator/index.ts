/**
 * Prediction Market Aggregator
 *
 * Aggregates data from multiple prediction market platforms
 * (Kalshi, Polymarket) into unified market signals.
 */

export const AGGREGATOR_VERSION = "0.0.1";

// Arbitrage Detector
export {
  type ArbitrageAlert,
  ArbitrageDetector,
  type ArbitrageDetectorConfig,
  type ArbitrageSummary,
  DEFAULT_ARBITRAGE_CONFIG,
} from "./arbitrage-detector";
// Market Matcher
export {
  DEFAULT_MATCHER_CONFIG,
  MarketMatcher,
  type MarketMatcherConfig,
  type MatchedMarket,
} from "./market-matcher";

// Unified Client
export {
  createUnifiedClient,
  DEFAULT_UNIFIED_CONFIG,
  type EconomicDataMarket,
  type FedRateMarket,
  type MacroRiskSignals,
  type UnifiedClientConfig,
  type UnifiedMarketData,
  UnifiedPredictionMarketClient,
} from "./unified-client";
