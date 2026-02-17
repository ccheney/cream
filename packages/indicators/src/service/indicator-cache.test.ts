/**
 * Tests for IndicatorCache
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	createEmptyCorporateIndicators,
	createEmptyOptionsIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
} from "../types";
import { createIndicatorCache, DEFAULT_TTL_CONFIG, IndicatorCache } from "./indicator-cache";
import {
	createTestLiquidityIndicators,
	createTestPriceIndicators,
	createTestQualityIndicators,
	createTestSnapshot,
	createTestValueIndicators,
} from "./indicator-cache.test-helpers";

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
		expect(cache.getFundamentals("AAPL")).toBeNull();
	});
});

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
