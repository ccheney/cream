/**
 * HelixDB Query Timeout and Fallback Handling
 *
 * Implements timeout handling, caching, and graceful degradation for
 * HelixDB queries to ensure retrieval doesn't block decision cycles.
 *
 * ## Timeout Configuration
 *
 * | Query Type | Average | Timeout (5x buffer) |
 * |------------|---------|---------------------|
 * | Vector     | 2ms     | 10ms                |
 * | Graph      | 1ms     | 5ms                 |
 * | Combined   | 5ms     | 20ms                |
 *
 * ## Fallback Strategy
 *
 * 1. Query exceeds timeout → log warning
 * 2. Return partial results if available
 * 3. Fallback to cached results (if cache hit)
 * 4. Don't block decision cycle → proceed without retrieval
 *
 * ## Graceful Degradation
 *
 * The system should degrade gracefully:
 * - No results → proceed with current data only
 * - Timeout → use cached results from previous cycle
 * - HelixDB unavailable → log error, continue without memory
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import { z } from "zod/v4";

// ============================================
// Constants
// ============================================

/**
 * Default timeout for vector search queries (ms)
 */
export const DEFAULT_VECTOR_TIMEOUT_MS = 10;

/**
 * Default timeout for graph traversal queries (ms)
 */
export const DEFAULT_GRAPH_TIMEOUT_MS = 5;

/**
 * Default timeout for combined (hybrid) queries (ms)
 */
export const DEFAULT_COMBINED_TIMEOUT_MS = 20;

/**
 * Default cache TTL (1 hour in ms)
 */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Stale embedding threshold (24 hours in ms)
 */
export const STALE_EMBEDDING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Timeout rate alert threshold (5%)
 */
export const TIMEOUT_RATE_ALERT_THRESHOLD = 0.05;

// ============================================
// Types
// ============================================

/**
 * Query type enum
 */
export const QueryType = z.enum(["vector", "graph", "combined"]);
export type QueryType = z.infer<typeof QueryType>;

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /** Vector search timeout (ms) */
  vectorTimeoutMs: number;
  /** Graph traversal timeout (ms) */
  graphTimeoutMs: number;
  /** Combined query timeout (ms) */
  combinedTimeoutMs: number;
}

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  vectorTimeoutMs: DEFAULT_VECTOR_TIMEOUT_MS,
  graphTimeoutMs: DEFAULT_GRAPH_TIMEOUT_MS,
  combinedTimeoutMs: DEFAULT_COMBINED_TIMEOUT_MS,
};

/**
 * Query result with metadata
 */
export interface QueryResult<T> {
  /** Query results */
  data: T[];
  /** Whether results are from cache */
  fromCache: boolean;
  /** Whether query timed out */
  timedOut: boolean;
  /** Whether partial results were returned */
  partial: boolean;
  /** Query execution time (ms) */
  executionTimeMs: number;
  /** Cache key (if cached) */
  cacheKey?: string;
}

/**
 * Cache entry with TTL tracking
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T[];
  /** When the entry was created */
  createdAt: Date;
  /** Time-to-live (ms) */
  ttlMs: number;
  /** Query key */
  key: string;
  /** Query type */
  queryType: QueryType;
}

/**
 * Data freshness information
 */
export interface FreshnessInfo {
  /** When embeddings were last updated */
  lastEmbeddingUpdate: Date;
  /** Whether embeddings are stale */
  isStale: boolean;
  /** Age in hours */
  ageHours: number;
  /** Current market regime */
  currentRegime?: string;
  /** Regime when embeddings were created */
  embeddingRegime?: string;
  /** Whether regime has changed */
  regimeChanged: boolean;
}

/**
 * Contradiction detection result
 */
export interface ContradictionResult {
  /** Whether contradiction was detected */
  hasContradiction: boolean;
  /** Description of the contradiction */
  description?: string;
  /** Resolution: which data source wins */
  resolution: "current" | "retrieved";
  /** Reason for resolution */
  reason: string;
}

/**
 * Query metrics for monitoring
 */
export interface QueryMetrics {
  /** Total queries */
  totalQueries: number;
  /** Queries that timed out */
  timeoutCount: number;
  /** Timeout rate */
  timeoutRate: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Latency percentiles (ms) */
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  /** Whether timeout rate exceeds alert threshold */
  alertRequired: boolean;
}

/**
 * Fallback strategy type
 */
export type FallbackStrategy = "cache" | "empty" | "partial";

/**
 * Query options
 */
export interface QueryOptions {
  /** Query type */
  queryType: QueryType;
  /** Timeout override (ms) */
  timeoutMs?: number;
  /** Whether to use cache */
  useCache?: boolean;
  /** Cache key */
  cacheKey?: string;
  /** Fallback strategy */
  fallbackStrategy?: FallbackStrategy;
  /** Force fresh data (skip initial cache lookup but allow fallback) */
  forceRefresh?: boolean;
}

/**
 * Query function signature
 */
export type QueryFunction<T> = () => Promise<T[]>;

// ============================================
// Timeout Functions
// ============================================

/**
 * Get timeout for a query type.
 *
 * @param queryType - Type of query
 * @param config - Timeout configuration
 * @returns Timeout in milliseconds
 */
export function getTimeoutForQueryType(
  queryType: QueryType,
  config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG
): number {
  switch (queryType) {
    case "vector":
      return config.vectorTimeoutMs;
    case "graph":
      return config.graphTimeoutMs;
    case "combined":
      return config.combinedTimeoutMs;
    default:
      return config.combinedTimeoutMs;
  }
}

/**
 * Execute a query with timeout.
 *
 * @param queryFn - Query function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Query result or timeout error
 */
export async function withTimeout<T>(
  queryFn: QueryFunction<T>,
  timeoutMs: number
): Promise<{ data: T[]; timedOut: boolean; executionTimeMs: number }> {
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), timeoutMs)
      ),
    ]);

    return {
      data: result,
      timedOut: false,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "Query timeout";
    return {
      data: [],
      timedOut: isTimeout,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================
// Cache Functions
// ============================================

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

    // Check if expired
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

// ============================================
// Freshness Validation
// ============================================

/**
 * Check if embeddings are stale.
 *
 * @param lastUpdate - Last embedding update time
 * @param thresholdMs - Staleness threshold (ms)
 * @returns Whether embeddings are stale
 */
export function isEmbeddingStale(
  lastUpdate: Date,
  thresholdMs: number = STALE_EMBEDDING_THRESHOLD_MS
): boolean {
  const ageMs = Date.now() - lastUpdate.getTime();
  return ageMs > thresholdMs;
}

/**
 * Calculate embedding age in hours.
 *
 * @param lastUpdate - Last embedding update time
 * @returns Age in hours
 */
export function getEmbeddingAgeHours(lastUpdate: Date): number {
  const ageMs = Date.now() - lastUpdate.getTime();
  return ageMs / (60 * 60 * 1000);
}

/**
 * Validate data freshness.
 *
 * @param lastEmbeddingUpdate - When embeddings were last updated
 * @param currentRegime - Current market regime
 * @param embeddingRegime - Regime when embeddings were created
 * @returns Freshness validation result
 */
export function validateFreshness(
  lastEmbeddingUpdate: Date,
  currentRegime?: string,
  embeddingRegime?: string
): FreshnessInfo {
  const isStale = isEmbeddingStale(lastEmbeddingUpdate);
  const ageHours = getEmbeddingAgeHours(lastEmbeddingUpdate);
  const regimeChanged =
    currentRegime !== undefined &&
    embeddingRegime !== undefined &&
    currentRegime !== embeddingRegime;

  return {
    lastEmbeddingUpdate,
    isStale,
    ageHours,
    currentRegime,
    embeddingRegime,
    regimeChanged,
  };
}

/**
 * Determine if re-embedding is needed.
 *
 * @param freshness - Freshness info
 * @returns Whether re-embedding should be triggered
 */
export function needsReembedding(freshness: FreshnessInfo): boolean {
  // Re-embed if stale or regime changed
  return freshness.isStale || freshness.regimeChanged;
}

// ============================================
// Contradiction Resolution
// ============================================

/**
 * Detect contradiction between retrieved and current data.
 *
 * Rule: Current market data takes precedence.
 * Retrieved context is used for historical patterns only.
 *
 * @param retrievedValue - Value from retrieved context
 * @param currentValue - Current market value
 * @param tolerance - Tolerance for comparison (e.g., 0.1 = 10%)
 * @returns Contradiction detection result
 */
export function detectContradiction(
  retrievedValue: number,
  currentValue: number,
  tolerance = 0.1
): ContradictionResult {
  if (currentValue === 0) {
    return {
      hasContradiction: retrievedValue !== 0,
      resolution: "current",
      reason: "Current value is zero, cannot calculate relative difference",
    };
  }

  const relativeDiff = Math.abs(retrievedValue - currentValue) / Math.abs(currentValue);
  const hasContradiction = relativeDiff > tolerance;

  return {
    hasContradiction,
    description: hasContradiction
      ? `Retrieved value (${retrievedValue.toFixed(2)}) differs from current (${currentValue.toFixed(2)}) by ${(relativeDiff * 100).toFixed(1)}%`
      : undefined,
    resolution: "current",
    reason: "Current market data takes precedence per contradiction resolution rule",
  };
}

/**
 * Resolve contradiction by choosing current data.
 *
 * @param retrievedData - Data from retrieval
 * @param currentData - Current market data
 * @param contradictionFields - Fields to check for contradictions
 * @returns Resolved data with contradictions flagged
 */
export function resolveContradictions<T extends Record<string, unknown>>(
  retrievedData: T,
  currentData: Partial<T>,
  contradictionFields: (keyof T)[]
): { resolved: T; contradictions: ContradictionResult[] } {
  const resolved = { ...retrievedData };
  const contradictions: ContradictionResult[] = [];

  for (const field of contradictionFields) {
    const retrievedValue = retrievedData[field];
    const currentValue = currentData[field];

    if (typeof retrievedValue === "number" && typeof currentValue === "number") {
      const contradiction = detectContradiction(retrievedValue, currentValue);
      if (contradiction.hasContradiction) {
        (resolved as Record<string, unknown>)[field as string] = currentValue;
        contradictions.push({
          ...contradiction,
          description: `Field "${String(field)}": ${contradiction.description}`,
        });
      }
    }
  }

  return { resolved, contradictions };
}

// ============================================
// Fallback Strategies
// ============================================

/**
 * Execute query with fallback strategy.
 *
 * @param queryFn - Query function to execute
 * @param cache - Query cache
 * @param options - Query options
 * @param config - Timeout configuration
 * @returns Query result with fallback handling
 */
export async function executeWithFallback<T>(
  queryFn: QueryFunction<T>,
  cache: QueryCache<T>,
  options: QueryOptions,
  config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG
): Promise<QueryResult<T>> {
  const timeoutMs = options.timeoutMs ?? getTimeoutForQueryType(options.queryType, config);
  const cacheKey = options.cacheKey ?? `${options.queryType}:default`;
  const fallbackStrategy = options.fallbackStrategy ?? "cache";
  const useCache = options.useCache ?? true;
  const forceRefresh = options.forceRefresh ?? false;

  // Try to get from cache first if enabled (unless forceRefresh)
  if (useCache && !forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        data: cached.data,
        fromCache: true,
        timedOut: false,
        partial: false,
        executionTimeMs: 0,
        cacheKey,
      };
    }
  }

  // Execute query with timeout
  const result = await withTimeout(queryFn, timeoutMs);

  // Handle timeout
  if (result.timedOut) {
    // Try cache fallback
    if (fallbackStrategy === "cache" && useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          timedOut: true,
          partial: false,
          executionTimeMs: result.executionTimeMs,
          cacheKey,
        };
      }
    }

    // Return empty or partial based on strategy
    return {
      data: result.data, // May contain partial results
      fromCache: false,
      timedOut: true,
      partial: result.data.length > 0,
      executionTimeMs: result.executionTimeMs,
      cacheKey,
    };
  }

  // Cache successful result
  if (useCache && result.data.length > 0) {
    cache.set(cacheKey, result.data, options.queryType);
  }

  return {
    data: result.data,
    fromCache: false,
    timedOut: false,
    partial: false,
    executionTimeMs: result.executionTimeMs,
    cacheKey,
  };
}

// ============================================
// Metrics Collection
// ============================================

/**
 * Query metrics collector.
 */
export class MetricsCollector {
  private latencies: number[] = [];
  private timeouts = 0;
  private cacheHits = 0;
  private totalQueries = 0;

  /**
   * Record a query execution.
   *
   * @param latencyMs - Query latency in ms
   * @param timedOut - Whether query timed out
   * @param fromCache - Whether result was from cache
   */
  record(latencyMs: number, timedOut: boolean, fromCache: boolean): void {
    this.totalQueries++;
    this.latencies.push(latencyMs);

    if (timedOut) {
      this.timeouts++;
    }
    if (fromCache) {
      this.cacheHits++;
    }

    // Keep last 1000 latencies for percentile calculation
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  /**
   * Calculate percentile from sorted array.
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): QueryMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const timeoutRate = this.totalQueries > 0 ? this.timeouts / this.totalQueries : 0;
    const cacheHitRate = this.totalQueries > 0 ? this.cacheHits / this.totalQueries : 0;

    return {
      totalQueries: this.totalQueries,
      timeoutCount: this.timeouts,
      timeoutRate,
      cacheHits: this.cacheHits,
      cacheHitRate,
      latencyP50: this.percentile(sorted, 50),
      latencyP95: this.percentile(sorted, 95),
      latencyP99: this.percentile(sorted, 99),
      alertRequired: timeoutRate > TIMEOUT_RATE_ALERT_THRESHOLD,
    };
  }

  /**
   * Reset metrics.
   */
  reset(): void {
    this.latencies = [];
    this.timeouts = 0;
    this.cacheHits = 0;
    this.totalQueries = 0;
  }
}

// ============================================
// Error Handling
// ============================================

/**
 * Query error types
 */
export const QueryErrorType = z.enum([
  "timeout",
  "network",
  "syntax",
  "index_not_ready",
  "out_of_memory",
  "unknown",
]);
export type QueryErrorType = z.infer<typeof QueryErrorType>;

/**
 * Query error with classification
 */
export class QueryError extends Error {
  readonly errorType: QueryErrorType;
  readonly retryable: boolean;

  constructor(message: string, errorType: QueryErrorType, retryable = false) {
    super(message);
    this.name = "QueryError";
    this.errorType = errorType;
    this.retryable = retryable;
  }
}

/**
 * Classify an error into a query error type.
 *
 * @param error - Error to classify
 * @returns Classified query error
 */
export function classifyError(error: unknown): QueryError {
  if (error instanceof QueryError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("timeout")) {
    return new QueryError(message, "timeout", true);
  }
  if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
    return new QueryError(message, "network", true);
  }
  if (lowerMessage.includes("syntax") || lowerMessage.includes("parse")) {
    return new QueryError(message, "syntax", false);
  }
  if (lowerMessage.includes("index") && lowerMessage.includes("not ready")) {
    return new QueryError(message, "index_not_ready", true);
  }
  if (lowerMessage.includes("memory")) {
    return new QueryError(message, "out_of_memory", false);
  }

  return new QueryError(message, "unknown", false);
}

/**
 * Check if error is retryable.
 *
 * @param error - Error to check
 * @returns Whether the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.retryable;
}

// ============================================
// High-Level Query Wrapper
// ============================================

/**
 * Options for the query wrapper
 */
export interface QueryWrapperOptions {
  /** Timeout configuration */
  timeoutConfig?: TimeoutConfig;
  /** Cache TTL (ms) */
  cacheTtlMs?: number;
  /** Whether to enable caching */
  enableCache?: boolean;
  /** Whether to collect metrics */
  enableMetrics?: boolean;
}

/**
 * High-level query wrapper with timeout, caching, and metrics.
 */
export class QueryWrapper<T = unknown> {
  private readonly cache: QueryCache<T>;
  private readonly metrics: MetricsCollector;
  private readonly timeoutConfig: TimeoutConfig;
  private readonly enableCache: boolean;
  private readonly enableMetrics: boolean;

  constructor(options: QueryWrapperOptions = {}) {
    this.cache = new QueryCache<T>(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.metrics = new MetricsCollector();
    this.timeoutConfig = options.timeoutConfig ?? DEFAULT_TIMEOUT_CONFIG;
    this.enableCache = options.enableCache ?? true;
    this.enableMetrics = options.enableMetrics ?? true;
  }

  /**
   * Execute a query with full timeout/cache/metrics handling.
   *
   * @param queryFn - Query function to execute
   * @param options - Query options
   * @returns Query result
   */
  async execute(queryFn: QueryFunction<T>, options: QueryOptions): Promise<QueryResult<T>> {
    const result = await executeWithFallback(
      queryFn,
      this.cache,
      { ...options, useCache: this.enableCache },
      this.timeoutConfig
    );

    if (this.enableMetrics) {
      this.metrics.record(result.executionTimeMs, result.timedOut, result.fromCache);
    }

    return result;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): QueryMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; keys: string[] } {
    return this.cache.getStats();
  }

  /**
   * Invalidate cache by query type.
   */
  invalidateCache(queryType?: QueryType): void {
    if (queryType) {
      this.cache.invalidateByType(queryType);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics.reset();
  }
}
