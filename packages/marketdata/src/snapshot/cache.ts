/**
 * Snapshot Cache
 *
 * TTL-based cache for feature snapshots to avoid redundant computation
 * within a trading cycle.
 */

import type { FeatureSnapshot } from "./schema";

// ============================================
// Types
// ============================================

/**
 * Cache entry with expiration.
 */
interface CacheEntry {
  snapshot: FeatureSnapshot;
  expiresAt: number;
}

/**
 * Cache configuration.
 */
export interface SnapshotCacheConfig {
  /** TTL in milliseconds (default: 3600000 = 1 hour) */
  ttlMs: number;
  /** Maximum entries (default: 1000) */
  maxEntries: number;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: SnapshotCacheConfig = {
  ttlMs: 3600000, // 1 hour
  maxEntries: 1000,
};

// ============================================
// Snapshot Cache Implementation
// ============================================

/**
 * LRU cache with TTL for feature snapshots.
 */
export class SnapshotCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly config: SnapshotCacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<SnapshotCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate cache key from symbol and timestamp.
   */
  private generateKey(symbol: string, timestamp: number): string {
    // Round timestamp to nearest minute to allow slight time variations
    const roundedTs = Math.floor(timestamp / 60000) * 60000;
    return `${symbol}:${roundedTs}`;
  }

  /**
   * Get a cached snapshot if available and not expired.
   */
  get(symbol: string, timestamp: number): FeatureSnapshot | null {
    const key = this.generateKey(symbol, timestamp);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Move to end for LRU (delete and re-add)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.snapshot;
  }

  /**
   * Store a snapshot in the cache.
   */
  set(snapshot: FeatureSnapshot): void {
    const key = this.generateKey(snapshot.symbol, snapshot.timestamp);

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      snapshot,
      expiresAt: Date.now() + this.config.ttlMs,
    });
  }

  /**
   * Check if a snapshot is cached and valid.
   */
  has(symbol: string, timestamp: number): boolean {
    const key = this.generateKey(symbol, timestamp);
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
   * Invalidate a specific snapshot.
   */
  invalidate(symbol: string, timestamp: number): boolean {
    const key = this.generateKey(symbol, timestamp);
    return this.cache.delete(key);
  }

  /**
   * Invalidate all snapshots for a symbol.
   */
  invalidateSymbol(symbol: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${symbol}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached snapshots.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove all expired entries.
   */
  prune(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    maxEntries: number;
    ttlMs: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      maxEntries: this.config.maxEntries,
      ttlMs: this.config.ttlMs,
    };
  }
}

// ============================================
// Global Cache Instance
// ============================================

/**
 * Global snapshot cache instance.
 * Use getGlobalCache() to access, or create your own SnapshotCache for isolation.
 */
let globalCache: SnapshotCache | null = null;

/**
 * Get the global snapshot cache instance.
 */
export function getGlobalCache(): SnapshotCache {
  if (!globalCache) {
    globalCache = new SnapshotCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (useful for testing).
 */
export function resetGlobalCache(): void {
  globalCache = null;
}
