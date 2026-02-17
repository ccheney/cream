import { describe, expect, test } from "bun:test";
import {
	createEmptyCorporateIndicators,
	createEmptyOptionsIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
} from "../types";
import { DEFAULT_CACHE_CONFIG, DEFAULT_TTL_CONFIG, IndicatorCache } from "./indicator-cache";
import {
	createTestLiquidityIndicators,
	createTestPriceIndicators,
	createTestQualityIndicators,
	createTestSnapshot,
	createTestValueIndicators,
} from "./indicator-cache.test-helpers";

describe("IndicatorCache - TTL Expiration", () => {
	test("entry expires after TTL", async () => {
		const cache = new IndicatorCache({
			ttl: { ...DEFAULT_TTL_CONFIG, snapshot: 50 },
		});

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		expect(cache.getSnapshot("AAPL")).not.toBeNull();

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cache.getSnapshot("AAPL")).toBeNull();
	});

	test("hasSnapshot returns false after expiration", async () => {
		const cache = new IndicatorCache({
			ttl: { ...DEFAULT_TTL_CONFIG, snapshot: 50 },
		});

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		expect(cache.hasSnapshot("AAPL")).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cache.hasSnapshot("AAPL")).toBe(false);
	});
});

describe("IndicatorCache - LRU Eviction", () => {
	test("evicts LRU entry when at capacity", async () => {
		const cache = new IndicatorCache({ maxEntries: 3 });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		await new Promise((resolve) => setTimeout(resolve, 5));
		cache.setSnapshot("TSLA", createTestSnapshot("TSLA"));
		await new Promise((resolve) => setTimeout(resolve, 5));
		cache.setSnapshot("GOOG", createTestSnapshot("GOOG"));
		await new Promise((resolve) => setTimeout(resolve, 5));

		cache.getSnapshot("AAPL");
		cache.getSnapshot("GOOG");

		cache.setSnapshot("MSFT", createTestSnapshot("MSFT"));
		expect(cache.getSnapshot("TSLA")).toBeNull();
		expect(cache.getSnapshot("AAPL")).not.toBeNull();
		expect(cache.getSnapshot("GOOG")).not.toBeNull();
		expect(cache.getSnapshot("MSFT")).not.toBeNull();
	});
});

describe("IndicatorCache invalidate", () => {
	test("removes all data for symbol", () => {
		const cache = new IndicatorCache();
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());
		cache.setLiquidity("AAPL", createTestLiquidityIndicators());
		cache.setValue("AAPL", createTestValueIndicators());
		cache.setQuality("AAPL", createTestQualityIndicators());
		cache.setSentiment("AAPL", createEmptySentimentIndicators());
		cache.setShortInterest("AAPL", createEmptyShortInterestIndicators());
		cache.setCorporate("AAPL", createEmptyCorporateIndicators());
		cache.setOptions("AAPL", createEmptyOptionsIndicators());

		expect(cache.size).toBeGreaterThan(0);
		cache.invalidate("AAPL");

		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getPrice("AAPL")).toBeNull();
		expect(cache.getLiquidity("AAPL")).toBeNull();
		expect(cache.getValue("AAPL")).toBeNull();
		expect(cache.getQuality("AAPL")).toBeNull();
		expect(cache.getSentiment("AAPL")).toBeNull();
		expect(cache.getShortInterest("AAPL")).toBeNull();
		expect(cache.getCorporate("AAPL")).toBeNull();
		expect(cache.getOptions("AAPL")).toBeNull();
	});
});

describe("IndicatorCache invalidateRealtime", () => {
	test("removes only real-time data", () => {
		const cache = new IndicatorCache();
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());
		cache.setLiquidity("AAPL", createTestLiquidityIndicators());
		cache.setOptions("AAPL", createEmptyOptionsIndicators());
		cache.setValue("AAPL", createTestValueIndicators());
		cache.setQuality("AAPL", createTestQualityIndicators());
		cache.setSentiment("AAPL", createEmptySentimentIndicators());

		cache.invalidateRealtime("AAPL");

		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getPrice("AAPL")).toBeNull();
		expect(cache.getLiquidity("AAPL")).toBeNull();
		expect(cache.getOptions("AAPL")).toBeNull();
		expect(cache.getValue("AAPL")).not.toBeNull();
		expect(cache.getQuality("AAPL")).not.toBeNull();
		expect(cache.getSentiment("AAPL")).not.toBeNull();
	});
});

describe("IndicatorCache clear", () => {
	test("removes all data", () => {
		const cache = new IndicatorCache();
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setSnapshot("TSLA", createTestSnapshot("TSLA"));
		cache.setPrice("GOOG", createTestPriceIndicators());

		expect(cache.size).toBeGreaterThan(0);
		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getSnapshot("TSLA")).toBeNull();
		expect(cache.getPrice("GOOG")).toBeNull();
	});
});

describe("IndicatorCache - Prune", () => {
	test("prune removes expired entries", async () => {
		const cache = new IndicatorCache({
			ttl: { ...DEFAULT_TTL_CONFIG, snapshot: 50, price: 50, liquidity: 50 },
		});

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());
		cache.setLiquidity("AAPL", createTestLiquidityIndicators());
		expect(cache.size).toBe(3);

		await new Promise((resolve) => setTimeout(resolve, 60));

		const pruned = cache.prune();
		expect(pruned).toBe(3);
		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getPrice("AAPL")).toBeNull();
		expect(cache.getLiquidity("AAPL")).toBeNull();
	});
});

describe("IndicatorCache - Size", () => {
	test("size reflects total entries across all caches", () => {
		const cache = new IndicatorCache();

		expect(cache.size).toBe(0);
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		expect(cache.size).toBe(1);

		cache.setPrice("AAPL", createTestPriceIndicators());
		expect(cache.size).toBe(2);

		cache.setLiquidity("TSLA", createTestLiquidityIndicators());
		expect(cache.size).toBe(3);

		cache.invalidate("AAPL");
		expect(cache.size).toBe(1);
	});
});

describe("IndicatorCache - Metrics", () => {
	test("tracks hits and misses", () => {
		const cache = new IndicatorCache({ enableMetrics: true });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.getSnapshot("AAPL");
		cache.getSnapshot("AAPL");
		cache.getSnapshot("TSLA");
		cache.getSnapshot("GOOG");
		cache.getSnapshot("MSFT");

		const metrics = cache.getMetrics();
		expect(metrics.snapshot.hits).toBe(2);
		expect(metrics.snapshot.misses).toBe(3);
		expect(metrics.snapshot.hitRate).toBeCloseTo(0.4, 2);
	});

	test("tracks evictions", () => {
		const cache = new IndicatorCache({ maxEntries: 2, enableMetrics: true });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setSnapshot("TSLA", createTestSnapshot("TSLA"));
		cache.setSnapshot("GOOG", createTestSnapshot("GOOG"));

		const metrics = cache.getMetrics();
		expect(metrics.snapshot.evictions).toBe(1);
	});

	test("aggregates total metrics", () => {
		const cache = new IndicatorCache({ enableMetrics: true });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());
		cache.getSnapshot("AAPL");
		cache.getPrice("AAPL");
		cache.getSnapshot("TSLA");
		cache.getPrice("TSLA");

		const metrics = cache.getMetrics();
		expect(metrics.total.hits).toBe(2);
		expect(metrics.total.misses).toBe(2);
		expect(metrics.total.hitRate).toBeCloseTo(0.5, 2);
	});
});

describe("Default Configuration", () => {
	test("DEFAULT_TTL_CONFIG has expected values", () => {
		expect(DEFAULT_TTL_CONFIG.snapshot).toBe(60 * 1000);
		expect(DEFAULT_TTL_CONFIG.price).toBe(30 * 1000);
		expect(DEFAULT_TTL_CONFIG.liquidity).toBe(30 * 1000);
		expect(DEFAULT_TTL_CONFIG.options).toBe(60 * 1000);
		expect(DEFAULT_TTL_CONFIG.fundamentals).toBe(5 * 60 * 1000);
		expect(DEFAULT_TTL_CONFIG.sentiment).toBe(5 * 60 * 1000);
		expect(DEFAULT_TTL_CONFIG.shortInterest).toBe(5 * 60 * 1000);
		expect(DEFAULT_TTL_CONFIG.corporate).toBe(5 * 60 * 1000);
	});

	test("DEFAULT_CACHE_CONFIG has expected values", () => {
		expect(DEFAULT_CACHE_CONFIG.maxEntries).toBe(500);
		expect(DEFAULT_CACHE_CONFIG.enableMetrics).toBe(true);
	});
});
