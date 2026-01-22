/**
 * High-level query wrapper for HelixDB.
 * @module
 */

import { QueryCache } from "./cache.js";
import { DEFAULT_CACHE_TTL_MS, DEFAULT_TIMEOUT_CONFIG, type QueryType } from "./constants.js";
import { executeWithFallback } from "./fallback.js";
import { MetricsCollector } from "./metrics.js";
import type {
	QueryFunction,
	QueryMetrics,
	QueryOptions,
	QueryResult,
	QueryWrapperOptions,
	TimeoutConfig,
} from "./types.js";

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
			this.timeoutConfig,
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
