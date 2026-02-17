import { describe, expect, test } from "bun:test";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createLiquidityCalculatorEmptyOnNoData,
	createPriceCalculatorEmptyOnNoBars,
} from "./indicator-service.test-helpers";

describe("IndicatorService parallel fetching failures", () => {
	test("handles partial failures gracefully", async () => {
		const deps = createFullDependencies();
		deps.fundamentalRepo = {
			async getLatest() {
				throw new Error("Database connection failed");
			},
		};

		const service = new IndicatorService(deps);
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.price.rsi_14).toBe(55.5);
		expect(snapshot.liquidity.bid_ask_spread).toBe(0.05);
		expect(snapshot.value.pe_ratio_ttm).toBeNull();
		expect(snapshot.quality.roe).toBeNull();
	});

	test("handles market data failure gracefully", async () => {
		const deps = createFullDependencies();
		deps.marketData = {
			async getBars() {
				throw new Error("Market data unavailable");
			},
			async getQuote() {
				throw new Error("Quote unavailable");
			},
		};
		deps.priceCalculator = createPriceCalculatorEmptyOnNoBars();
		deps.liquidityCalculator = createLiquidityCalculatorEmptyOnNoData();

		const service = new IndicatorService(deps);
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.price.rsi_14).toBeNull();
		expect(snapshot.liquidity.bid_ask_spread).toBeNull();
		expect(snapshot.value.pe_ratio_ttm).toBe(25.5);
	});
});

describe("IndicatorService concurrent failure handling", () => {
	test("handles multiple concurrent failures", async () => {
		const deps = createFullDependencies();
		deps.fundamentalRepo = {
			async getLatest() {
				throw new Error("Fundamentals failed");
			},
		};
		deps.shortInterestRepo = {
			async getLatest() {
				throw new Error("Short interest failed");
			},
		};
		deps.sentimentRepo = {
			async getLatest() {
				throw new Error("Sentiment failed");
			},
		};

		const service = new IndicatorService(deps);
		const snapshot = await service.getSnapshot("AAPL");
		expect(snapshot.price.rsi_14).toBe(55.5);
		expect(snapshot.value.pe_ratio_ttm).toBeNull();
		expect(snapshot.short_interest.short_pct_float).toBeNull();
		expect(snapshot.sentiment.overall_score).toBeNull();
	});
});
