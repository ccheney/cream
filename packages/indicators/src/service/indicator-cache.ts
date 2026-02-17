/**
 * Indicator Cache
 *
 * In-memory cache with TTL-based expiration for indicator snapshots.
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
import {
	type CacheMetrics,
	DEFAULT_CACHE_CONFIG,
	DEFAULT_TTL_CONFIG,
	type IndicatorCacheConfig,
} from "./indicator-cache.types";
import { LRUCache } from "./indicator-cache-lru";

export {
	type CacheMetrics,
	type CacheTTLConfig,
	DEFAULT_CACHE_CONFIG,
	DEFAULT_TTL_CONFIG,
	type IndicatorCacheConfig,
} from "./indicator-cache.types";

type CacheMetricsBundle = {
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
};

/**
 * Multi-tier cache for indicator data with TTL-based expiration.
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

	getSnapshot(symbol: string): IndicatorSnapshot | null {
		return this.snapshots.get(this.key(symbol));
	}

	setSnapshot(symbol: string, snapshot: IndicatorSnapshot): void {
		this.snapshots.set(this.key(symbol), snapshot);
	}

	hasSnapshot(symbol: string): boolean {
		return this.snapshots.has(this.key(symbol));
	}

	getPrice(symbol: string): PriceIndicators | null {
		return this.price.get(this.key(symbol));
	}

	setPrice(symbol: string, indicators: PriceIndicators): void {
		this.price.set(this.key(symbol), indicators);
	}

	hasPrice(symbol: string): boolean {
		return this.price.has(this.key(symbol));
	}

	getLiquidity(symbol: string): LiquidityIndicators | null {
		return this.liquidity.get(this.key(symbol));
	}

	setLiquidity(symbol: string, indicators: LiquidityIndicators): void {
		this.liquidity.set(this.key(symbol), indicators);
	}

	hasLiquidity(symbol: string): boolean {
		return this.liquidity.has(this.key(symbol));
	}

	getOptions(symbol: string): OptionsIndicators | null {
		return this.options.get(this.key(symbol));
	}

	setOptions(symbol: string, indicators: OptionsIndicators): void {
		this.options.set(this.key(symbol), indicators);
	}

	hasOptions(symbol: string): boolean {
		return this.options.has(this.key(symbol));
	}

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

	getSentiment(symbol: string): SentimentIndicators | null {
		return this.sentiment.get(this.key(symbol));
	}

	setSentiment(symbol: string, indicators: SentimentIndicators): void {
		this.sentiment.set(this.key(symbol), indicators);
	}

	hasSentiment(symbol: string): boolean {
		return this.sentiment.has(this.key(symbol));
	}

	getShortInterest(symbol: string): ShortInterestIndicators | null {
		return this.shortInterest.get(this.key(symbol));
	}

	setShortInterest(symbol: string, indicators: ShortInterestIndicators): void {
		this.shortInterest.set(this.key(symbol), indicators);
	}

	hasShortInterest(symbol: string): boolean {
		return this.shortInterest.has(this.key(symbol));
	}

	getCorporate(symbol: string): CorporateIndicators | null {
		return this.corporate.get(this.key(symbol));
	}

	setCorporate(symbol: string, indicators: CorporateIndicators): void {
		this.corporate.set(this.key(symbol), indicators);
	}

	hasCorporate(symbol: string): boolean {
		return this.corporate.has(this.key(symbol));
	}

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

	invalidateRealtime(symbol: string): void {
		const key = this.key(symbol);
		this.snapshots.delete(key);
		this.price.delete(key);
		this.liquidity.delete(key);
		this.options.delete(key);
	}

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

	getMetrics(): CacheMetricsBundle {
		const metrics: CacheMetricsBundle = {
			snapshot: this.snapshots.getMetrics(),
			price: this.price.getMetrics(),
			liquidity: this.liquidity.getMetrics(),
			options: this.options.getMetrics(),
			value: this.value.getMetrics(),
			quality: this.quality.getMetrics(),
			sentiment: this.sentiment.getMetrics(),
			shortInterest: this.shortInterest.getMetrics(),
			corporate: this.corporate.getMetrics(),
			total: { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0 },
		};

		for (const [name, metric] of Object.entries(metrics)) {
			if (name === "total") {
				continue;
			}
			metrics.total.hits += metric.hits;
			metrics.total.misses += metric.misses;
			metrics.total.evictions += metric.evictions;
			metrics.total.size += metric.size;
		}

		const totalAccess = metrics.total.hits + metrics.total.misses;
		metrics.total.hitRate = totalAccess > 0 ? metrics.total.hits / totalAccess : 0;
		return metrics;
	}

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

	private key(symbol: string): string {
		return symbol.toUpperCase();
	}
}

/**
 * Create an IndicatorCache instance with optional configuration.
 */
export function createIndicatorCache(config?: Partial<IndicatorCacheConfig>): IndicatorCache {
	return new IndicatorCache(config);
}
