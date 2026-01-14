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
 * 1. Query exceeds timeout -> log warning
 * 2. Return partial results if available
 * 3. Fallback to cached results (if cache hit)
 * 4. Don't block decision cycle -> proceed without retrieval
 *
 * ## Graceful Degradation
 *
 * The system should degrade gracefully:
 * - No results -> proceed with current data only
 * - Timeout -> use cached results from previous cycle
 * - HelixDB unavailable -> log error, continue without memory
 *
 * @see docs/plans/04-memory-helixdb.md
 * @module
 */

// Cache
export { QueryCache } from "./cache.js";

// Constants
export {
	DEFAULT_CACHE_TTL_MS,
	DEFAULT_COMBINED_TIMEOUT_MS,
	DEFAULT_GRAPH_TIMEOUT_MS,
	DEFAULT_TIMEOUT_CONFIG,
	DEFAULT_VECTOR_TIMEOUT_MS,
	QueryType,
	STALE_EMBEDDING_THRESHOLD_MS,
	TIMEOUT_RATE_ALERT_THRESHOLD,
} from "./constants.js";
// Contradiction
export { detectContradiction, resolveContradictions } from "./contradiction.js";
// Error
export { classifyError, isRetryableError, QueryError, QueryErrorType } from "./error.js";
// Execution
export { getTimeoutForQueryType, withTimeout } from "./execution.js";
// Fallback
export { executeWithFallback } from "./fallback.js";
// Freshness
export {
	getEmbeddingAgeHours,
	isEmbeddingStale,
	needsReembedding,
	validateFreshness,
} from "./freshness.js";

// Metrics
export { MetricsCollector } from "./metrics.js";
// Types
export type {
	CacheEntry,
	ContradictionResult,
	FallbackStrategy,
	FreshnessInfo,
	QueryFunction,
	QueryMetrics,
	QueryOptions,
	QueryResult,
	QueryWrapperOptions,
	TimeoutConfig,
} from "./types.js";

// Wrapper
export { QueryWrapper } from "./wrapper.js";
