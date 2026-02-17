import { describe, expect, test } from "bun:test";
import { IndicatorService } from "./indicator-service";
import { createFullDependencies } from "./indicator-service.test-helpers";

describe("IndicatorService.getSnapshotsBatch core behavior", () => {
	test("returns snapshots for multiple symbols", async () => {
		const service = new IndicatorService(createFullDependencies());
		const result = await service.getSnapshotsBatch(["AAPL", "MSFT", "GOOG"]);

		expect(result.snapshots.size).toBe(3);
		expect(result.snapshots.get("AAPL")).toBeDefined();
		expect(result.snapshots.get("MSFT")).toBeDefined();
		expect(result.snapshots.get("GOOG")).toBeDefined();
		expect(result.metadata.total).toBe(3);
		expect(result.metadata.successful).toBe(3);
		expect(result.metadata.failed).toBe(0);
	});

	test("normalizes symbols to uppercase and deduplicates", async () => {
		const deps = createFullDependencies();
		const service = new IndicatorService(deps, { enableCache: false });
		const result = await service.getSnapshotsBatch(["aapl", "AAPL", "Aapl"]);

		expect(result.snapshots.size).toBe(1);
		expect(result.snapshots.get("AAPL")).toBeDefined();
		expect(result.metadata.total).toBe(1);
	});

	test("returns empty result for empty symbols array", async () => {
		const service = new IndicatorService(createFullDependencies());
		const result = await service.getSnapshotsBatch([]);
		expect(result.snapshots.size).toBe(0);
		expect(result.errors.size).toBe(0);
		expect(result.metadata.total).toBe(0);
		expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
	});
});

describe("IndicatorService.getSnapshotsBatch metadata", () => {
	test("includes execution time in metadata", async () => {
		const service = new IndicatorService(createFullDependencies());
		const result = await service.getSnapshotsBatch(["AAPL", "MSFT"]);
		expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
		expect(typeof result.metadata.executionTimeMs).toBe("number");
	});
});

describe("IndicatorService.getSnapshots delegation", () => {
	test("getSnapshots delegates to getSnapshotsBatch", async () => {
		const service = new IndicatorService(createFullDependencies());
		const result = await service.getSnapshots(["AAPL", "MSFT"]);

		expect(result instanceof Map).toBe(true);
		expect(result.size).toBe(2);
		expect(result.get("AAPL")).toBeDefined();
		expect(result.get("MSFT")).toBeDefined();
	});
});
