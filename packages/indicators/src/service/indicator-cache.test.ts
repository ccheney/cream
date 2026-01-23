/**
 * Tests for IndicatorCache
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	createEmptyCorporateIndicators,
	createEmptyLiquidityIndicators,
	createEmptyOptionsIndicators,
	createEmptyPriceIndicators,
	createEmptyQualityIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
	createEmptySnapshot,
	createEmptyValueIndicators,
} from "../types";
import {
	createIndicatorCache,
	DEFAULT_CACHE_CONFIG,
	DEFAULT_TTL_CONFIG,
	IndicatorCache,
} from "./indicator-cache";

// ============================================================
// Test Fixtures
// ============================================================

function createTestSnapshot(symbol: string) {
	const snapshot = createEmptySnapshot(symbol);
	snapshot.price.rsi_14 = 55.5;
	snapshot.price.atr_14 = 2.3;
	return snapshot;
}

function createTestPriceIndicators() {
	const price = createEmptyPriceIndicators();
	price.rsi_14 = 65.2;
	price.sma_20 = 150.5;
	price.ema_9 = 152.3;
	return price;
}

function createTestLiquidityIndicators() {
	const liquidity = createEmptyLiquidityIndicators();
	liquidity.bid_ask_spread = 0.02;
	liquidity.vwap = 151.25;
	return liquidity;
}

function createTestValueIndicators() {
	const value = createEmptyValueIndicators();
	value.pe_ratio_ttm = 25.5;
	value.pb_ratio = 8.2;
	return value;
}

function createTestQualityIndicators() {
	const quality = createEmptyQualityIndicators();
	quality.roe = 0.85;
	quality.roa = 0.21;
	return quality;
}

// ============================================================
// Factory Function Tests
// ============================================================

describe("createIndicatorCache", () => {
	test("creates cache with default config", () => {
		const cache = createIndicatorCache();
		expect(cache).toBeInstanceOf(IndicatorCache);
		expect(cache.size).toBe(0);
	});

	test("creates cache with custom config", () => {
		const cache = createIndicatorCache({
			maxEntries: 100,
			ttl: { ...DEFAULT_TTL_CONFIG, snapshot: 5000 },
		});
		expect(cache).toBeInstanceOf(IndicatorCache);
	});
});

// ============================================================
// Snapshot Cache Tests
// ============================================================

describe("IndicatorCache - Snapshots", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves snapshot", () => {
		const snapshot = createTestSnapshot("AAPL");
		cache.setSnapshot("AAPL", snapshot);

		const retrieved = cache.getSnapshot("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").symbol).toBe("AAPL");
		expect(requireValue(retrieved, "retrieved").price.rsi_14).toBe(55.5);
	});

	test("returns null for non-existent snapshot", () => {
		const result = cache.getSnapshot("TSLA");
		expect(result).toBeNull();
	});

	test("hasSnapshot returns true for cached entry", () => {
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		expect(cache.hasSnapshot("AAPL")).toBe(true);
	});

	test("hasSnapshot returns false for non-existent entry", () => {
		expect(cache.hasSnapshot("TSLA")).toBe(false);
	});

	test("key is case-insensitive", () => {
		cache.setSnapshot("aapl", createTestSnapshot("AAPL"));
		expect(cache.getSnapshot("AAPL")).not.toBeNull();
		expect(cache.getSnapshot("aapl")).not.toBeNull();
	});
});

// ============================================================
// Price Indicators Cache Tests
// ============================================================

describe("IndicatorCache - Price Indicators", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves price indicators", () => {
		const price = createTestPriceIndicators();
		cache.setPrice("AAPL", price);

		const retrieved = cache.getPrice("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").rsi_14).toBe(65.2);
		expect(requireValue(retrieved, "retrieved").sma_20).toBe(150.5);
	});

	test("returns null for non-existent entry", () => {
		expect(cache.getPrice("TSLA")).toBeNull();
	});

	test("hasPrice works correctly", () => {
		expect(cache.hasPrice("AAPL")).toBe(false);
		cache.setPrice("AAPL", createTestPriceIndicators());
		expect(cache.hasPrice("AAPL")).toBe(true);
	});
});

// ============================================================
// Liquidity Indicators Cache Tests
// ============================================================

describe("IndicatorCache - Liquidity Indicators", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves liquidity indicators", () => {
		const liquidity = createTestLiquidityIndicators();
		cache.setLiquidity("AAPL", liquidity);

		const retrieved = cache.getLiquidity("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").bid_ask_spread).toBe(0.02);
		expect(requireValue(retrieved, "retrieved").vwap).toBe(151.25);
	});

	test("hasLiquidity works correctly", () => {
		expect(cache.hasLiquidity("AAPL")).toBe(false);
		cache.setLiquidity("AAPL", createTestLiquidityIndicators());
		expect(cache.hasLiquidity("AAPL")).toBe(true);
	});
});

// ============================================================
// Options Indicators Cache Tests
// ============================================================

describe("IndicatorCache - Options Indicators", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves options indicators", () => {
		const options = createEmptyOptionsIndicators();
		options.atm_iv = 0.35;
		options.iv_skew_25d = 0.05;
		cache.setOptions("AAPL", options);

		const retrieved = cache.getOptions("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").atm_iv).toBe(0.35);
	});

	test("hasOptions works correctly", () => {
		expect(cache.hasOptions("AAPL")).toBe(false);
		cache.setOptions("AAPL", createEmptyOptionsIndicators());
		expect(cache.hasOptions("AAPL")).toBe(true);
	});
});

// ============================================================
// Fundamentals Cache Tests
// ============================================================

describe("IndicatorCache - Fundamentals", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves value indicators", () => {
		const value = createTestValueIndicators();
		cache.setValue("AAPL", value);

		const retrieved = cache.getValue("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").pe_ratio_ttm).toBe(25.5);
	});

	test("stores and retrieves quality indicators", () => {
		const quality = createTestQualityIndicators();
		cache.setQuality("AAPL", quality);

		const retrieved = cache.getQuality("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").roe).toBe(0.85);
	});

	test("setFundamentals stores both value and quality", () => {
		const value = createTestValueIndicators();
		const quality = createTestQualityIndicators();
		cache.setFundamentals("AAPL", { value, quality });

		expect(cache.getValue("AAPL")).not.toBeNull();
		expect(cache.getQuality("AAPL")).not.toBeNull();
	});

	test("getFundamentals retrieves both value and quality", () => {
		cache.setFundamentals("AAPL", {
			value: createTestValueIndicators(),
			quality: createTestQualityIndicators(),
		});

		const fundamentals = cache.getFundamentals("AAPL");
		expect(fundamentals).not.toBeNull();
		expect(requireValue(fundamentals, "fundamentals").value.pe_ratio_ttm).toBe(25.5);
		expect(requireValue(fundamentals, "fundamentals").quality.roe).toBe(0.85);
	});

	test("getFundamentals returns null if either missing", () => {
		cache.setValue("AAPL", createTestValueIndicators());
		// Quality not set
		expect(cache.getFundamentals("AAPL")).toBeNull();
	});
});

// ============================================================
// Sentiment Cache Tests
// ============================================================

describe("IndicatorCache - Sentiment", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves sentiment indicators", () => {
		const sentiment = createEmptySentimentIndicators();
		sentiment.overall_score = 0.65;
		sentiment.news_volume = 150;
		cache.setSentiment("AAPL", sentiment);

		const retrieved = cache.getSentiment("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").overall_score).toBe(0.65);
	});

	test("hasSentiment works correctly", () => {
		expect(cache.hasSentiment("AAPL")).toBe(false);
		cache.setSentiment("AAPL", createEmptySentimentIndicators());
		expect(cache.hasSentiment("AAPL")).toBe(true);
	});
});

// ============================================================
// Short Interest Cache Tests
// ============================================================

describe("IndicatorCache - Short Interest", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves short interest indicators", () => {
		const shortInterest = createEmptyShortInterestIndicators();
		shortInterest.short_pct_float = 0.25;
		shortInterest.days_to_cover = 3.5;
		cache.setShortInterest("GME", shortInterest);

		const retrieved = cache.getShortInterest("GME");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").short_pct_float).toBe(0.25);
	});

	test("hasShortInterest works correctly", () => {
		expect(cache.hasShortInterest("GME")).toBe(false);
		cache.setShortInterest("GME", createEmptyShortInterestIndicators());
		expect(cache.hasShortInterest("GME")).toBe(true);
	});
});

// ============================================================
// Corporate Actions Cache Tests
// ============================================================

describe("IndicatorCache - Corporate Actions", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("stores and retrieves corporate indicators", () => {
		const corporate = createEmptyCorporateIndicators();
		corporate.trailing_dividend_yield = 0.0052;
		corporate.recent_split = true;
		cache.setCorporate("AAPL", corporate);

		const retrieved = cache.getCorporate("AAPL");
		expect(retrieved).not.toBeNull();
		expect(requireValue(retrieved, "retrieved").trailing_dividend_yield).toBe(0.0052);
		expect(requireValue(retrieved, "retrieved").recent_split).toBe(true);
	});

	test("hasCorporate works correctly", () => {
		expect(cache.hasCorporate("AAPL")).toBe(false);
		cache.setCorporate("AAPL", createEmptyCorporateIndicators());
		expect(cache.hasCorporate("AAPL")).toBe(true);
	});
});

// ============================================================
// TTL Expiration Tests
// ============================================================

describe("IndicatorCache - TTL Expiration", () => {
	test("entry expires after TTL", async () => {
		const cache = new IndicatorCache({
			ttl: { ...DEFAULT_TTL_CONFIG, snapshot: 50 }, // 50ms TTL
		});

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		expect(cache.getSnapshot("AAPL")).not.toBeNull();

		// Wait for expiration
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

// ============================================================
// LRU Eviction Tests
// ============================================================

describe("IndicatorCache - LRU Eviction", () => {
	test("evicts LRU entry when at capacity", async () => {
		const cache = new IndicatorCache({ maxEntries: 3 });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		await new Promise((resolve) => setTimeout(resolve, 5));
		cache.setSnapshot("TSLA", createTestSnapshot("TSLA"));
		await new Promise((resolve) => setTimeout(resolve, 5));
		cache.setSnapshot("GOOG", createTestSnapshot("GOOG"));
		await new Promise((resolve) => setTimeout(resolve, 5));

		// Access AAPL and GOOG to make them recent, TSLA remains LRU
		cache.getSnapshot("AAPL");
		cache.getSnapshot("GOOG");

		// Add new entry - should evict TSLA (LRU)
		cache.setSnapshot("MSFT", createTestSnapshot("MSFT"));

		expect(cache.getSnapshot("TSLA")).toBeNull(); // Evicted
		expect(cache.getSnapshot("AAPL")).not.toBeNull();
		expect(cache.getSnapshot("GOOG")).not.toBeNull();
		expect(cache.getSnapshot("MSFT")).not.toBeNull();
	});
});

// ============================================================
// Cache Invalidation Tests
// ============================================================

describe("IndicatorCache - Invalidation", () => {
	let cache: IndicatorCache;

	beforeEach(() => {
		cache = new IndicatorCache();
	});

	test("invalidate removes all data for symbol", () => {
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

	test("invalidateRealtime removes only real-time data", () => {
		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());
		cache.setLiquidity("AAPL", createTestLiquidityIndicators());
		cache.setOptions("AAPL", createEmptyOptionsIndicators());
		cache.setValue("AAPL", createTestValueIndicators());
		cache.setQuality("AAPL", createTestQualityIndicators());
		cache.setSentiment("AAPL", createEmptySentimentIndicators());

		cache.invalidateRealtime("AAPL");

		// Real-time data should be removed
		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getPrice("AAPL")).toBeNull();
		expect(cache.getLiquidity("AAPL")).toBeNull();
		expect(cache.getOptions("AAPL")).toBeNull();

		// Batch data should remain
		expect(cache.getValue("AAPL")).not.toBeNull();
		expect(cache.getQuality("AAPL")).not.toBeNull();
		expect(cache.getSentiment("AAPL")).not.toBeNull();
	});

	test("clear removes all data", () => {
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

// ============================================================
// Cache Metrics Tests
// ============================================================

describe("IndicatorCache - Metrics", () => {
	test("tracks hits and misses", () => {
		const cache = new IndicatorCache({ enableMetrics: true });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));

		// 2 hits
		cache.getSnapshot("AAPL");
		cache.getSnapshot("AAPL");

		// 3 misses
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
		cache.setSnapshot("GOOG", createTestSnapshot("GOOG")); // Triggers eviction

		const metrics = cache.getMetrics();
		expect(metrics.snapshot.evictions).toBe(1);
	});

	test("aggregates total metrics", () => {
		const cache = new IndicatorCache({ enableMetrics: true });

		cache.setSnapshot("AAPL", createTestSnapshot("AAPL"));
		cache.setPrice("AAPL", createTestPriceIndicators());

		cache.getSnapshot("AAPL"); // hit
		cache.getPrice("AAPL"); // hit
		cache.getSnapshot("TSLA"); // miss
		cache.getPrice("TSLA"); // miss

		const metrics = cache.getMetrics();

		expect(metrics.total.hits).toBe(2);
		expect(metrics.total.misses).toBe(2);
		expect(metrics.total.hitRate).toBeCloseTo(0.5, 2);
	});
});

// ============================================================
// Prune Tests
// ============================================================

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

		expect(pruned).toBe(3); // All three expired
		expect(cache.getSnapshot("AAPL")).toBeNull();
		expect(cache.getPrice("AAPL")).toBeNull();
		expect(cache.getLiquidity("AAPL")).toBeNull();
	});
});

// ============================================================
// Size Property Tests
// ============================================================

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

// ============================================================
// Default Configuration Tests
// ============================================================

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
