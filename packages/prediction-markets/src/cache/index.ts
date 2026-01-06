/**
 * Prediction Markets Cache Module
 *
 * In-memory caching for prediction market data with TTL support.
 */

export {
  type CacheStats,
  createMarketCache,
  MarketCache,
  type MarketCacheConfig,
} from "./market-cache";
