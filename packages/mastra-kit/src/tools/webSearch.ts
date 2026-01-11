/**
 * Web Search Tool
 *
 * Provides real-time web search capabilities for agents with time-bounded results,
 * domain filtering, and topic specialization.
 *
 * @see docs/plans/21-web-search-tool.md
 */

import { type ExecutionContext, isBacktest } from "@cream/domain";
import { z } from "zod";
import { log } from "../logger.js";
import { createTavilyClientFromEnv, type TavilyClient } from "./providers/tavily.js";

export type WebSearchSource = "all" | "reddit" | "x" | "substack" | "blogs" | "news" | "financial";

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

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
  relevanceScore?: number;
  rawContent?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  metadata: {
    query: string;
    provider: "tavily";
    executionTimeMs: number;
    resultsFiltered: number;
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  results: WebSearchResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * maxResults excluded from cache key - can serve larger cached set with slice
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

function getCached(key: string): WebSearchResponse | null {
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

function setCache(key: string, results: WebSearchResponse): void {
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

class RateLimiter {
  private counts = new Map<string, RateLimitState>();

  canProceed(provider: keyof typeof RATE_LIMITS): boolean {
    const limits = RATE_LIMITS[provider];
    if (!limits) {
      return true;
    }

    const now = Date.now();
    const state = this.getState(provider, now);

    return state.minute < limits.perMinute && state.day < limits.perDay;
  }

  record(provider: keyof typeof RATE_LIMITS): void {
    const now = Date.now();
    const state = this.getState(provider, now);
    state.minute++;
    state.day++;
    this.counts.set(provider, state);
  }

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

    if (now >= state.minuteReset) {
      state.minute = 0;
      state.minuteReset = now + 60000;
    }

    if (now >= state.dayReset) {
      state.day = 0;
      state.dayReset = now + 86400000;
    }

    return state;
  }
}

export const rateLimiter = new RateLimiter();

const ALERT_THRESHOLDS = {
  tavily: {
    minuteWarning: 0.8,
    minuteCritical: 0.95,
    dayWarning: 0.7,
    dayCritical: 0.9,
  },
} as const;

export type AlertSeverity = "warning" | "critical";

export type RateLimitAlertType = "minute_limit" | "day_limit";

export interface RateLimitAlert {
  timestamp: string;
  provider: string;
  severity: AlertSeverity;
  type: RateLimitAlertType;
  current: number;
  limit: number;
  percentUsed: number;
  message: string;
}

class RateLimitAlerter {
  private lastAlerts = new Map<string, number>();
  private readonly alertCooldownMs = 5 * 60 * 1000;

  check(provider: keyof typeof RATE_LIMITS): RateLimitAlert[] {
    const thresholds = ALERT_THRESHOLDS[provider];
    const limits = RATE_LIMITS[provider];
    if (!thresholds || !limits) {
      return [];
    }

    const remaining = rateLimiter.getRemainingQuota(provider);
    const alerts: RateLimitAlert[] = [];

    const minuteUsed = 1 - remaining.minute / limits.perMinute;
    const dayUsed = 1 - remaining.day / limits.perDay;

    if (minuteUsed >= thresholds.minuteCritical) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "critical", minuteUsed, limits.perMinute)
      );
    } else if (minuteUsed >= thresholds.minuteWarning) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "warning", minuteUsed, limits.perMinute)
      );
    }

    if (dayUsed >= thresholds.dayCritical) {
      alerts.push(this.createAlert(provider, "day_limit", "critical", dayUsed, limits.perDay));
    } else if (dayUsed >= thresholds.dayWarning) {
      alerts.push(this.createAlert(provider, "day_limit", "warning", dayUsed, limits.perDay));
    }

    return this.filterCooldown(alerts);
  }

  private createAlert(
    provider: string,
    type: RateLimitAlertType,
    severity: AlertSeverity,
    percentUsed: number,
    limit: number
  ): RateLimitAlert {
    const current = Math.round(percentUsed * limit);
    const limitType = type === "minute_limit" ? "minute" : "daily";
    return {
      timestamp: new Date().toISOString(),
      provider,
      severity,
      type,
      current,
      limit,
      percentUsed,
      message: `${provider} ${limitType} rate limit ${severity}: ${Math.round(percentUsed * 100)}% used (${current}/${limit})`,
    };
  }

  private filterCooldown(alerts: RateLimitAlert[]): RateLimitAlert[] {
    const now = Date.now();
    return alerts.filter((alert) => {
      const key = `${alert.provider}:${alert.type}:${alert.severity}`;
      const lastAlertTime = this.lastAlerts.get(key);

      if (lastAlertTime && now - lastAlertTime < this.alertCooldownMs) {
        return false;
      }

      this.lastAlerts.set(key, now);
      return true;
    });
  }

  reset(): void {
    this.lastAlerts.clear();
  }
}

export const rateLimitAlerter = new RateLimitAlerter();

export function checkAndLogRateLimitAlerts(provider: keyof typeof RATE_LIMITS = "tavily"): void {
  const alerts = rateLimitAlerter.check(provider);
  for (const alert of alerts) {
    if (alert.severity === "critical") {
      log.error({ alert }, "Rate limit alert");
    } else {
      log.warn({ alert }, "Rate limit alert");
    }
  }
}

export interface RequestCount {
  total: number;
  successful: number;
  cached: number;
}

export interface WebSearchMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  rateLimitedRequests: number;

  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  averageResultCount: number;
  emptyResultCount: number;

  apiCallsUsed: number;

  lastHour: RequestCount;
  lastDay: RequestCount;
}

interface RequestRecord {
  timestamp: number;
  type: "success" | "cache_hit" | "rate_limited" | "error" | "backtest";
  latencyMs: number;
  resultCount: number;
}

class MetricsCollector {
  private requests: RequestRecord[] = [];
  private readonly maxRecords = 10000;

  record(record: RequestRecord): void {
    this.requests.push(record);

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.requests = this.requests.filter((r) => r.timestamp > cutoff);

    if (this.requests.length > this.maxRecords) {
      this.requests = this.requests.slice(-this.maxRecords);
    }
  }

  getMetrics(): WebSearchMetrics {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const lastHourRequests = this.requests.filter((r) => r.timestamp > oneHourAgo);
    const lastDayRequests = this.requests.filter((r) => r.timestamp > oneDayAgo);

    const successRequests = lastDayRequests.filter((r) => r.type === "success");
    const cacheHits = lastDayRequests.filter((r) => r.type === "cache_hit");
    const rateLimited = lastDayRequests.filter((r) => r.type === "rate_limited");
    const errors = lastDayRequests.filter((r) => r.type === "error");

    const latencies = successRequests.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const resultCounts = lastDayRequests.map((r) => r.resultCount);
    const avgResults =
      resultCounts.length > 0 ? resultCounts.reduce((a, b) => a + b, 0) / resultCounts.length : 0;

    const emptyResults = lastDayRequests.filter((r) => r.resultCount === 0).length;

    const lastHourStats = this.aggregateWindow(lastHourRequests);
    const lastDayStats = this.aggregateWindow(lastDayRequests);

    return {
      totalRequests: lastDayRequests.length,
      successfulRequests: successRequests.length,
      failedRequests: errors.length,
      cacheHits: cacheHits.length,
      rateLimitedRequests: rateLimited.length,

      averageLatencyMs: Math.round(avgLatency),
      p95LatencyMs: latencies[p95Index] ?? 0,
      p99LatencyMs: latencies[p99Index] ?? 0,

      averageResultCount: Math.round(avgResults * 10) / 10,
      emptyResultCount: emptyResults,

      apiCallsUsed: successRequests.length,

      lastHour: lastHourStats,
      lastDay: lastDayStats,
    };
  }

  private aggregateWindow(requests: RequestRecord[]): RequestCount {
    return {
      total: requests.length,
      successful: requests.filter((r) => r.type === "success").length,
      cached: requests.filter((r) => r.type === "cache_hit").length,
    };
  }

  reset(): void {
    this.requests = [];
  }

  getRecordCount(): number {
    return this.requests.length;
  }
}

export const metricsCollector = new MetricsCollector();

export function getWebSearchMetrics(): WebSearchMetrics {
  return metricsCollector.getMetrics();
}

export interface WebSearchLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: "request" | "cache_hit" | "rate_limited" | "api_error" | "success" | "backtest";
  queryHash: string;
  provider: "tavily";
  cached: boolean;
  executionTimeMs: number;
  resultCount?: number;
  sources?: string[];
  topic?: string;
  maxAgeHours?: number;
  error?: string;
}

function logWebSearch(
  entry: Partial<WebSearchLogEntry> & { event: WebSearchLogEntry["event"] }
): void {
  const { level = "info", ...data } = entry;
  const message = "Web search event";

  if (level === "error") {
    log.error(data, message);
  } else if (level === "warn") {
    log.warn(data, message);
  } else {
    log.info(data, message);
  }
}

const MAX_QUERY_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_SNIPPET_LENGTH = 1000;
const MAX_RAW_CONTENT_LENGTH = 10000;

const DANGEROUS_CHARS = /[<>{}|\\^`]/g;

const ALLOWED_PROTOCOLS = ["https:", "http:"];

const BLOCKED_TLDS = [".onion", ".local", ".internal"];

const INTERNAL_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
];

export function sanitizeQuery(query: string): string {
  let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH);
  sanitized = sanitized.replace(DANGEROUS_CHARS, "");
  sanitized = sanitized.replace(/\s+/g, " ");
  return sanitized;
}

function isInternalIP(hostname: string): boolean {
  return INTERNAL_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function validateResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    if (BLOCKED_TLDS.some((tld) => parsed.hostname.endsWith(tld))) {
      return false;
    }

    if (isInternalIP(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML content by removing tags
 */
function sanitizeHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Simple hash for audit logging (non-cryptographic)
 * Used to avoid logging raw queries while maintaining correlation
 */
function hashQueryForAudit(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Audit log entry for security monitoring
 */
interface AuditLogEntry {
  timestamp: string;
  action: "query" | "result_filtered" | "url_blocked";
  queryHash: string;
  details?: Record<string, unknown>;
}

/**
 * Log an audit entry for security monitoring
 */
function logAudit(entry: Omit<AuditLogEntry, "timestamp">): void {
  log.info({ audit: entry }, "Audit event");
}

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
 * with security sanitization, URL validation, and time filtering
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
  cutoffTime: Date,
  queryHash: string
): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];
  let urlsBlocked = 0;

  for (const result of results) {
    // Security: Validate URL before including result
    if (!validateResultUrl(result.url)) {
      urlsBlocked++;
      continue;
    }

    // Parse published date
    let publishedAt: Date | null = null;
    if (result.published_date) {
      publishedAt = new Date(result.published_date);
      // Skip if published before cutoff
      if (publishedAt < cutoffTime) {
        continue;
      }
    }

    // Security: Sanitize and limit content lengths
    normalized.push({
      title: sanitizeHtml(result.title).slice(0, MAX_TITLE_LENGTH),
      snippet: sanitizeHtml(result.content).slice(0, MAX_SNIPPET_LENGTH),
      url: result.url,
      source: extractDomain(result.url),
      publishedAt: publishedAt?.toISOString() ?? new Date().toISOString(),
      relevanceScore: result.score,
      rawContent: result.raw_content
        ? sanitizeHtml(result.raw_content).slice(0, MAX_RAW_CONTENT_LENGTH)
        : undefined,
    });
  }

  // Audit: Log if URLs were blocked
  if (urlsBlocked > 0) {
    logAudit({
      action: "url_blocked",
      queryHash,
      details: { count: urlsBlocked },
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
 * @param ctx - ExecutionContext
 * @param params - Search parameters
 * @returns Search results with metadata
 */
export async function webSearch(
  ctx: ExecutionContext,
  params: WebSearchParams
): Promise<WebSearchResponse> {
  const startTime = Date.now();

  // 1. Validate and parse params
  const parsed = WebSearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    log.warn({ error: parsed.error.message }, "Invalid web search params");
    return createEmptyResponse(params.query ?? "", startTime);
  }
  const { maxAgeHours, sources, topic, maxResults, symbols } = parsed.data;

  // 2. Security: Sanitize the query
  const query = sanitizeQuery(parsed.data.query);
  const queryHash = hashQueryForAudit(query);

  // 3. Backtest mode → empty results (don't cache)
  if (isBacktest(ctx)) {
    const executionTimeMs = Date.now() - startTime;
    logWebSearch({
      event: "backtest",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
    });
    metricsCollector.record({
      timestamp: Date.now(),
      type: "backtest",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });
    return createEmptyResponse(query, startTime);
  }

  // 4. Check cache before API call
  const cacheKey = getCacheKey({ ...parsed.data, query });
  const cached = getCached(cacheKey);
  if (cached) {
    const executionTimeMs = Date.now() - startTime;
    const resultCount = Math.min(cached.results.length, maxResults);

    // Log cache hit
    logWebSearch({
      event: "cache_hit",
      queryHash,
      executionTimeMs,
      resultCount,
      sources,
      topic,
      maxAgeHours,
      cached: true,
    });

    // Record cache hit metric
    metricsCollector.record({
      timestamp: Date.now(),
      type: "cache_hit",
      latencyMs: executionTimeMs,
      resultCount,
    });

    // Return cached result with updated execution time, sliced to requested maxResults
    return {
      results: cached.results.slice(0, maxResults),
      metadata: {
        ...cached.metadata,
        executionTimeMs,
      },
    };
  }

  // 5. Check rate limit before API call
  if (!rateLimiter.canProceed("tavily")) {
    const executionTimeMs = Date.now() - startTime;

    // Log rate limited request
    logWebSearch({
      level: "warn",
      event: "rate_limited",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
    });

    // Record rate limited metric
    metricsCollector.record({
      timestamp: Date.now(),
      type: "rate_limited",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });

    return createEmptyResponse(query, startTime);
  }

  // 6. Check for Tavily client
  const client = getTavilyClient();
  if (!client) {
    log.warn({}, "TAVILY_API_KEY not configured");
    return createEmptyResponse(query, startTime);
  }

  // 7. Build domain filters from sources
  const includeDomains = buildDomainFilter(sources);

  // 8. Calculate time bounds (hybrid filtering strategy)
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const timeRange = calculateTimeRange(maxAgeHours);

  // 9. Build enhanced query with symbols if provided
  let enhancedQuery = query;
  if (symbols && symbols.length > 0) {
    enhancedQuery = `${query} ${symbols.map((s) => `$${s}`).join(" ")}`;
  }

  // Audit: Log query execution (hash only, not raw query)
  logAudit({
    action: "query",
    queryHash,
    details: {
      topic,
      sources,
      maxAgeHours,
      hasSymbols: symbols && symbols.length > 0,
    },
  });

  try {
    // 10. Execute Tavily search
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
      const executionTimeMs = Date.now() - startTime;

      // Log API error
      logWebSearch({
        level: "error",
        event: "api_error",
        queryHash,
        executionTimeMs,
        resultCount: 0,
        sources,
        topic,
        maxAgeHours,
        error: result.error,
      });

      // Record error metric
      metricsCollector.record({
        timestamp: Date.now(),
        type: "error",
        latencyMs: executionTimeMs,
        resultCount: 0,
      });

      return createEmptyResponse(query, startTime);
    }

    // 11. Record successful API call for rate limiting
    rateLimiter.record("tavily");

    // 11b. Check for rate limit alerts after recording
    checkAndLogRateLimitAlerts("tavily");

    // 12. Client-side time filtering with security sanitization
    const filteredResults = normalizeResults(result.data.results, cutoffTime, queryHash);
    const resultsFiltered = result.data.results.length - filteredResults.length;
    const executionTimeMs = Date.now() - startTime;
    const resultCount = Math.min(filteredResults.length, maxResults);

    // Log successful search
    logWebSearch({
      event: "success",
      queryHash,
      executionTimeMs,
      resultCount,
      sources,
      topic,
      maxAgeHours,
    });

    // Record success metric
    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: executionTimeMs,
      resultCount,
    });

    const response: WebSearchResponse = {
      results: filteredResults.slice(0, maxResults),
      metadata: {
        query,
        provider: "tavily",
        executionTimeMs,
        resultsFiltered,
      },
    };

    // 13. Cache successful results (store full result set for reuse with different maxResults)
    const responseToCache: WebSearchResponse = {
      results: filteredResults,
      metadata: response.metadata,
    };
    setCache(cacheKey, responseToCache);

    return response;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    // Log exception
    logWebSearch({
      level: "error",
      event: "api_error",
      queryHash,
      executionTimeMs,
      resultCount: 0,
      sources,
      topic,
      maxAgeHours,
      error: String(error),
    });

    // Record error metric
    metricsCollector.record({
      timestamp: Date.now(),
      type: "error",
      latencyMs: executionTimeMs,
      resultCount: 0,
    });

    return createEmptyResponse(query, startTime);
  }
}

/**
 * Reset the Tavily client (for testing)
 */
export function resetTavilyClient(): void {
  tavilyClient = null;
}

// ============================================
// Batch Search
// ============================================

/**
 * Parameters for batch searching multiple symbols
 */
export interface BatchSearchParams {
  /** Base query template - {SYMBOL} will be replaced with each symbol */
  queryTemplate: string;
  /** Symbols to search for */
  symbols: string[];
  /** Common parameters for all searches */
  commonParams?: Omit<WebSearchParams, "query" | "symbols">;
}

/**
 * Response from a batch search operation
 */
export interface BatchSearchResponse {
  /** Results keyed by symbol */
  results: Record<string, WebSearchResult[]>;
  /** Aggregate metadata */
  metadata: {
    symbolsSearched: number;
    totalResults: number;
    queriesExecuted: number;
    cachedCount: number;
    executionTimeMs: number;
  };
}

/** Default concurrency limit for batch searches */
const BATCH_CONCURRENCY = 3;

/**
 * Chunk an array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Batch search for multiple symbols with concurrency control
 *
 * Executes searches for multiple symbols in parallel with a concurrency limit,
 * tracking cache hits separately from API calls. Each symbol gets its own
 * search query generated from the template.
 *
 * @param ctx - ExecutionContext
 * @param params - Batch search parameters
 * @returns Results keyed by symbol with aggregate metadata
 *
 * @example
 * ```typescript
 * const batch = await batchSearch(ctx, {
 *   queryTemplate: "{SYMBOL} stock sentiment Reddit",
 *   symbols: ["NVDA", "AAPL", "MSFT"],
 *   commonParams: {
 *     sources: ["reddit"],
 *     maxAgeHours: 24,
 *     topic: "finance",
 *   },
 * });
 *
 * // Access results per symbol
 * const nvdaResults = batch.results["NVDA"];
 * ```
 */
export async function batchSearch(
  ctx: ExecutionContext,
  params: BatchSearchParams
): Promise<BatchSearchResponse> {
  const startTime = Date.now();
  const results: Record<string, WebSearchResult[]> = {};
  let cachedCount = 0;
  let queriesExecuted = 0;

  // Handle empty symbols array
  if (params.symbols.length === 0) {
    return {
      results: {},
      metadata: {
        symbolsSearched: 0,
        totalResults: 0,
        queriesExecuted: 0,
        cachedCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  // Execute in parallel with concurrency limit
  const chunks = chunkArray(params.symbols, BATCH_CONCURRENCY);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (symbol) => {
      const query = params.queryTemplate.replace(/\{SYMBOL\}/g, symbol);

      try {
        const response = await webSearch(ctx, {
          query,
          symbols: [symbol],
          ...params.commonParams,
        });

        results[symbol] = response.results;

        // Heuristic: if execution time < 50ms, likely a cache hit
        // This is imperfect but avoids exposing cache internals
        if (response.metadata.executionTimeMs < 50) {
          cachedCount++;
        } else {
          queriesExecuted++;
        }
      } catch {
        // Error isolation - one failure doesn't fail the batch
        results[symbol] = [];
        queriesExecuted++;
      }
    });

    await Promise.all(chunkPromises);
  }

  return {
    results,
    metadata: {
      symbolsSearched: params.symbols.length,
      totalResults: Object.values(results).flat().length,
      queriesExecuted,
      cachedCount,
      executionTimeMs: Date.now() - startTime,
    },
  };
}
