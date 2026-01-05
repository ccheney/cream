/**
 * Query Module
 *
 * Timeout, caching, and fallback handling for HelixDB queries.
 */

export {
  type CacheEntry,
  type ContradictionResult,
  classifyError,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_COMBINED_TIMEOUT_MS,
  DEFAULT_GRAPH_TIMEOUT_MS,
  DEFAULT_TIMEOUT_CONFIG,
  // Constants
  DEFAULT_VECTOR_TIMEOUT_MS,
  // Contradiction resolution
  detectContradiction,
  // Fallback strategies
  executeWithFallback,
  type FallbackStrategy,
  type FreshnessInfo,
  getEmbeddingAgeHours,
  // Timeout functions
  getTimeoutForQueryType,
  // Freshness validation
  isEmbeddingStale,
  isRetryableError,
  // Metrics
  MetricsCollector,
  needsReembedding,
  // Cache
  QueryCache,
  // Error handling
  QueryError,
  QueryErrorType,
  type QueryErrorType as QueryErrorTypeValue,
  type QueryFunction,
  type QueryMetrics,
  type QueryOptions,
  type QueryResult,
  // Types
  QueryType,
  type QueryType as QueryTypeValue,
  // High-level wrapper
  QueryWrapper,
  type QueryWrapperOptions,
  resolveContradictions,
  STALE_EMBEDDING_THRESHOLD_MS,
  TIMEOUT_RATE_ALERT_THRESHOLD,
  type TimeoutConfig,
  validateFreshness,
  withTimeout,
} from "./timeout";
