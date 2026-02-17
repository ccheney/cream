/**
 * Timeout Cache and Metrics Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	// Fallback tests
	executeWithFallback,
	MetricsCollector,
	QueryCache,
	type QueryOptions,
} from "../src/query/timeout";

// ============================================
// Cache Tests
// ============================================

describe("QueryCache storage behavior", () => {
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
});

describe("QueryCache expiration and invalidation", () => {
	let cache: QueryCache<number>;

	beforeEach(() => {
		cache = new QueryCache<number>(1000); // 1 second TTL for testing
	});

	it("expires entries after TTL", async () => {
		cache.set("expiring", [1, 2, 3], "vector", 50); // 50ms TTL
		expect(cache.get("expiring")).toBeDefined();

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cache.get("expiring")).toBeUndefined();
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
// Fallback Strategy Tests
// ============================================

describe("executeWithFallback success", () => {
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
});

describe("executeWithFallback timeouts", () => {
	let cache: QueryCache<number>;

	beforeEach(() => {
		cache = new QueryCache<number>(10000);
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

describe("MetricsCollector latency", () => {
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

	it("calculates latency percentiles", () => {
		for (let i = 1; i <= 100; i++) {
			metrics.record(i, false, false);
		}

		const result = metrics.getMetrics();
		expect(result.latencyP50).toBeCloseTo(50, 0);
		expect(result.latencyP95).toBeCloseTo(95, 0);
		expect(result.latencyP99).toBeCloseTo(99, 0);
	});
});

describe("MetricsCollector rates", () => {
	let metrics: MetricsCollector;

	beforeEach(() => {
		metrics = new MetricsCollector();
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
});

describe("MetricsCollector alerts and reset", () => {
	let metrics: MetricsCollector;

	beforeEach(() => {
		metrics = new MetricsCollector();
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
