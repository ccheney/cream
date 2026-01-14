/**
 * In-Memory Market Cache
 *
 * Provides fast in-memory caching for prediction market data with TTL support.
 * Used to reduce API calls and improve response times for frequently accessed data.
 *
 * @see docs/plans/18-prediction-markets.md (Phase 6 - Caching & Persistence)
 */

import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";

// ============================================
// Types
// ============================================

/**
 * Cache configuration
 */
export interface MarketCacheConfig {
	/** TTL in milliseconds for market events (default: 5 minutes) */
	eventTtlMs?: number;
	/** TTL in milliseconds for computed scores (default: 1 minute) */
	scoresTtlMs?: number;
	/** Maximum number of cached events (default: 1000) */
	maxEventEntries?: number;
	/** Enable automatic pruning (default: true) */
	autoPrune?: boolean;
	/** Prune interval in milliseconds (default: 60 seconds) */
	pruneIntervalMs?: number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
	value: T;
	createdAt: number;
	expiresAt: number;
	accessCount: number;
	lastAccessedAt: number;
	/** Access order for LRU eviction - incremented on each access */
	accessOrder: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
	eventEntries: number;
	scoresEntries: number;
	hitCount: number;
	missCount: number;
	hitRate: number;
	evictionCount: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Required<MarketCacheConfig> = {
	eventTtlMs: 5 * 60 * 1000, // 5 minutes
	scoresTtlMs: 60 * 1000, // 1 minute
	maxEventEntries: 1000,
	autoPrune: true,
	pruneIntervalMs: 60 * 1000, // 1 minute
};

// ============================================
// Market Cache
// ============================================

/**
 * In-memory cache for prediction market data
 *
 * @example
 * ```typescript
 * const cache = new MarketCache({ eventTtlMs: 60000 });
 *
 * // Cache market events
 * cache.setEvent("KXFED-26JAN29", event);
 * const event = cache.getEvent("KXFED-26JAN29");
 *
 * // Cache computed scores
 * cache.setScores(scores);
 * const scores = cache.getScores();
 *
 * // Get or fetch pattern
 * const event = await cache.getOrFetchEvent("TICKER", async () => {
 *   return await fetchEventFromApi("TICKER");
 * });
 *
 * // Cleanup
 * cache.dispose();
 * ```
 */
export class MarketCache {
	private readonly config: Required<MarketCacheConfig>;
	private readonly events: Map<string, CacheEntry<PredictionMarketEvent>> = new Map();
	private scores: CacheEntry<PredictionMarketScores> | null = null;
	private pruneInterval: Timer | null = null;

	// Access order counter for LRU eviction
	private accessCounter = 0;

	// Stats
	private hitCount = 0;
	private missCount = 0;
	private evictionCount = 0;

	constructor(config: MarketCacheConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		if (this.config.autoPrune) {
			this.startAutoPrune();
		}
	}

	// ============================================
	// Event Cache Operations
	// ============================================

	/**
	 * Get a cached event by ticker
	 */
	getEvent(ticker: string): PredictionMarketEvent | null {
		const entry = this.events.get(ticker);

		if (!entry) {
			this.missCount++;
			return null;
		}

		if (Date.now() > entry.expiresAt) {
			this.events.delete(ticker);
			this.missCount++;
			return null;
		}

		this.hitCount++;
		entry.accessCount++;
		entry.lastAccessedAt = Date.now();
		entry.accessOrder = this.accessCounter++;
		return entry.value;
	}

	/**
	 * Set a cached event
	 */
	setEvent(ticker: string, event: PredictionMarketEvent): void {
		// Evict if at capacity
		if (this.events.size >= this.config.maxEventEntries) {
			this.evictLeastRecentlyUsed();
		}

		const now = Date.now();
		this.events.set(ticker, {
			value: event,
			createdAt: now,
			expiresAt: now + this.config.eventTtlMs,
			accessCount: 0,
			lastAccessedAt: now,
			accessOrder: this.accessCounter++,
		});
	}

	/**
	 * Get or fetch an event
	 */
	async getOrFetchEvent(
		ticker: string,
		fetcher: () => Promise<PredictionMarketEvent | null>
	): Promise<PredictionMarketEvent | null> {
		const cached = this.getEvent(ticker);
		if (cached) {
			return cached;
		}

		const event = await fetcher();
		if (event) {
			this.setEvent(ticker, event);
		}
		return event;
	}

	/**
	 * Set multiple events
	 */
	setEvents(events: PredictionMarketEvent[]): void {
		for (const event of events) {
			this.setEvent(event.payload.marketTicker, event);
		}
	}

	/**
	 * Get all cached events
	 */
	getAllEvents(): PredictionMarketEvent[] {
		const now = Date.now();
		const result: PredictionMarketEvent[] = [];

		for (const [ticker, entry] of this.events.entries()) {
			if (now > entry.expiresAt) {
				this.events.delete(ticker);
				continue;
			}
			result.push(entry.value);
		}

		return result;
	}

	/**
	 * Invalidate a specific event
	 */
	invalidateEvent(ticker: string): boolean {
		return this.events.delete(ticker);
	}

	/**
	 * Invalidate events by predicate
	 */
	invalidateEventsWhere(predicate: (event: PredictionMarketEvent) => boolean): number {
		let count = 0;
		for (const [ticker, entry] of this.events.entries()) {
			if (predicate(entry.value)) {
				this.events.delete(ticker);
				count++;
			}
		}
		return count;
	}

	// ============================================
	// Scores Cache Operations
	// ============================================

	/**
	 * Get cached scores
	 */
	getScores(): PredictionMarketScores | null {
		if (!this.scores) {
			this.missCount++;
			return null;
		}

		if (Date.now() > this.scores.expiresAt) {
			this.scores = null;
			this.missCount++;
			return null;
		}

		this.hitCount++;
		this.scores.accessCount++;
		this.scores.lastAccessedAt = Date.now();
		return this.scores.value;
	}

	/**
	 * Set cached scores
	 */
	setScores(scores: PredictionMarketScores): void {
		const now = Date.now();
		this.scores = {
			value: scores,
			createdAt: now,
			expiresAt: now + this.config.scoresTtlMs,
			accessCount: 0,
			lastAccessedAt: now,
			accessOrder: this.accessCounter++,
		};
	}

	/**
	 * Get or fetch scores
	 */
	async getOrFetchScores(
		fetcher: () => Promise<PredictionMarketScores>
	): Promise<PredictionMarketScores> {
		const cached = this.getScores();
		if (cached) {
			return cached;
		}

		const scores = await fetcher();
		this.setScores(scores);
		return scores;
	}

	/**
	 * Invalidate cached scores
	 */
	invalidateScores(): void {
		this.scores = null;
	}

	// ============================================
	// Cache Management
	// ============================================

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.events.clear();
		this.scores = null;
	}

	/**
	 * Prune expired entries
	 */
	prune(): number {
		const now = Date.now();
		let pruned = 0;

		for (const [ticker, entry] of this.events.entries()) {
			if (now > entry.expiresAt) {
				this.events.delete(ticker);
				pruned++;
			}
		}

		if (this.scores && now > this.scores.expiresAt) {
			this.scores = null;
			pruned++;
		}

		return pruned;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const total = this.hitCount + this.missCount;
		return {
			eventEntries: this.events.size,
			scoresEntries: this.scores ? 1 : 0,
			hitCount: this.hitCount,
			missCount: this.missCount,
			hitRate: total > 0 ? this.hitCount / total : 0,
			evictionCount: this.evictionCount,
		};
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.hitCount = 0;
		this.missCount = 0;
		this.evictionCount = 0;
	}

	/**
	 * Dispose of the cache and cleanup resources
	 */
	dispose(): void {
		this.stopAutoPrune();
		this.clear();
	}

	// ============================================
	// Private Methods
	// ============================================

	private evictLeastRecentlyUsed(): void {
		let oldestTicker: string | null = null;
		let oldestAccessOrder = Infinity;

		for (const [ticker, entry] of this.events.entries()) {
			// Evict entry with lowest accessOrder (least recently used)
			if (entry.accessOrder < oldestAccessOrder) {
				oldestAccessOrder = entry.accessOrder;
				oldestTicker = ticker;
			}
		}

		if (oldestTicker) {
			this.events.delete(oldestTicker);
			this.evictionCount++;
		}
	}

	private startAutoPrune(): void {
		this.pruneInterval = setInterval(() => {
			this.prune();
		}, this.config.pruneIntervalMs);
	}

	private stopAutoPrune(): void {
		if (this.pruneInterval) {
			clearInterval(this.pruneInterval);
			this.pruneInterval = null;
		}
	}
}

/**
 * Create a market cache with configuration
 */
export function createMarketCache(config: MarketCacheConfig = {}): MarketCache {
	return new MarketCache(config);
}
