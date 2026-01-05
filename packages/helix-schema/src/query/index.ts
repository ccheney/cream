/**
 * Query Module
 *
 * Timeout, caching, and fallback handling for HelixDB queries.
 */

export {
  // Constants
  DEFAULT_VECTOR_TIMEOUT_MS,
  DEFAULT_GRAPH_TIMEOUT_MS,
  DEFAULT_COMBINED_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
  STALE_EMBEDDING_THRESHOLD_MS,
  TIMEOUT_RATE_ALERT_THRESHOLD,
  DEFAULT_TIMEOUT_CONFIG,
  // Types
  QueryType,
  type QueryType as QueryTypeValue,
  type TimeoutConfig,
  type QueryResult,
  type CacheEntry,
  type FreshnessInfo,
  type ContradictionResult,
  type QueryMetrics,
  type FallbackStrategy,
  type QueryOptions,
  type QueryFunction,
  type QueryWrapperOptions,
  QueryErrorType,
  type QueryErrorType as QueryErrorTypeValue,
  // Timeout functions
  getTimeoutForQueryType,
  withTimeout,
  // Cache
  QueryCache,
  // Freshness validation
  isEmbeddingStale,
  getEmbeddingAgeHours,
  validateFreshness,
  needsReembedding,
  // Contradiction resolution
  detectContradiction,
  resolveContradictions,
  // Fallback strategies
  executeWithFallback,
  // Metrics
  MetricsCollector,
  // Error handling
  QueryError,
  classifyError,
  isRetryableError,
  // High-level wrapper
  QueryWrapper,
} from "./timeout";
