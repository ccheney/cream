/**
 * Fallback strategy for HelixDB queries.
 * @module
 */

import type { QueryCache } from "./cache.js";
import { DEFAULT_TIMEOUT_CONFIG } from "./constants.js";
import { getTimeoutForQueryType, withTimeout } from "./execution.js";
import type { QueryFunction, QueryOptions, QueryResult, TimeoutConfig } from "./types.js";

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

	const result = await withTimeout(queryFn, timeoutMs);

	if (result.timedOut) {
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

		return {
			data: result.data,
			fromCache: false,
			timedOut: true,
			partial: result.data.length > 0,
			executionTimeMs: result.executionTimeMs,
			cacheKey,
		};
	}

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
