/**
 * HelixDB Query Timeout and Fallback Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	classifyError,
	DEFAULT_CACHE_TTL_MS,
	DEFAULT_COMBINED_TIMEOUT_MS,
	DEFAULT_GRAPH_TIMEOUT_MS,
	DEFAULT_TIMEOUT_CONFIG,
	// Constants
	DEFAULT_VECTOR_TIMEOUT_MS,
	detectContradiction,
	executeWithFallback,
	getEmbeddingAgeHours,
	// Functions
	getTimeoutForQueryType,
	isEmbeddingStale,
	isRetryableError,
	MetricsCollector,
	needsReembedding,
	QueryCache,
	QueryError,
	type QueryOptions,
	// Types
	QueryType,
	QueryWrapper,
	resolveContradictions,
	STALE_EMBEDDING_THRESHOLD_MS,
	TIMEOUT_RATE_ALERT_THRESHOLD,
	validateFreshness,
	withTimeout,
} from "../src/query/timeout";

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
	it("DEFAULT_VECTOR_TIMEOUT_MS is 10ms", () => {
		expect(DEFAULT_VECTOR_TIMEOUT_MS).toBe(10);
	});

	it("DEFAULT_GRAPH_TIMEOUT_MS is 5ms", () => {
		expect(DEFAULT_GRAPH_TIMEOUT_MS).toBe(5);
	});

	it("DEFAULT_COMBINED_TIMEOUT_MS is 20ms", () => {
		expect(DEFAULT_COMBINED_TIMEOUT_MS).toBe(20);
	});

	it("DEFAULT_CACHE_TTL_MS is 1 hour", () => {
		expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 60 * 1000);
	});

	it("STALE_EMBEDDING_THRESHOLD_MS is 24 hours", () => {
		expect(STALE_EMBEDDING_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
	});

	it("TIMEOUT_RATE_ALERT_THRESHOLD is 5%", () => {
		expect(TIMEOUT_RATE_ALERT_THRESHOLD).toBe(0.05);
	});

	it("DEFAULT_TIMEOUT_CONFIG has correct values", () => {
		expect(DEFAULT_TIMEOUT_CONFIG.vectorTimeoutMs).toBe(10);
		expect(DEFAULT_TIMEOUT_CONFIG.graphTimeoutMs).toBe(5);
		expect(DEFAULT_TIMEOUT_CONFIG.combinedTimeoutMs).toBe(20);
	});
});

// ============================================
// QueryType Tests
// ============================================

describe("QueryType", () => {
	it("accepts valid query types", () => {
		expect(QueryType.parse("vector")).toBe("vector");
		expect(QueryType.parse("graph")).toBe("graph");
		expect(QueryType.parse("combined")).toBe("combined");
	});

	it("rejects invalid types", () => {
		const result = QueryType.safeParse("invalid");
		expect(result.success).toBe(false);
	});
});

// ============================================
// Timeout Functions Tests
// ============================================

describe("getTimeoutForQueryType", () => {
	it("returns correct timeout for vector queries", () => {
		expect(getTimeoutForQueryType("vector")).toBe(10);
	});

	it("returns correct timeout for graph queries", () => {
		expect(getTimeoutForQueryType("graph")).toBe(5);
	});

	it("returns correct timeout for combined queries", () => {
		expect(getTimeoutForQueryType("combined")).toBe(20);
	});

	it("accepts custom config", () => {
		const config = { vectorTimeoutMs: 50, graphTimeoutMs: 25, combinedTimeoutMs: 100 };
		expect(getTimeoutForQueryType("vector", config)).toBe(50);
	});
});

describe("withTimeout", () => {
	it("returns data when query completes in time", async () => {
		const queryFn = async () => [1, 2, 3];
		const result = await withTimeout(queryFn, 100);

		expect(result.data).toEqual([1, 2, 3]);
		expect(result.timedOut).toBe(false);
		expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
	});

	it("returns empty data when query times out", async () => {
		const queryFn = async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return [1, 2, 3];
		};
		const result = await withTimeout(queryFn, 10);

		expect(result.data).toEqual([]);
		expect(result.timedOut).toBe(true);
	});

	it("records execution time", async () => {
		const queryFn = async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			return [1];
		};
		const result = await withTimeout(queryFn, 100);

		expect(result.executionTimeMs).toBeGreaterThanOrEqual(15);
	});
});

// ============================================
// Cache Tests
// ============================================

describe("QueryCache", () => {
	let cache: QueryCache<number>;

	beforeEach(() => {
		cache = new QueryCache<number>(1000); // 1 second TTL for testing
	});

	it("stores and retrieves entries", () => {
		cache.set("key1", [1, 2, 3], "vector");
		const entry = cache.get("key1");

		expect(entry).toBeDefined();
		expect(entry?.data).toEqual([1, 2, 3]);
		expect(entry?.queryType).toBe("vector");
	});

	it("returns undefined for missing keys", () => {
		expect(cache.get("nonexistent")).toBeUndefined();
	});

	it("expires entries after TTL", async () => {
		cache.set("expiring", [1, 2, 3], "vector", 50); // 50ms TTL
		expect(cache.get("expiring")).toBeDefined();

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cache.get("expiring")).toBeUndefined();
	});

	it("deletes entries", () => {
		cache.set("to_delete", [1, 2, 3], "vector");
		expect(cache.get("to_delete")).toBeDefined();

		cache.delete("to_delete");
		expect(cache.get("to_delete")).toBeUndefined();
	});

	it("clears all entries", () => {
		cache.set("key1", [1], "vector");
		cache.set("key2", [2], "graph");

		cache.clear();

		expect(cache.get("key1")).toBeUndefined();
		expect(cache.get("key2")).toBeUndefined();
	});

	it("invalidates by query type", () => {
		cache.set("vector1", [1], "vector");
		cache.set("vector2", [2], "vector");
		cache.set("graph1", [3], "graph");

		cache.invalidateByType("vector");

		expect(cache.get("vector1")).toBeUndefined();
		expect(cache.get("vector2")).toBeUndefined();
		expect(cache.get("graph1")).toBeDefined();
	});

	it("reports statistics", () => {
		cache.set("key1", [1], "vector");
		cache.set("key2", [2], "graph");

		const stats = cache.getStats();
		expect(stats.size).toBe(2);
		expect(stats.keys).toContain("key1");
		expect(stats.keys).toContain("key2");
	});
});

// ============================================
// Freshness Validation Tests
// ============================================

describe("isEmbeddingStale", () => {
	it("returns false for recent embeddings", () => {
		const recentDate = new Date();
		expect(isEmbeddingStale(recentDate)).toBe(false);
	});

	it("returns true for old embeddings", () => {
		const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
		expect(isEmbeddingStale(oldDate)).toBe(true);
	});

	it("accepts custom threshold", () => {
		const date = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
		expect(isEmbeddingStale(date, 1 * 60 * 60 * 1000)).toBe(true); // 1 hour threshold
		expect(isEmbeddingStale(date, 3 * 60 * 60 * 1000)).toBe(false); // 3 hour threshold
	});
});

describe("getEmbeddingAgeHours", () => {
	it("calculates age in hours", () => {
		const date = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
		expect(getEmbeddingAgeHours(date)).toBeCloseTo(3, 0);
	});

	it("returns 0 for current time", () => {
		const date = new Date();
		expect(getEmbeddingAgeHours(date)).toBeLessThan(0.01);
	});
});

describe("validateFreshness", () => {
	it("detects stale embeddings", () => {
		const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
		const result = validateFreshness(oldDate);

		expect(result.isStale).toBe(true);
		expect(result.ageHours).toBeCloseTo(25, 0);
	});

	it("detects regime changes", () => {
		const result = validateFreshness(new Date(), "BULLISH", "BEARISH");

		expect(result.regimeChanged).toBe(true);
	});

	it("reports no regime change when regimes match", () => {
		const result = validateFreshness(new Date(), "BULLISH", "BULLISH");

		expect(result.regimeChanged).toBe(false);
	});
});

describe("needsReembedding", () => {
	it("returns true for stale embeddings", () => {
		const freshness = validateFreshness(new Date(Date.now() - 25 * 60 * 60 * 1000));
		expect(needsReembedding(freshness)).toBe(true);
	});

	it("returns true for regime changes", () => {
		const freshness = validateFreshness(new Date(), "BULLISH", "BEARISH");
		expect(needsReembedding(freshness)).toBe(true);
	});

	it("returns false for fresh embeddings without regime change", () => {
		const freshness = validateFreshness(new Date(), "BULLISH", "BULLISH");
		expect(needsReembedding(freshness)).toBe(false);
	});
});

// ============================================
// Contradiction Resolution Tests
// ============================================

describe("detectContradiction", () => {
	it("detects contradiction when values differ significantly", () => {
		const result = detectContradiction(100, 80, 0.1);

		expect(result.hasContradiction).toBe(true);
		expect(result.resolution).toBe("current");
	});

	it("no contradiction when values are similar", () => {
		const result = detectContradiction(100, 105, 0.1);

		expect(result.hasContradiction).toBe(false);
	});

	it("handles zero current value", () => {
		const result = detectContradiction(100, 0, 0.1);

		expect(result.resolution).toBe("current");
	});

	it("respects custom tolerance", () => {
		// 20% difference
		expect(detectContradiction(100, 80, 0.25).hasContradiction).toBe(false);
		expect(detectContradiction(100, 80, 0.15).hasContradiction).toBe(true);
	});
});

describe("resolveContradictions", () => {
	it("resolves contradicting fields with current values", () => {
		const retrieved = { price: 100, volume: 1000, name: "AAPL" };
		const current = { price: 120 };

		const { resolved, contradictions } = resolveContradictions(retrieved, current, ["price"]);

		expect(resolved.price).toBe(120);
		expect(contradictions.length).toBe(1);
		expect(contradictions[0].hasContradiction).toBe(true);
	});

	it("preserves non-contradicting fields", () => {
		const retrieved = { price: 100, volume: 1000 };
		const current = { price: 105 };

		const { resolved } = resolveContradictions(retrieved, current, ["price"]);

		expect(resolved.volume).toBe(1000);
	});
});

// ============================================
// Fallback Strategy Tests
// ============================================

describe("executeWithFallback", () => {
	let cache: QueryCache<number>;

	beforeEach(() => {
		cache = new QueryCache<number>(10000);
	});

	it("returns results for successful queries", async () => {
		const queryFn = async () => [1, 2, 3];
		const options: QueryOptions = { queryType: "vector", cacheKey: "test" };

		const result = await executeWithFallback(queryFn, cache, options);

		expect(result.data).toEqual([1, 2, 3]);
		expect(result.fromCache).toBe(false);
		expect(result.timedOut).toBe(false);
	});

	it("caches successful results", async () => {
		const queryFn = async () => [1, 2, 3];
		const options: QueryOptions = { queryType: "vector", cacheKey: "cached" };

		await executeWithFallback(queryFn, cache, options);
		const cached = cache.get("cached");

		expect(cached).toBeDefined();
		expect(cached?.data).toEqual([1, 2, 3]);
	});

	it("returns cached results when available", async () => {
		cache.set("precached", [4, 5, 6], "vector");
		const queryFn = async () => [1, 2, 3]; // Should not be called
		const options: QueryOptions = { queryType: "vector", cacheKey: "precached" };

		const result = await executeWithFallback(queryFn, cache, options);

		expect(result.data).toEqual([4, 5, 6]);
		expect(result.fromCache).toBe(true);
	});

	it("falls back to cache on timeout", async () => {
		cache.set("fallback", [4, 5, 6], "vector");
		const queryFn = async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return [1, 2, 3];
		};
		const options: QueryOptions = {
			queryType: "vector",
			cacheKey: "fallback",
			timeoutMs: 10,
			useCache: true,
			forceRefresh: true, // Skip initial cache, but allow fallback
			fallbackStrategy: "cache",
		};

		const result = await executeWithFallback(queryFn, cache, options);

		expect(result.data).toEqual([4, 5, 6]);
		expect(result.fromCache).toBe(true);
		expect(result.timedOut).toBe(true);
	});

	it("returns empty when timeout and no cache", async () => {
		const queryFn = async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return [1, 2, 3];
		};
		const options: QueryOptions = {
			queryType: "vector",
			cacheKey: "nocache",
			timeoutMs: 10,
		};

		const result = await executeWithFallback(queryFn, cache, options);

		expect(result.data).toEqual([]);
		expect(result.timedOut).toBe(true);
	});
});

// ============================================
// Metrics Tests
// ============================================

describe("MetricsCollector", () => {
	let metrics: MetricsCollector;

	beforeEach(() => {
		metrics = new MetricsCollector();
	});

	it("records query executions", () => {
		metrics.record(10, false, false);
		metrics.record(20, false, false);

		const result = metrics.getMetrics();
		expect(result.totalQueries).toBe(2);
	});

	it("tracks timeout rate", () => {
		metrics.record(10, false, false);
		metrics.record(10, true, false);
		metrics.record(10, true, false);

		const result = metrics.getMetrics();
		expect(result.timeoutRate).toBeCloseTo(2 / 3, 2);
	});

	it("tracks cache hit rate", () => {
		metrics.record(0, false, true);
		metrics.record(10, false, false);

		const result = metrics.getMetrics();
		expect(result.cacheHitRate).toBe(0.5);
	});

	it("calculates latency percentiles", () => {
		for (let i = 1; i <= 100; i++) {
			metrics.record(i, false, false);
		}

		const result = metrics.getMetrics();
		expect(result.latencyP50).toBeCloseTo(50, 0);
		expect(result.latencyP95).toBeCloseTo(95, 0);
		expect(result.latencyP99).toBeCloseTo(99, 0);
	});

	it("alerts when timeout rate exceeds threshold", () => {
		// 6 timeouts out of 100 = 6%
		for (let i = 0; i < 94; i++) {
			metrics.record(10, false, false);
		}
		for (let i = 0; i < 6; i++) {
			metrics.record(10, true, false);
		}

		const result = metrics.getMetrics();
		expect(result.alertRequired).toBe(true);
	});

	it("resets metrics", () => {
		metrics.record(10, true, true);
		metrics.reset();

		const result = metrics.getMetrics();
		expect(result.totalQueries).toBe(0);
		expect(result.timeoutCount).toBe(0);
	});
});

// ============================================
// Error Handling Tests
// ============================================

describe("QueryError", () => {
	it("creates error with type and retryable flag", () => {
		const error = new QueryError("Test error", "timeout", true);

		expect(error.message).toBe("Test error");
		expect(error.errorType).toBe("timeout");
		expect(error.retryable).toBe(true);
	});
});

describe("classifyError", () => {
	it("classifies timeout errors", () => {
		const error = classifyError(new Error("Query timeout exceeded"));
		expect(error.errorType).toBe("timeout");
		expect(error.retryable).toBe(true);
	});

	it("classifies network errors", () => {
		const error = classifyError(new Error("Network connection failed"));
		expect(error.errorType).toBe("network");
		expect(error.retryable).toBe(true);
	});

	it("classifies syntax errors", () => {
		const error = classifyError(new Error("Query syntax error"));
		expect(error.errorType).toBe("syntax");
		expect(error.retryable).toBe(false);
	});

	it("classifies index not ready errors", () => {
		const error = classifyError(new Error("Index not ready yet"));
		expect(error.errorType).toBe("index_not_ready");
		expect(error.retryable).toBe(true);
	});

	it("classifies memory errors", () => {
		const error = classifyError(new Error("Out of memory"));
		expect(error.errorType).toBe("out_of_memory");
		expect(error.retryable).toBe(false);
	});

	it("classifies unknown errors", () => {
		const error = classifyError(new Error("Something weird happened"));
		expect(error.errorType).toBe("unknown");
		expect(error.retryable).toBe(false);
	});
});

describe("isRetryableError", () => {
	it("returns true for retryable errors", () => {
		expect(isRetryableError(new Error("Network error"))).toBe(true);
		expect(isRetryableError(new Error("Query timeout"))).toBe(true);
	});

	it("returns false for non-retryable errors", () => {
		expect(isRetryableError(new Error("Syntax error"))).toBe(false);
		expect(isRetryableError(new Error("Out of memory"))).toBe(false);
	});
});

// ============================================
// QueryWrapper Tests
// ============================================

describe("QueryWrapper", () => {
	it("executes queries with full handling", async () => {
		const wrapper = new QueryWrapper<number>();
		const result = await wrapper.execute(async () => [1, 2, 3], {
			queryType: "vector",
			cacheKey: "test",
		});

		expect(result.data).toEqual([1, 2, 3]);
		expect(result.fromCache).toBe(false);
	});

	it("caches and returns cached results", async () => {
		const wrapper = new QueryWrapper<number>();

		// First call - cache miss
		await wrapper.execute(async () => [1, 2, 3], { queryType: "vector", cacheKey: "cached" });

		// Second call - cache hit
		const result = await wrapper.execute(
			async () => [4, 5, 6], // Should not be called
			{ queryType: "vector", cacheKey: "cached" },
		);

		expect(result.data).toEqual([1, 2, 3]);
		expect(result.fromCache).toBe(true);
	});

	it("collects metrics", async () => {
		const wrapper = new QueryWrapper<number>();

		await wrapper.execute(async () => [1], { queryType: "vector" });
		await wrapper.execute(async () => [2], { queryType: "graph" });

		const metrics = wrapper.getMetrics();
		expect(metrics.totalQueries).toBe(2);
	});

	it("invalidates cache", async () => {
		const wrapper = new QueryWrapper<number>();

		await wrapper.execute(async () => [1], { queryType: "vector", cacheKey: "inv" });
		wrapper.invalidateCache();

		const stats = wrapper.getCacheStats();
		expect(stats.size).toBe(0);
	});

	it("respects disabled caching", async () => {
		const wrapper = new QueryWrapper<number>({ enableCache: false });

		await wrapper.execute(async () => [1], { queryType: "vector", cacheKey: "test" });

		const stats = wrapper.getCacheStats();
		expect(stats.size).toBe(0);
	});
});
