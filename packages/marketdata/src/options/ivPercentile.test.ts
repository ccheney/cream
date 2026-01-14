/**
 * IV Percentile Calculation Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	calculateIVPercentile,
	calculateIVRank,
	createVixProxyProvider,
	InMemoryIVHistoryStore,
	type IVObservation,
	IVPercentileCalculator,
} from "./ivPercentile";

describe("calculateIVPercentile", () => {
	it("should return undefined with insufficient observations", () => {
		const result = calculateIVPercentile(0.25, [0.2, 0.3], 20);
		expect(result).toBeUndefined();
	});

	it("should calculate percentile at the bottom (0%)", () => {
		const historical = Array.from({ length: 100 }, (_, i) => 0.2 + i * 0.001);
		const result = calculateIVPercentile(0.19, historical); // Below all values
		expect(result).toBe(0);
	});

	it("should calculate percentile at the top (near 100%)", () => {
		const historical = Array.from({ length: 100 }, (_, i) => 0.2 + i * 0.001);
		const result = calculateIVPercentile(0.35, historical); // Above all values
		expect(result).toBe(100);
	});

	it("should calculate percentile at the middle", () => {
		// 100 values from 0.20 to 0.29
		const historical = Array.from({ length: 100 }, (_, i) => 0.2 + i * 0.001);
		// 0.245 is at the 50th position (0.20, 0.201, ..., 0.245 = 46 values below)
		// Actually: 0.245 - 0.2 = 0.045, 0.045 / 0.001 = 45 values below
		const result = calculateIVPercentile(0.245, historical);
		expect(result).toBe(45);
	});

	it("should handle equal values in history", () => {
		const historical = Array.from({ length: 100 }, () => 0.25); // All same
		const result = calculateIVPercentile(0.25, historical);
		expect(result).toBe(0); // None are strictly below
	});

	it("should work with custom minObservations", () => {
		const historical = [0.2, 0.25, 0.3];
		const result = calculateIVPercentile(0.26, historical, 3);
		expect(result).toBeDefined();
		expect(result).toBe((2 / 3) * 100); // 2 values below 0.26
	});
});

describe("calculateIVRank", () => {
	it("should return undefined with insufficient observations", () => {
		const result = calculateIVRank(0.25, [0.2]);
		expect(result).toBeUndefined();
	});

	it("should calculate rank at the bottom (0%)", () => {
		const historical = [0.2, 0.25, 0.3];
		const result = calculateIVRank(0.2, historical);
		expect(result).toBe(0);
	});

	it("should calculate rank at the top (100%)", () => {
		const historical = [0.2, 0.25, 0.3];
		const result = calculateIVRank(0.3, historical);
		expect(result).toBe(100);
	});

	it("should calculate rank at the middle (50%)", () => {
		const historical = [0.2, 0.3]; // High = 0.3, Low = 0.2
		const result = calculateIVRank(0.25, historical);
		expect(result).toBe(50); // (0.25 - 0.2) / (0.3 - 0.2) = 0.5
	});

	it("should handle all equal values", () => {
		const historical = [0.25, 0.25, 0.25];
		const result = calculateIVRank(0.25, historical);
		expect(result).toBe(50); // Default to middle
	});

	it("should clamp values outside range", () => {
		const historical = [0.2, 0.3];
		expect(calculateIVRank(0.1, historical)).toBe(0);
		expect(calculateIVRank(0.4, historical)).toBe(100);
	});
});

describe("InMemoryIVHistoryStore", () => {
	let store: InMemoryIVHistoryStore;

	beforeEach(() => {
		store = new InMemoryIVHistoryStore();
	});

	it("should store and retrieve observations", async () => {
		const today = new Date();
		const date1 = new Date(today);
		date1.setDate(today.getDate() - 10);
		const date2 = new Date(today);
		date2.setDate(today.getDate() - 9);

		store.addObservation("AAPL", { date: date1.toISOString().split("T")[0]!, iv: 0.25 });
		store.addObservation("AAPL", { date: date2.toISOString().split("T")[0]!, iv: 0.26 });

		const provider = store.getProvider();
		const history = await provider("AAPL", 365);

		expect(history).toHaveLength(2);
		expect(history[0]?.iv).toBe(0.25);
		expect(history[1]?.iv).toBe(0.26);
	});

	it("should sort observations by date", async () => {
		const today = new Date();
		const date1 = new Date(today);
		date1.setDate(today.getDate() - 10);
		const date2 = new Date(today);
		date2.setDate(today.getDate() - 9);
		const date3 = new Date(today);
		date3.setDate(today.getDate() - 8);

		store.addObservation("AAPL", { date: date3.toISOString().split("T")[0]!, iv: 0.27 });
		store.addObservation("AAPL", { date: date1.toISOString().split("T")[0]!, iv: 0.25 });
		store.addObservation("AAPL", { date: date2.toISOString().split("T")[0]!, iv: 0.26 });

		const provider = store.getProvider();
		const history = await provider("AAPL", 365);

		expect(history[0]?.date).toBe(date1.toISOString().split("T")[0]);
		expect(history[1]?.date).toBe(date2.toISOString().split("T")[0]);
		expect(history[2]?.date).toBe(date3.toISOString().split("T")[0]);
	});

	it("should filter by lookback period", async () => {
		const today = new Date();
		const recentDate = new Date(today);
		recentDate.setDate(today.getDate() - 10);
		const oldDate = new Date(today);
		oldDate.setDate(today.getDate() - 400);

		store.addObservation("AAPL", { date: recentDate.toISOString().split("T")[0]!, iv: 0.25 });
		store.addObservation("AAPL", { date: oldDate.toISOString().split("T")[0]!, iv: 0.2 });

		const provider = store.getProvider();

		// 30 day lookback should only include recent
		const shortHistory = await provider("AAPL", 30);
		expect(shortHistory).toHaveLength(1);
		expect(shortHistory[0]?.iv).toBe(0.25);

		// 500 day lookback should include both
		const longHistory = await provider("AAPL", 500);
		expect(longHistory).toHaveLength(2);
	});

	it("should set complete history", async () => {
		const today = new Date();
		const date1 = new Date(today);
		date1.setDate(today.getDate() - 10);
		const date2 = new Date(today);
		date2.setDate(today.getDate() - 9);
		const date3 = new Date(today);
		date3.setDate(today.getDate() - 8);

		const history: IVObservation[] = [
			{ date: date1.toISOString().split("T")[0]!, iv: 0.25 },
			{ date: date2.toISOString().split("T")[0]!, iv: 0.26 },
			{ date: date3.toISOString().split("T")[0]!, iv: 0.27 },
		];

		store.setHistory("AAPL", history);

		const provider = store.getProvider();
		const retrieved = await provider("AAPL", 365);

		expect(retrieved).toHaveLength(3);
	});
});

describe("IVPercentileCalculator", () => {
	let store: InMemoryIVHistoryStore;
	let calculator: IVPercentileCalculator;

	beforeEach(() => {
		store = new InMemoryIVHistoryStore();

		// Create 100 historical observations
		const today = new Date();
		for (let i = 0; i < 100; i++) {
			const date = new Date(today);
			date.setDate(today.getDate() - (100 - i));
			store.addObservation("AAPL", {
				date: date.toISOString().split("T")[0]!,
				iv: 0.2 + i * 0.001, // 0.20 to 0.299
			});
		}

		calculator = new IVPercentileCalculator(store.getProvider(), {
			minObservations: 20,
			cacheTtlMs: 5000,
		});
	});

	it("should calculate percentile with statistics", async () => {
		const result = await calculator.calculate("AAPL", 0.25);

		expect(result).toBeDefined();
		expect(result?.currentIV).toBe(0.25);
		expect(result?.percentile).toBeGreaterThan(0);
		expect(result?.percentile).toBeLessThan(100);
		expect(result?.observationCount).toBe(100);
		expect(result?.high52Week).toBeCloseTo(0.299, 3);
		expect(result?.low52Week).toBeCloseTo(0.2, 3);
	});

	it("should return undefined with insufficient data", async () => {
		const emptyStore = new InMemoryIVHistoryStore();
		emptyStore.addObservation("MSFT", { date: "2025-01-01", iv: 0.25 });

		const calc = new IVPercentileCalculator(emptyStore.getProvider(), {
			minObservations: 20,
		});

		const result = await calc.calculate("MSFT", 0.25);
		expect(result).toBeUndefined();
	});

	it("should cache results", async () => {
		// First call
		const result1 = await calculator.calculate("AAPL", 0.25);
		expect(result1).toBeDefined();

		// Second call should use cache (even with different IV)
		const result2 = await calculator.calculate("AAPL", 0.26);
		expect(result2).toBeDefined();
		expect(result2?.currentIV).toBe(0.26);
	});

	it("should clear cache", async () => {
		await calculator.calculate("AAPL", 0.25);
		calculator.clearCache("AAPL");

		// After clearing, should fetch again
		const result = await calculator.calculate("AAPL", 0.25);
		expect(result).toBeDefined();
	});
});

describe("createVixProxyProvider", () => {
	it("should convert VIX percentage to decimal for SPY", async () => {
		const mockVixFetcher = async (): Promise<IVObservation[]> => [
			{ date: "2025-01-01", iv: 15 }, // VIX quoted as 15
			{ date: "2025-01-02", iv: 20 }, // VIX quoted as 20
		];

		const provider = createVixProxyProvider(mockVixFetcher);
		const history = await provider("SPY", 30);

		expect(history).toHaveLength(2);
		expect(history[0]?.iv).toBe(0.15); // Converted to 0.15
		expect(history[1]?.iv).toBe(0.2); // Converted to 0.20
	});

	it("should return empty for non-SPY/SPX symbols", async () => {
		const mockVixFetcher = async (): Promise<IVObservation[]> => [{ date: "2025-01-01", iv: 15 }];

		const provider = createVixProxyProvider(mockVixFetcher);
		const history = await provider("AAPL", 30);

		expect(history).toHaveLength(0);
	});

	it("should work for SPX symbol", async () => {
		const mockVixFetcher = async (): Promise<IVObservation[]> => [{ date: "2025-01-01", iv: 18 }];

		const provider = createVixProxyProvider(mockVixFetcher);
		const history = await provider("SPX", 30);

		expect(history).toHaveLength(1);
		expect(history[0]?.iv).toBe(0.18);
	});
});
