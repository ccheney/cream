/**
 * Web Search Cache
 *
 * In-memory caching for web search results with TTL-based expiration.
 */

import type { z } from "zod";
import type { WebSearchParamsSchema, WebSearchResponse } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  results: WebSearchResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Generate cache key from search parameters.
 * maxResults excluded from cache key - can serve larger cached set with slice.
 */
export function getCacheKey(params: z.infer<typeof WebSearchParamsSchema>): string {
  return JSON.stringify({
    query: params.query.toLowerCase().trim(),
    sources: params.sources?.slice().sort(),
    topic: params.topic,
    maxAgeHours: params.maxAgeHours,
    symbols: params.symbols?.slice().sort(),
  });
}

export function getCached(key: string): WebSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

export function setCache(key: string, results: WebSearchResponse): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, {
    results,
    timestamp: Date.now(),
  });
}

export function clearWebSearchCache(): void {
  cache.clear();
}

export function getWebSearchCacheSize(): number {
  return cache.size;
}
