/**
 * Internal LRU cache for IndicatorCache.
 */

import type { CacheMetrics } from "./indicator-cache.types";

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
	lastAccessed: number;
}

/**
 * Generic LRU cache with TTL support.
 */
export class LRUCache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	constructor(
		private maxEntries: number,
		private ttlMs: number,
		private enableMetrics: boolean,
	) {}

	get(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) {
			this.incrementMisses();
			return null;
		}

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			this.incrementMisses();
			return null;
		}

		entry.lastAccessed = Date.now();
		this.incrementHits();
		return entry.value;
	}

	set(key: string, value: T, customTtlMs?: number): void {
		if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
			this.evictLRU();
		}

		const now = Date.now();
		const ttl = customTtlMs ?? this.ttlMs;
		this.cache.set(key, {
			value,
			expiresAt: now + ttl,
			lastAccessed: now,
		});
	}

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

	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
		this.evictions = 0;
	}

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

	get size(): number {
		return this.cache.size;
	}

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

	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestAccessed = Number.POSITIVE_INFINITY;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.lastAccessed < oldestAccessed) {
				oldestAccessed = entry.lastAccessed;
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

	private incrementHits(): void {
		if (this.enableMetrics) {
			this.hits++;
		}
	}

	private incrementMisses(): void {
		if (this.enableMetrics) {
			this.misses++;
		}
	}
}
