/**
 * Tests for IndicatorService.getSnapshot
 */

import { describe, expect, test } from "bun:test";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createMockBars,
	createMockMarketDataProvider,
	createMockQuote,
} from "./indicator-service.test-helpers";

describe("IndicatorService.getSnapshot - core behavior", () => {
	test("returns complete snapshot with all dependencies", async () => {
		const service = new IndicatorService(createFullDependencies());
		const snapshot = await service.getSnapshot("AAPL");

		expect(snapshot.symbol).toBe("AAPL");
		expect(snapshot.timestamp).toBeGreaterThan(0);
		expect(snapshot.price.rsi_14).toBe(55.5);
		expect(snapshot.price.atr_14).toBe(2.3);
		expect(snapshot.liquidity.bid_ask_spread).toBe(0.05);
		expect(snapshot.options.atm_iv).toBe(0.35);
		expect(snapshot.value.pe_ratio_ttm).toBe(25.5);
		expect(snapshot.quality.roe).toBe(0.85);
		expect(snapshot.short_interest.short_pct_float).toBe(0.05);
		expect(snapshot.sentiment.overall_score).toBe(0.65);
		expect(snapshot.corporate.trailing_dividend_yield).toBe(0.005);
	});

	test("normalizes symbol to uppercase", async () => {
		const service = new IndicatorService(createFullDependencies());
		const snapshot = await service.getSnapshot("aapl");
		expect(snapshot.symbol).toBe("AAPL");
	});

	test("returns empty indicators when calculators not provided", async () => {
		const service = new IndicatorService({
			marketData: createMockMarketDataProvider(createMockBars(200), createMockQuote()),
		});
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.price.rsi_14).toBeNull();
		expect(snapshot.liquidity.bid_ask_spread).toBeNull();
		expect(snapshot.options.atm_iv).toBeNull();
	});
});

describe("IndicatorService.getSnapshot - metadata quality", () => {
	test("includes metadata with data quality assessment", async () => {
		const service = new IndicatorService(createFullDependencies());
		const snapshot = await service.getSnapshot("AAPL");

		expect(snapshot.metadata.price_updated_at).toBeGreaterThan(0);
		expect(snapshot.metadata.data_quality).toBe("COMPLETE");
		expect(Array.isArray(snapshot.metadata.missing_fields)).toBe(true);
	});

	test("marks data quality as PARTIAL when missing some data", async () => {
		const deps = createFullDependencies();
		deps.fundamentalRepo = undefined;
		deps.shortInterestRepo = undefined;
		deps.sentimentRepo = undefined;

		const service = new IndicatorService(deps);
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.metadata.data_quality).toBe("PARTIAL");
	});

	test("marks data quality as STALE when missing most data", async () => {
		const service = new IndicatorService({
			marketData: createMockMarketDataProvider([], null),
		});
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.metadata.data_quality).toBe("STALE");
	});
});
