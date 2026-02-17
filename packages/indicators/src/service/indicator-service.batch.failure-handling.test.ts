import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createLiquidityCalculatorEmptyOnNoBars,
	createMockBars,
	createMockQuote,
	createPriceCalculatorEmptyOnNoBars,
} from "./indicator-service.test-helpers";

describe("IndicatorService.getSnapshotsBatch graceful failure handling", () => {
	test("returns partial data when market data fails", async () => {
		const deps = createFullDependencies();
		deps.marketData = {
			async getBars(symbol) {
				if (symbol === "FAIL") {
					throw new Error("Market data unavailable for FAIL");
				}
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};
		deps.priceCalculator = createPriceCalculatorEmptyOnNoBars();

		const service = new IndicatorService(deps, { enableCache: false });
		const result = await service.getSnapshotsBatch(["AAPL", "FAIL", "GOOG"]);

		expect(result.snapshots.size).toBe(3);
		expect(result.metadata.successful).toBe(3);

		const failSnapshot = requireValue(result.snapshots.get("FAIL"), "FAIL snapshot");
		expect(failSnapshot.price.rsi_14).toBeNull();

		const aaplSnapshot = requireValue(result.snapshots.get("AAPL"), "AAPL snapshot");
		const googSnapshot = requireValue(result.snapshots.get("GOOG"), "GOOG snapshot");
		expect(aaplSnapshot.price.rsi_14).toBe(55.5);
		expect(googSnapshot.price.rsi_14).toBe(55.5);
	});

	test("returns empty indicators when all market data fails", async () => {
		const deps = createFullDependencies();
		deps.marketData = {
			async getBars() {
				throw new Error("Service unavailable");
			},
			async getQuote() {
				throw new Error("Service unavailable");
			},
		};
		deps.priceCalculator = createPriceCalculatorEmptyOnNoBars();
		deps.liquidityCalculator = createLiquidityCalculatorEmptyOnNoBars();

		const service = new IndicatorService(deps, { enableCache: false });
		const result = await service.getSnapshotsBatch(["AAPL", "MSFT"]);

		expect(result.snapshots.size).toBe(2);
		expect(result.metadata.successful).toBe(2);

		const aaplSnapshot = requireValue(result.snapshots.get("AAPL"), "AAPL snapshot");
		const msftSnapshot = requireValue(result.snapshots.get("MSFT"), "MSFT snapshot");
		expect(aaplSnapshot.price.rsi_14).toBeNull();
		expect(msftSnapshot.price.rsi_14).toBeNull();
		expect(aaplSnapshot.value.pe_ratio_ttm).toBe(25.5);
		expect(msftSnapshot.value.pe_ratio_ttm).toBe(25.5);
	});
});
