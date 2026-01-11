/**
 * Query cache implementation for HelixDB.
 * @module
 */

import { DEFAULT_CACHE_TTL_MS, type QueryType } from "./constants.js";
import type { CacheEntry } from "./types.js";

/**
 * Simple in-memory cache for query results.
 * In production, this would use a distributed cache.
 */
export class QueryCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get entry from cache.
   *
   * @param key - Cache key
   * @returns Cache entry or undefined if miss/expired
   */
  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    const expiresAt = entry.createdAt.getTime() + entry.ttlMs;
    if (now > expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Set entry in cache.
   *
   * @param key - Cache key
   * @param data - Data to cache
   * @param queryType - Query type
   * @param ttlMs - Time-to-live (ms)
   */
  set(key: string, data: T[], queryType: QueryType, ttlMs: number = this.defaultTtlMs): void {
    this.cache.set(key, {
      key,
      data,
      createdAt: new Date(),
      ttlMs,
      queryType,
    });
  }

  /**
   * Delete entry from cache.
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate entries by query type.
   *
   * @param queryType - Query type to invalidate
   */
  invalidateByType(queryType: QueryType): void {
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.queryType === queryType) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
