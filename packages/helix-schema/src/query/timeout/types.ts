/**
 * Type definitions for HelixDB query timeout handling.
 * @module
 */

import type { QueryType } from "./constants.js";

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
