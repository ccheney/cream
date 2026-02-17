import { describe, expect, test } from "bun:test";
import {
	createEmptyOptionsIndicators,
	createEmptyQualityIndicators,
	createEmptyValueIndicators,
} from "../types";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createMockBars,
	createMockQuote,
} from "./indicator-service.test-helpers";

describe("IndicatorService configuration", () => {
	test("respects includeBatchIndicators = false", async () => {
		const deps = createFullDependencies();
		let batchFetchCount = 0;
		deps.fundamentalRepo = {
			async getLatest() {
				batchFetchCount++;
				return { value: createEmptyValueIndicators(), quality: createEmptyQualityIndicators() };
			},
		};

		const service = new IndicatorService(deps, { includeBatchIndicators: false });
		await service.getSnapshot("AAPL");
		expect(batchFetchCount).toBe(0);
	});

	test("respects includeOptionsIndicators = false", async () => {
		const deps = createFullDependencies();
		let optionsFetchCount = 0;
		deps.optionsCalculator = {
			async calculate() {
				optionsFetchCount++;
				return createEmptyOptionsIndicators();
			},
		};

		const service = new IndicatorService(deps, { includeOptionsIndicators: false });
		await service.getSnapshot("AAPL");
		expect(optionsFetchCount).toBe(0);
	});

	test("respects custom barsLookback", async () => {
		const deps = createFullDependencies();
		let requestedLimit = 0;
		deps.marketData = {
			async getBars(_symbol, limit) {
				requestedLimit = limit;
				return createMockBars(limit);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps, { barsLookback: 100 });
		await service.getSnapshot("AAPL");
		expect(requestedLimit).toBe(100);
	});
});
