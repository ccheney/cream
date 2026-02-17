/**
 * Indicator Cache Types
 */

/**
 * TTL configuration for different data types (in milliseconds)
 */
export interface CacheTTLConfig {
	/** TTL for full indicator snapshots (default: 60s) */
	snapshot: number;
	/** TTL for real-time price indicators (default: 30s) */
	price: number;
	/** TTL for liquidity indicators (default: 30s) */
	liquidity: number;
	/** TTL for options indicators (default: 60s) */
	options: number;
	/** TTL for batch data - fundamentals (default: 5min) */
	fundamentals: number;
	/** TTL for batch data - sentiment (default: 5min) */
	sentiment: number;
	/** TTL for batch data - short interest (default: 5min) */
	shortInterest: number;
	/** TTL for batch data - corporate actions (default: 5min) */
	corporate: number;
}

/**
 * Cache configuration
 */
export interface IndicatorCacheConfig {
	/** Maximum number of entries per cache type */
	maxEntries: number;
	/** TTL configuration */
	ttl: CacheTTLConfig;
	/** Enable cache metrics collection */
	enableMetrics: boolean;
}

/**
 * Cache metrics for monitoring
 */
export interface CacheMetrics {
	hits: number;
	misses: number;
	evictions: number;
	size: number;
	hitRate: number;
}

export const DEFAULT_TTL_CONFIG: CacheTTLConfig = {
	snapshot: 60 * 1000,
	price: 30 * 1000,
	liquidity: 30 * 1000,
	options: 60 * 1000,
	fundamentals: 5 * 60 * 1000,
	sentiment: 5 * 60 * 1000,
	shortInterest: 5 * 60 * 1000,
	corporate: 5 * 60 * 1000,
};

export const DEFAULT_CACHE_CONFIG: IndicatorCacheConfig = {
	maxEntries: 500,
	ttl: DEFAULT_TTL_CONFIG,
	enableMetrics: true,
};
