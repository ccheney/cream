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
// Rate Limit Alerting
// ============================================

/**
 * Alert thresholds as percentage of limit used
 */
const ALERT_THRESHOLDS = {
  tavily: {
    minuteWarning: 0.8, // 80% of per-minute limit
    minuteCritical: 0.95, // 95% of per-minute limit
    dayWarning: 0.7, // 70% of daily limit
    dayCritical: 0.9, // 90% of daily limit
  },
} as const;

/**
 * Alert severity levels
 */
export type AlertSeverity = "warning" | "critical";

/**
 * Alert types
 */
export type RateLimitAlertType = "minute_limit" | "day_limit";

/**
 * Rate limit alert structure
 */
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

/**
 * Rate limit alerter with cooldown to prevent alert spam
 */
class RateLimitAlerter {
  private lastAlerts = new Map<string, number>();
  private readonly alertCooldownMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Check current usage and return any alerts that should be raised
   */
  check(provider: keyof typeof RATE_LIMITS): RateLimitAlert[] {
    const thresholds = ALERT_THRESHOLDS[provider];
    const limits = RATE_LIMITS[provider];
    if (!thresholds || !limits) {
      return [];
    }

    const remaining = rateLimiter.getRemainingQuota(provider);
    const alerts: RateLimitAlert[] = [];

    // Calculate usage percentages
    const minuteUsed = 1 - remaining.minute / limits.perMinute;
    const dayUsed = 1 - remaining.day / limits.perDay;

    // Check minute limit
    if (minuteUsed >= thresholds.minuteCritical) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "critical", minuteUsed, limits.perMinute)
      );
    } else if (minuteUsed >= thresholds.minuteWarning) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "warning", minuteUsed, limits.perMinute)
      );
    }

    // Check day limit
    if (dayUsed >= thresholds.dayCritical) {
      alerts.push(this.createAlert(provider, "day_limit", "critical", dayUsed, limits.perDay));
    } else if (dayUsed >= thresholds.dayWarning) {
      alerts.push(this.createAlert(provider, "day_limit", "warning", dayUsed, limits.perDay));
    }

    return this.filterCooldown(alerts);
  }

  /**
   * Create an alert object
   */
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

  /**
   * Filter alerts that are still within cooldown period
   */
  private filterCooldown(alerts: RateLimitAlert[]): RateLimitAlert[] {
    const now = Date.now();
    return alerts.filter((alert) => {
      const key = `${alert.provider}:${alert.type}:${alert.severity}`;
      const lastAlertTime = this.lastAlerts.get(key);

      if (lastAlertTime && now - lastAlertTime < this.alertCooldownMs) {
        return false; // Still in cooldown
      }

      // Record this alert
      this.lastAlerts.set(key, now);
      return true;
    });
  }

  /**
   * Reset alerter state (for testing)
   */
  reset(): void {
    this.lastAlerts.clear();
  }
}

export const rateLimitAlerter = new RateLimitAlerter();

/**
 * Check for rate limit alerts and log them
 * Call this after each webSearch request
 */
export function checkAndLogRateLimitAlerts(provider: keyof typeof RATE_LIMITS = "tavily"): void {
  const alerts = rateLimitAlerter.check(provider);
  for (const alert of alerts) {
    if (alert.severity === "critical") {
      // biome-ignore lint/suspicious/noConsole: Intentional logging for rate limit alerts
      console.error("[RATE_LIMIT_ALERT]", JSON.stringify(alert));
    } else {
      // biome-ignore lint/suspicious/noConsole: Intentional logging for rate limit alerts
      console.warn("[RATE_LIMIT_ALERT]", JSON.stringify(alert));
    }
  }
}

// ============================================
// Usage Metrics & Logging
// ============================================

/**
 * Request count aggregates for time windows
 */
export interface RequestCount {
  total: number;
  successful: number;
  cached: number;
}

/**
 * Aggregated web search metrics for monitoring and dashboards
 */
export interface WebSearchMetrics {
  // Request counts
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  rateLimitedRequests: number;

  // Latency (in milliseconds)
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Results
  averageResultCount: number;
  emptyResultCount: number;

  // Cost tracking
  apiCallsUsed: number;

  // Time windows
  lastHour: RequestCount;
  lastDay: RequestCount;
}

/**
 * Individual request record for metrics collection
 */
interface RequestRecord {
  timestamp: number;
  type: "success" | "cache_hit" | "rate_limited" | "error" | "backtest";
  latencyMs: number;
  resultCount: number;
}

/**
 * Metrics collector with memory-bounded storage
 */
class MetricsCollector {
  private requests: RequestRecord[] = [];
  private readonly maxRecords = 10000;

  /**
   * Record a request for metrics
   */
  record(record: RequestRecord): void {
    this.requests.push(record);

    // Prune old records (older than 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.requests = this.requests.filter((r) => r.timestamp > cutoff);

    // Limit memory
    if (this.requests.length > this.maxRecords) {
      this.requests = this.requests.slice(-this.maxRecords);
    }
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): WebSearchMetrics {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Filter by time windows
    const lastHourRequests = this.requests.filter((r) => r.timestamp > oneHourAgo);
    const lastDayRequests = this.requests.filter((r) => r.timestamp > oneDayAgo);

    // Calculate counts
    const successRequests = lastDayRequests.filter((r) => r.type === "success");
    const cacheHits = lastDayRequests.filter((r) => r.type === "cache_hit");
    const rateLimited = lastDayRequests.filter((r) => r.type === "rate_limited");
    const errors = lastDayRequests.filter((r) => r.type === "error");

    // Calculate latency percentiles from successful API calls (not cache hits)
    const latencies = successRequests.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    // Calculate averages
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const resultCounts = lastDayRequests.map((r) => r.resultCount);
    const avgResults =
      resultCounts.length > 0 ? resultCounts.reduce((a, b) => a + b, 0) / resultCounts.length : 0;

    const emptyResults = lastDayRequests.filter((r) => r.resultCount === 0).length;

    // Time window aggregates
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

  /**
   * Aggregate stats for a time window
   */
  private aggregateWindow(requests: RequestRecord[]): RequestCount {
    return {
      total: requests.length,
      successful: requests.filter((r) => r.type === "success").length,
      cached: requests.filter((r) => r.type === "cache_hit").length,
    };
  }

  /**
   * Reset collector (for testing)
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * Get record count (for testing)
   */
  getRecordCount(): number {
    return this.requests.length;
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Get current web search metrics (for dashboard integration)
 */
export function getWebSearchMetrics(): WebSearchMetrics {
  return metricsCollector.getMetrics();
}

/**
 * Structured log entry for web search operations
 */
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

/**
 * Log a structured web search entry
 * Uses JSON format for log aggregation systems
 */
function logWebSearch(
  entry: Partial<WebSearchLogEntry> & { event: WebSearchLogEntry["event"] }
): void {
  const fullEntry: WebSearchLogEntry = {
    timestamp: new Date().toISOString(),
    level: "info",
    provider: "tavily",
    cached: false,
    executionTimeMs: 0,
    queryHash: "",
    ...entry,
  };

  // Choose console method based on level
  // biome-ignore lint/suspicious/noConsole: Intentional structured logging
  const logFn =
    fullEntry.level === "error"
      ? console.error
      : fullEntry.level === "warn"
        ? console.warn
        : console.log;

  logFn("[WEB_SEARCH]", JSON.stringify(fullEntry));
}

// ============================================
// Security Configuration
// ============================================

const MAX_QUERY_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_SNIPPET_LENGTH = 1000;
const MAX_RAW_CONTENT_LENGTH = 10000;

/** Characters that could be used for injection attacks */
const DANGEROUS_CHARS = /[<>{}|\\^`]/g;

/** Allowed URL protocols */
const ALLOWED_PROTOCOLS = ["https:", "http:"];

/** Blocked TLDs for security */
const BLOCKED_TLDS = [".onion", ".local", ".internal"];

/** Patterns for internal/private IP addresses */
const INTERNAL_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // 127.0.0.0/8 (loopback)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8
  /^localhost$/i,
];

/**
 * Sanitize a search query for security
 * - Trims and limits length
 * - Removes potentially dangerous characters
 * - Normalizes whitespace
 */
export function sanitizeQuery(query: string): string {
  // Trim and limit length
  let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH);

  // Remove potentially dangerous characters
  sanitized = sanitized.replace(DANGEROUS_CHARS, "");

  // Normalize whitespace (collapse multiple spaces)
  sanitized = sanitized.replace(/\s+/g, " ");

  return sanitized;
}

/**
 * Check if a hostname is an internal/private IP address
 */
function isInternalIP(hostname: string): boolean {
  return INTERNAL_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validate a result URL for security
 * - Checks protocol is allowed
 * - Blocks internal IPs
 * - Blocks dangerous TLDs
 */
export function validateResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    // Check for blocked TLDs
    if (BLOCKED_TLDS.some((tld) => parsed.hostname.endsWith(tld))) {
      return false;
    }

    // Check for internal IP addresses
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
  const fullEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  // In production, this would go to a dedicated audit log system
  // biome-ignore lint/suspicious/noConsole: Intentional audit logging
  console.log("[AUDIT]", JSON.stringify(fullEntry));
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
 * @param params - Search parameters
 * @returns Search results with metadata
 */
export async function webSearch(params: WebSearchParams): Promise<WebSearchResponse> {
  const startTime = Date.now();

  // 1. Validate and parse params
  const parsed = WebSearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    // biome-ignore lint/suspicious/noConsole: Intentional warning log for invalid params
    console.warn("[webSearch] Invalid params:", parsed.error.message);
    return createEmptyResponse(params.query ?? "", startTime);
  }
  const { maxAgeHours, sources, topic, maxResults, symbols } = parsed.data;

  // 2. Security: Sanitize the query
  const query = sanitizeQuery(parsed.data.query);
  const queryHash = hashQueryForAudit(query);

  // 3. Backtest mode → empty results (don't cache)
  if (isBacktest()) {
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
    // biome-ignore lint/suspicious/noConsole: Intentional warning log for missing API key
    console.warn("[webSearch] TAVILY_API_KEY not configured");
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
