/**
 * Fallback strategy for HelixDB queries.
 * @module
 */

import type { QueryCache } from "./cache.js";
import { DEFAULT_TIMEOUT_CONFIG } from "./constants.js";
import { getTimeoutForQueryType, withTimeout } from "./execution.js";
import type { QueryFunction, QueryOptions, QueryResult, TimeoutConfig } from "./types.js";

interface FallbackContext {
	timeoutMs: number;
	cacheKey: string;
	fallbackStrategy: "cache" | "empty" | "partial";
	useCache: boolean;
	forceRefresh: boolean;
}

function buildFallbackContext(options: QueryOptions, config: TimeoutConfig): FallbackContext {
	return {
		timeoutMs: options.timeoutMs ?? getTimeoutForQueryType(options.queryType, config),
		cacheKey: options.cacheKey ?? `${options.queryType}:default`,
		fallbackStrategy: options.fallbackStrategy ?? "cache",
		useCache: options.useCache ?? true,
		forceRefresh: options.forceRefresh ?? false,
	};
}

function getCachedResult<T>(cache: QueryCache<T>, cacheKey: string): QueryResult<T> | null {
	const cached = cache.get(cacheKey);
	if (!cached) {
		return null;
	}
	return {
		data: cached.data,
		fromCache: true,
		timedOut: false,
		partial: false,
		executionTimeMs: 0,
		cacheKey,
	};
}

function getTimedOutCachedResult<T>(
	cache: QueryCache<T>,
	cacheKey: string,
	executionTimeMs: number,
): QueryResult<T> | null {
	const cached = cache.get(cacheKey);
	if (!cached) {
		return null;
	}
	return {
		data: cached.data,
		fromCache: true,
		timedOut: true,
		partial: false,
		executionTimeMs,
		cacheKey,
	};
}

function createFreshResult<T>(
	data: T[],
	executionTimeMs: number,
	cacheKey: string,
): QueryResult<T> {
	return {
		data,
		fromCache: false,
		timedOut: false,
		partial: false,
		executionTimeMs,
		cacheKey,
	};
}

function createTimedOutResult<T>(
	data: T[],
	executionTimeMs: number,
	cacheKey: string,
): QueryResult<T> {
	return {
		data,
		fromCache: false,
		timedOut: true,
		partial: data.length > 0,
		executionTimeMs,
		cacheKey,
	};
}

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
	config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG,
): Promise<QueryResult<T>> {
	const context = buildFallbackContext(options, config);
	if (context.useCache && !context.forceRefresh) {
		const cached = getCachedResult(cache, context.cacheKey);
		if (cached) return cached;
	}

	const result = await withTimeout(queryFn, context.timeoutMs);

	if (result.timedOut) {
		if (context.fallbackStrategy === "cache" && context.useCache) {
			const cached = getTimedOutCachedResult(cache, context.cacheKey, result.executionTimeMs);
			if (cached) return cached;
		}
		return createTimedOutResult(result.data, result.executionTimeMs, context.cacheKey);
	}

	if (context.useCache && result.data.length > 0) {
		cache.set(context.cacheKey, result.data, options.queryType);
	}

	return createFreshResult(result.data, result.executionTimeMs, context.cacheKey);
}
