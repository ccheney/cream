import { describe, expect, test } from "bun:test";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createMockBars,
	createMockQuote,
} from "./indicator-service.test-helpers";

describe("IndicatorService cache integration", () => {
	test("caches snapshot and returns cached value", async () => {
		const deps = createFullDependencies();
		let fetchCount = 0;
		deps.marketData = {
			async getBars() {
				fetchCount++;
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps);
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(1);
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(1);
	});

	test("bypasses cache when bypassCache is true", async () => {
		const deps = createFullDependencies();
		let fetchCount = 0;
		deps.marketData = {
			async getBars() {
				fetchCount++;
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps, { bypassCache: true });
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(1);
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(2);
	});

	test("disables cache when enableCache is false", async () => {
		const deps = createFullDependencies();
		let fetchCount = 0;
		deps.marketData = {
			async getBars() {
				fetchCount++;
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps, { enableCache: false });
		await service.getSnapshot("AAPL");
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(2);
	});
});

describe("IndicatorService cache invalidation", () => {
	test("invalidateCache clears cached snapshot", async () => {
		const deps = createFullDependencies();
		let fetchCount = 0;
		deps.marketData = {
			async getBars() {
				fetchCount++;
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps);
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(1);

		service.invalidateCache("AAPL");
		await service.getSnapshot("AAPL");
		expect(fetchCount).toBe(2);
	});
});
