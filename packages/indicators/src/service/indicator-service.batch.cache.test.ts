import { describe, expect, test } from "bun:test";
import { IndicatorService } from "./indicator-service";
import {
	createFullDependencies,
	createMockBars,
	createMockQuote,
} from "./indicator-service.test-helpers";

describe("IndicatorService.getSnapshotsBatch cache behavior", () => {
	test("uses cache for previously fetched symbols", async () => {
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
		await service.getSnapshotsBatch(["AAPL", "MSFT"]);
		expect(fetchCount).toBe(2);

		const result = await service.getSnapshotsBatch(["AAPL", "GOOG"]);
		expect(fetchCount).toBe(3);
		expect(result.metadata.cached).toBe(1);
		expect(result.metadata.successful).toBe(2);
	});

	test("respects bypassCache at instance level", async () => {
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
		await service.getSnapshotsBatch(["AAPL", "MSFT"]);
		expect(fetchCount).toBe(2);

		const result = await service.getSnapshotsBatch(["AAPL", "MSFT"]);
		expect(fetchCount).toBe(4);
		expect(result.metadata.cached).toBe(0);
	});
});

describe("IndicatorService.getSnapshotsBatch concurrency and progress", () => {
	test("respects custom concurrency limit", async () => {
		const deps = createFullDependencies();
		let maxConcurrent = 0;
		let currentConcurrent = 0;
		deps.marketData = {
			async getBars() {
				currentConcurrent++;
				maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
				await new Promise((resolve) => setTimeout(resolve, 10));
				currentConcurrent--;
				return createMockBars(200);
			},
			async getQuote() {
				return createMockQuote();
			},
		};

		const service = new IndicatorService(deps, { enableCache: false });
		await service.getSnapshotsBatch(["A", "B", "C", "D", "E", "F"], { concurrency: 2 });
		expect(maxConcurrent).toBeLessThanOrEqual(2);
	});

	test("calls progress callback during batch processing", async () => {
		const service = new IndicatorService(createFullDependencies(), { enableCache: false });
		const progressCalls: Array<{ total: number; completed: number; cached: number }> = [];

		await service.getSnapshotsBatch(["AAPL", "MSFT", "GOOG"], {
			onProgress: (progress) => {
				progressCalls.push({
					total: progress.total,
					completed: progress.completed,
					cached: progress.cached,
				});
			},
		});

		expect(progressCalls.length).toBeGreaterThan(0);
		const firstCall = progressCalls[0];
		expect(firstCall).toBeDefined();
		expect(firstCall?.total).toBe(3);
		expect(firstCall?.completed).toBe(0);

		const lastCall = progressCalls.at(-1);
		expect(lastCall).toBeDefined();
		expect(lastCall?.completed).toBe(3);
	});
});
