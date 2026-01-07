/**
 * Web Search Tool
 *
 * Provides real-time web search capabilities for agents with time-bounded results,
 * domain filtering, and topic specialization.
 *
 * @see docs/plans/21-web-search-tool.md
 */

import { isBacktest } from "@cream/domain";
import { z } from "zod";
import { createTavilyClientFromEnv, type TavilyClient } from "./providers/tavily.js";

// ============================================
// Types and Schemas
// ============================================

/**
 * Available web search source filters
 */
export type WebSearchSource = "all" | "reddit" | "x" | "substack" | "blogs" | "news" | "financial";

/**
 * Search parameters schema
 */
export const WebSearchParamsSchema = z.object({
  query: z.string().min(1),
  maxAgeHours: z.number().min(1).max(168).optional().default(24),
  sources: z
    .array(z.enum(["all", "reddit", "x", "substack", "blogs", "news", "financial"]))
    .optional()
    .default(["all"]),
  topic: z.enum(["general", "news", "finance"]).optional().default("general"),
  maxResults: z.number().min(1).max(20).optional().default(10),
  symbols: z.array(z.string()).optional(),
});
export type WebSearchParams = z.input<typeof WebSearchParamsSchema>;

/**
 * Individual search result
 */
export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
  relevanceScore?: number;
  rawContent?: string;
}

/**
 * Search response with metadata
 */
export interface WebSearchResponse {
  results: WebSearchResult[];
  metadata: {
    query: string;
    provider: "tavily";
    executionTimeMs: number;
    resultsFiltered: number;
  };
}

// ============================================
// Cache Configuration
// ============================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Max entries before LRU eviction

interface CacheEntry {
  results: WebSearchResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Generate cache key from search params
 * Query is normalized (lowercase, trimmed) for better hit rate
 * maxResults excluded - can serve larger cached set with slice
 */
function getCacheKey(params: z.infer<typeof WebSearchParamsSchema>): string {
  return JSON.stringify({
    query: params.query.toLowerCase().trim(),
    sources: params.sources?.slice().sort(),
    topic: params.topic,
    maxAgeHours: params.maxAgeHours,
    symbols: params.symbols?.slice().sort(),
  });
}

/**
 * Get cached result if still valid
 */
function getCached(key: string): WebSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

/**
 * Store result in cache with LRU eviction
 */
function setCache(key: string, results: WebSearchResponse): void {
  // LRU eviction if at capacity
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

/**
 * Clear all cached results (for testing)
 */
export function clearWebSearchCache(): void {
  cache.clear();
}

/**
 * Get current cache size (for testing/monitoring)
 */
export function getWebSearchCacheSize(): number {
  return cache.size;
}

// ============================================
// Rate Limiting
// ============================================

/**
 * Rate limits by provider
 * Tavily free tier: 1000 requests/month, ~33/day, but we allow bursts
 */
const RATE_LIMITS = {
  tavily: {
    perMinute: 60,
    perDay: 1000,
  },
} as const;

interface RateLimitState {
  minute: number;
  day: number;
  minuteReset: number;
  dayReset: number;
}

/**
 * Rate limiter for API providers
 * Uses sliding window counters with automatic reset
 */
class RateLimiter {
  private counts = new Map<string, RateLimitState>();

  /**
   * Check if we can proceed with a request
   */
  canProceed(provider: keyof typeof RATE_LIMITS): boolean {
    const limits = RATE_LIMITS[provider];
    if (!limits) {
      return true;
    }

    const now = Date.now();
    const state = this.getState(provider, now);

    return state.minute < limits.perMinute && state.day < limits.perDay;
  }

  /**
   * Record a successful API call
   */
  record(provider: keyof typeof RATE_LIMITS): void {
    const now = Date.now();
    const state = this.getState(provider, now);
    state.minute++;
    state.day++;
    this.counts.set(provider, state);
  }

  /**
   * Get remaining quota for monitoring
   */
  getRemainingQuota(provider: keyof typeof RATE_LIMITS): { minute: number; day: number } {
    const limits = RATE_LIMITS[provider];
    if (!limits) {
      return { minute: Infinity, day: Infinity };
    }

    const state = this.getState(provider, Date.now());
    return {
      minute: Math.max(0, limits.perMinute - state.minute),
      day: Math.max(0, limits.perDay - state.day),
    };
  }

  /**
   * Reset rate limiter state (for testing)
   */
  reset(): void {
    this.counts.clear();
  }

  private getState(provider: string, now: number): RateLimitState {
    let state = this.counts.get(provider);

    if (!state) {
      state = {
        minute: 0,
        day: 0,
        minuteReset: now + 60000,
        dayReset: now + 86400000,
      };
      this.counts.set(provider, state);
      return state;
    }

    // Reset minute counter if window expired
    if (now >= state.minuteReset) {
      state.minute = 0;
      state.minuteReset = now + 60000;
    }

    // Reset day counter if window expired
    if (now >= state.dayReset) {
      state.day = 0;
      state.dayReset = now + 86400000;
    }

    return state;
  }
}

export const rateLimiter = new RateLimiter();

// ============================================
// Domain Mapping
// ============================================

/**
 * Maps source types to domain arrays
 */
const DOMAIN_MAP: Record<WebSearchSource, string[]> = {
  all: [],
  reddit: ["reddit.com"],
  x: ["x.com"],
  substack: ["substack.com"],
  blogs: ["medium.com", "seekingalpha.com", "zerohedge.com", "thestreet.com"],
  news: ["reuters.com", "bloomberg.com", "cnbc.com", "wsj.com", "ft.com", "marketwatch.com"],
  financial: ["seekingalpha.com", "investopedia.com", "fool.com", "barrons.com", "tradingview.com"],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Build domain filter array from source types
 */
function buildDomainFilter(sources: WebSearchSource[]): string[] {
  // If "all" is included or no sources, don't filter domains
  if (sources.length === 0 || sources.includes("all")) {
    return [];
  }

  // Combine domains from all specified sources (deduplicated)
  const domains = new Set<string>();
  for (const source of sources) {
    for (const domain of DOMAIN_MAP[source]) {
      domains.add(domain);
    }
  }

  return Array.from(domains);
}

/**
 * Extract hostname from URL
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix if present
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Normalize Tavily results to WebSearchResult format
 * and filter by time cutoff
 */
function normalizeResults(
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
    published_date?: string;
    raw_content?: string | null;
  }>,
  cutoffTime: Date
): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];

  for (const result of results) {
    // Parse published date
    let publishedAt: Date | null = null;
    if (result.published_date) {
      publishedAt = new Date(result.published_date);
      // Skip if published before cutoff
      if (publishedAt < cutoffTime) {
        continue;
      }
    }

    normalized.push({
      title: result.title,
      snippet: result.content,
      url: result.url,
      source: extractDomain(result.url),
      publishedAt: publishedAt?.toISOString() ?? new Date().toISOString(),
      relevanceScore: result.score,
      rawContent: result.raw_content ?? undefined,
    });
  }

  return normalized;
}

/**
 * Create an empty response (for backtest mode or errors)
 */
function createEmptyResponse(query: string, startTime: number): WebSearchResponse {
  return {
    results: [],
    metadata: {
      query,
      provider: "tavily",
      executionTimeMs: Date.now() - startTime,
      resultsFiltered: 0,
    },
  };
}

/**
 * Calculate time range for Tavily API based on max age hours
 */
function calculateTimeRange(maxAgeHours: number): "day" | "week" | "month" {
  if (maxAgeHours <= 24) {
    return "day";
  }
  if (maxAgeHours <= 168) {
    return "week";
  }
  return "month";
}

// ============================================
// Client Management
// ============================================

let tavilyClient: TavilyClient | null = null;

/**
 * Get or create Tavily client from environment
 */
function getTavilyClient(): TavilyClient | null {
  if (tavilyClient === null) {
    tavilyClient = createTavilyClientFromEnv();
  }
  return tavilyClient;
}

// ============================================
// Main Function
// ============================================

/**
 * Search the web for real-time information
 *
 * Provides web search with:
 * - Time-bounded results (1-168 hours)
 * - Source/domain filtering
 * - Topic specialization (general, news, finance)
 * - Graceful degradation on errors
 *
 * In backtest mode, returns empty results for consistent execution.
 * Never throws - always returns a valid response.
 *
 * @param params - Search parameters
 * @returns Search results with metadata
 */
export async function webSearch(params: WebSearchParams): Promise<WebSearchResponse> {
  const startTime = Date.now();

  // 1. Validate and parse params
  const parsed = WebSearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    console.warn("[webSearch] Invalid params:", parsed.error.message);
    return createEmptyResponse(params.query ?? "", startTime);
  }
  const { query, maxAgeHours, sources, topic, maxResults, symbols } = parsed.data;

  // 2. Backtest mode → empty results (don't cache)
  if (isBacktest()) {
    return createEmptyResponse(query, startTime);
  }

  // 3. Check cache before API call
  const cacheKey = getCacheKey(parsed.data);
  const cached = getCached(cacheKey);
  if (cached) {
    // Return cached result with updated execution time, sliced to requested maxResults
    return {
      results: cached.results.slice(0, maxResults),
      metadata: {
        ...cached.metadata,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  // 4. Check rate limit before API call
  if (!rateLimiter.canProceed("tavily")) {
    console.warn("[webSearch] Rate limited, returning empty response");
    return createEmptyResponse(query, startTime);
  }

  // 5. Check for Tavily client
  const client = getTavilyClient();
  if (!client) {
    console.warn("[webSearch] TAVILY_API_KEY not configured");
    return createEmptyResponse(query, startTime);
  }

  // 6. Build domain filters from sources
  const includeDomains = buildDomainFilter(sources);

  // 7. Calculate time bounds (hybrid filtering strategy)
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const timeRange = calculateTimeRange(maxAgeHours);

  // 8. Build enhanced query with symbols if provided
  let enhancedQuery = query;
  if (symbols && symbols.length > 0) {
    enhancedQuery = `${query} ${symbols.map((s) => `$${s}`).join(" ")}`;
  }

  try {
    // 9. Execute Tavily search
    const result = await client.search({
      query: enhancedQuery,
      topic,
      timeRange,
      includeDomains: includeDomains.length > 0 ? includeDomains : undefined,
      maxResults: Math.min(maxResults * 2, 20), // Request 2x for filtering
      includeRawContent: true,
    });

    // Handle search failure
    if (!result.success) {
      console.warn("[webSearch] Search failed:", result.error);
      return createEmptyResponse(query, startTime);
    }

    // 10. Record successful API call for rate limiting
    rateLimiter.record("tavily");

    // 11. Client-side time filtering for precise hour-level window
    const filteredResults = normalizeResults(result.data.results, cutoffTime);
    const resultsFiltered = result.data.results.length - filteredResults.length;

    const response: WebSearchResponse = {
      results: filteredResults.slice(0, maxResults),
      metadata: {
        query,
        provider: "tavily",
        executionTimeMs: Date.now() - startTime,
        resultsFiltered,
      },
    };

    // 12. Cache successful results (store full result set for reuse with different maxResults)
    const responseToCache: WebSearchResponse = {
      results: filteredResults,
      metadata: response.metadata,
    };
    setCache(cacheKey, responseToCache);

    return response;
  } catch (error) {
    console.warn("[webSearch] Search failed:", error);
    return createEmptyResponse(query, startTime);
  }
}

/**
 * Reset the Tavily client (for testing)
 */
export function resetTavilyClient(): void {
  tavilyClient = null;
}
