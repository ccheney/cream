/**
 * Indicator Cache
 *
 * In-memory cache with TTL-based expiration for indicator snapshots.
 * Implements LRU eviction policy with configurable TTL per data type.
 *
 * TTL Configuration:
 * - Real-time data (quotes, trades): 30 second TTL
 * - Calculated indicators (RSI, ATR): 60 second TTL
 * - Batch data (fundamentals, sentiment): 5 minute TTL
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type {
	CorporateIndicators,
	IndicatorSnapshot,
	LiquidityIndicators,
	OptionsIndicators,
	PriceIndicators,
	QualityIndicators,
	SentimentIndicators,
	ShortInterestIndicators,
	ValueIndicators,
} from "../types";

// ============================================
// Types
// ============================================

/**
 * Cache entry with value and expiration timestamp
 */
interface CacheEntry<T> {
	value: T;
	expiresAt: number;
	lastAccessed: number;
}

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

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_TTL_CONFIG: CacheTTLConfig = {
	snapshot: 60 * 1000, // 60 seconds
	price: 30 * 1000, // 30 seconds
	liquidity: 30 * 1000, // 30 seconds
	options: 60 * 1000, // 60 seconds
	fundamentals: 5 * 60 * 1000, // 5 minutes
	sentiment: 5 * 60 * 1000, // 5 minutes
	shortInterest: 5 * 60 * 1000, // 5 minutes
	corporate: 5 * 60 * 1000, // 5 minutes
};

export const DEFAULT_CACHE_CONFIG: IndicatorCacheConfig = {
	maxEntries: 500,
	ttl: DEFAULT_TTL_CONFIG,
	enableMetrics: true,
};

// ============================================
// LRU Cache Implementation
// ============================================

/**
 * Generic LRU cache with TTL support.
 * Thread-safe for concurrent reads, but writes should be serialized.
 */
class LRUCache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	constructor(
		private maxEntries: number,
		private ttlMs: number,
		private enableMetrics: boolean,
	) {}

	/**
	 * Get a value from cache, returning null if expired or not found
	 */
	get(key: string): T | null {
		const entry = this.cache.get(key);

		if (!entry) {
			if (this.enableMetrics) {
				this.misses++;
			}
			return null;
		}

		const now = Date.now();
		if (now > entry.expiresAt) {
			this.cache.delete(key);
			if (this.enableMetrics) {
				this.misses++;
			}
			return null;
		}

		// Update last accessed for LRU
		entry.lastAccessed = now;
		if (this.enableMetrics) {
			this.hits++;
		}
		return entry.value;
	}

	/**
	 * Set a value in cache with TTL
	 */
	set(key: string, value: T, customTtlMs?: number): void {
		const now = Date.now();
		const ttl = customTtlMs ?? this.ttlMs;

		// Evict if at capacity
		if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
			this.evictLRU();
		}

		this.cache.set(key, {
			value,
			expiresAt: now + ttl,
			lastAccessed: now,
		});
	}

	/**
	 * Check if key exists and is not expired
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) {
			return false;
		}

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Delete a specific key
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Delete all entries for a symbol prefix
	 */
	deleteByPrefix(prefix: string): number {
		let deleted = 0;
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
				deleted++;
			}
		}
		return deleted;
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
		this.evictions = 0;
	}

	/**
	 * Get current size
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Get cache metrics
	 */
	getMetrics(): CacheMetrics {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			evictions: this.evictions,
			size: this.cache.size,
			hitRate: total > 0 ? this.hits / total : 0,
		};
	}

	/**
	 * Prune expired entries
	 */
	prune(): number {
		const now = Date.now();
		let pruned = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
				pruned++;
			}
		}

		return pruned;
	}

	/**
	 * Evict the least recently used entry
	 */
	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestAccess = Infinity;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.lastAccessed < oldestAccess) {
				oldestAccess = entry.lastAccessed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
			if (this.enableMetrics) {
				this.evictions++;
			}
		}
	}
}

// ============================================
// Indicator Cache
// ============================================

/**
 * Multi-tier cache for indicator data with TTL-based expiration.
 *
 * @example
 * ```typescript
 * const cache = new IndicatorCache();
 *
 * // Cache a full snapshot
 * cache.setSnapshot("AAPL", snapshot);
 *
 * // Retrieve cached snapshot
 * const cached = cache.getSnapshot("AAPL");
 *
 * // Invalidate on new market data
 * cache.invalidate("AAPL");
 * ```
 */
export class IndicatorCache {
	private readonly config: IndicatorCacheConfig;

	private readonly snapshots: LRUCache<IndicatorSnapshot>;
	private readonly price: LRUCache<PriceIndicators>;
	private readonly liquidity: LRUCache<LiquidityIndicators>;
	private readonly options: LRUCache<OptionsIndicators>;
	private readonly value: LRUCache<ValueIndicators>;
	private readonly quality: LRUCache<QualityIndicators>;
	private readonly sentiment: LRUCache<SentimentIndicators>;
	private readonly shortInterest: LRUCache<ShortInterestIndicators>;
	private readonly corporate: LRUCache<CorporateIndicators>;

	constructor(config: Partial<IndicatorCacheConfig> = {}) {
		this.config = {
			...DEFAULT_CACHE_CONFIG,
			...config,
			ttl: { ...DEFAULT_TTL_CONFIG, ...config.ttl },
		};

		const { maxEntries, ttl, enableMetrics } = this.config;

		this.snapshots = new LRUCache(maxEntries, ttl.snapshot, enableMetrics);
		this.price = new LRUCache(maxEntries, ttl.price, enableMetrics);
		this.liquidity = new LRUCache(maxEntries, ttl.liquidity, enableMetrics);
		this.options = new LRUCache(maxEntries, ttl.options, enableMetrics);
		this.value = new LRUCache(maxEntries, ttl.fundamentals, enableMetrics);
		this.quality = new LRUCache(maxEntries, ttl.fundamentals, enableMetrics);
		this.sentiment = new LRUCache(maxEntries, ttl.sentiment, enableMetrics);
		this.shortInterest = new LRUCache(maxEntries, ttl.shortInterest, enableMetrics);
		this.corporate = new LRUCache(maxEntries, ttl.corporate, enableMetrics);
	}

	// ============================================
	// Snapshot Cache
	// ============================================

	getSnapshot(symbol: string): IndicatorSnapshot | null {
		return this.snapshots.get(this.key(symbol));
	}

	setSnapshot(symbol: string, snapshot: IndicatorSnapshot): void {
		this.snapshots.set(this.key(symbol), snapshot);
	}

	hasSnapshot(symbol: string): boolean {
		return this.snapshots.has(this.key(symbol));
	}

	// ============================================
	// Price Indicators Cache
	// ============================================

	getPrice(symbol: string): PriceIndicators | null {
		return this.price.get(this.key(symbol));
	}

	setPrice(symbol: string, indicators: PriceIndicators): void {
		this.price.set(this.key(symbol), indicators);
	}

	hasPrice(symbol: string): boolean {
		return this.price.has(this.key(symbol));
	}

	// ============================================
	// Liquidity Indicators Cache
	// ============================================

	getLiquidity(symbol: string): LiquidityIndicators | null {
		return this.liquidity.get(this.key(symbol));
	}

	setLiquidity(symbol: string, indicators: LiquidityIndicators): void {
		this.liquidity.set(this.key(symbol), indicators);
	}

	hasLiquidity(symbol: string): boolean {
		return this.liquidity.has(this.key(symbol));
	}

	// ============================================
	// Options Indicators Cache
	// ============================================

	getOptions(symbol: string): OptionsIndicators | null {
		return this.options.get(this.key(symbol));
	}

	setOptions(symbol: string, indicators: OptionsIndicators): void {
		this.options.set(this.key(symbol), indicators);
	}

	hasOptions(symbol: string): boolean {
		return this.options.has(this.key(symbol));
	}

	// ============================================
	// Fundamental (Value + Quality) Indicators Cache
	// ============================================

	getValue(symbol: string): ValueIndicators | null {
		return this.value.get(this.key(symbol));
	}

	setValue(symbol: string, indicators: ValueIndicators): void {
		this.value.set(this.key(symbol), indicators);
	}

	getQuality(symbol: string): QualityIndicators | null {
		return this.quality.get(this.key(symbol));
	}

	setQuality(symbol: string, indicators: QualityIndicators): void {
		this.quality.set(this.key(symbol), indicators);
	}

	setFundamentals(
		symbol: string,
		data: { value: ValueIndicators; quality: QualityIndicators },
	): void {
		this.setValue(symbol, data.value);
		this.setQuality(symbol, data.quality);
	}

	getFundamentals(symbol: string): { value: ValueIndicators; quality: QualityIndicators } | null {
		const value = this.getValue(symbol);
		const quality = this.getQuality(symbol);
		if (!value || !quality) {
			return null;
		}
		return { value, quality };
	}

	// ============================================
	// Sentiment Indicators Cache
	// ============================================

	getSentiment(symbol: string): SentimentIndicators | null {
		return this.sentiment.get(this.key(symbol));
	}

	setSentiment(symbol: string, indicators: SentimentIndicators): void {
		this.sentiment.set(this.key(symbol), indicators);
	}

	hasSentiment(symbol: string): boolean {
		return this.sentiment.has(this.key(symbol));
	}

	// ============================================
	// Short Interest Indicators Cache
	// ============================================

	getShortInterest(symbol: string): ShortInterestIndicators | null {
		return this.shortInterest.get(this.key(symbol));
	}

	setShortInterest(symbol: string, indicators: ShortInterestIndicators): void {
		this.shortInterest.set(this.key(symbol), indicators);
	}

	hasShortInterest(symbol: string): boolean {
		return this.shortInterest.has(this.key(symbol));
	}

	// ============================================
	// Corporate Actions Indicators Cache
	// ============================================

	getCorporate(symbol: string): CorporateIndicators | null {
		return this.corporate.get(this.key(symbol));
	}

	setCorporate(symbol: string, indicators: CorporateIndicators): void {
		this.corporate.set(this.key(symbol), indicators);
	}

	hasCorporate(symbol: string): boolean {
		return this.corporate.has(this.key(symbol));
	}

	// ============================================
	// Cache Management
	// ============================================

	/**
	 * Invalidate all cached data for a symbol.
	 * Call this when new market data arrives.
	 */
	invalidate(symbol: string): void {
		const key = this.key(symbol);
		this.snapshots.delete(key);
		this.price.delete(key);
		this.liquidity.delete(key);
		this.options.delete(key);
		this.value.delete(key);
		this.quality.delete(key);
		this.sentiment.delete(key);
		this.shortInterest.delete(key);
		this.corporate.delete(key);
	}

	/**
	 * Invalidate only real-time data for a symbol.
	 * Call this on quote/trade updates.
	 */
	invalidateRealtime(symbol: string): void {
		const key = this.key(symbol);
		this.snapshots.delete(key);
		this.price.delete(key);
		this.liquidity.delete(key);
		this.options.delete(key);
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.snapshots.clear();
		this.price.clear();
		this.liquidity.clear();
		this.options.clear();
		this.value.clear();
		this.quality.clear();
		this.sentiment.clear();
		this.shortInterest.clear();
		this.corporate.clear();
	}

	/**
	 * Prune all expired entries from all caches
	 */
	prune(): number {
		let total = 0;
		total += this.snapshots.prune();
		total += this.price.prune();
		total += this.liquidity.prune();
		total += this.options.prune();
		total += this.value.prune();
		total += this.quality.prune();
		total += this.sentiment.prune();
		total += this.shortInterest.prune();
		total += this.corporate.prune();
		return total;
	}

	/**
	 * Get aggregated metrics across all caches
	 */
	getMetrics(): {
		snapshot: CacheMetrics;
		price: CacheMetrics;
		liquidity: CacheMetrics;
		options: CacheMetrics;
		value: CacheMetrics;
		quality: CacheMetrics;
		sentiment: CacheMetrics;
		shortInterest: CacheMetrics;
		corporate: CacheMetrics;
		total: CacheMetrics;
	} {
		const metrics = {
			snapshot: this.snapshots.getMetrics(),
			price: this.price.getMetrics(),
			liquidity: this.liquidity.getMetrics(),
			options: this.options.getMetrics(),
			value: this.value.getMetrics(),
			quality: this.quality.getMetrics(),
			sentiment: this.sentiment.getMetrics(),
			shortInterest: this.shortInterest.getMetrics(),
			corporate: this.corporate.getMetrics(),
			total: {
				hits: 0,
				misses: 0,
				evictions: 0,
				size: 0,
				hitRate: 0,
			},
		};

		// Aggregate totals
		for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
			if (key === "total") {
				continue;
			}
			metrics.total.hits += metrics[key].hits;
			metrics.total.misses += metrics[key].misses;
			metrics.total.evictions += metrics[key].evictions;
			metrics.total.size += metrics[key].size;
		}

		const totalAccess = metrics.total.hits + metrics.total.misses;
		metrics.total.hitRate = totalAccess > 0 ? metrics.total.hits / totalAccess : 0;

		return metrics;
	}

	/**
	 * Get total number of cached entries
	 */
	get size(): number {
		return (
			this.snapshots.size +
			this.price.size +
			this.liquidity.size +
			this.options.size +
			this.value.size +
			this.quality.size +
			this.sentiment.size +
			this.shortInterest.size +
			this.corporate.size
		);
	}

	// ============================================
	// Private Helpers
	// ============================================

	private key(symbol: string): string {
		return symbol.toUpperCase();
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an IndicatorCache instance with optional configuration
 */
export function createIndicatorCache(config?: Partial<IndicatorCacheConfig>): IndicatorCache {
	return new IndicatorCache(config);
}
