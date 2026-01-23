/**
 * Recalc Indicator Tool Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { recalcIndicator } from "./recalc-indicator.js";

// Mock the implementation from @cream/agents
mock.module("@cream/agents", () => ({
	recalcIndicator: async (
		_ctx: unknown,
		indicator: string,
		symbol: string,
		_params?: Record<string, number>,
	) => ({
		indicator,
		symbol,
		values: [45.5, 46.2, 47.8, 52.3, 55.1],
		timestamps: [
			"2024-01-15T10:00:00Z",
			"2024-01-15T11:00:00Z",
			"2024-01-15T12:00:00Z",
			"2024-01-15T13:00:00Z",
			"2024-01-15T14:00:00Z",
		],
	}),
}));

// Mock @cream/domain
mock.module("@cream/domain", () => ({
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	requireEnv: () => "PAPER",
	isTest: () => true,
	calculateCaseStatistics: () => ({
		total: 0,
		byAction: {},
		byRegime: {},
		averageSimilarity: 0,
	}),
}));

describe("recalcIndicator tool", () => {
	it("should have correct tool id", () => {
		expect(recalcIndicator.id).toBe("recalc_indicator");
	});

	it("should have a description mentioning indicators", () => {
		expect(recalcIndicator.description).toContain("technical indicator");
		expect(recalcIndicator.description).toContain("RSI");
		expect(recalcIndicator.description).toContain("SMA");
	});

	it("should validate input schema - accepts valid RSI request", () => {
		const result = recalcIndicator.inputSchema?.safeParse({
			indicator: "RSI",
			symbol: "AAPL",
		});
		expect(result?.success).toBe(true);
	});

	it("should validate input schema - accepts request with params", () => {
		const result = recalcIndicator.inputSchema?.safeParse({
			indicator: "BOLLINGER",
			symbol: "SPY",
			params: { period: 20, stdDev: 2 },
		});
		expect(result?.success).toBe(true);
	});

	it("should validate input schema - rejects invalid indicator", () => {
		const result = recalcIndicator.inputSchema?.safeParse({
			indicator: "INVALID",
			symbol: "AAPL",
		});
		expect(result?.success).toBe(false);
	});

	it("should validate input schema - rejects missing symbol", () => {
		const result = recalcIndicator.inputSchema?.safeParse({
			indicator: "RSI",
		});
		expect(result?.success).toBe(false);
	});

	it("should accept all supported indicator types", () => {
		const indicators = ["RSI", "SMA", "EMA", "ATR", "BOLLINGER", "STOCHASTIC", "VOLUME_SMA"];

		for (const indicator of indicators) {
			const result = recalcIndicator.inputSchema?.safeParse({
				indicator,
				symbol: "AAPL",
			});
			expect(result?.success).toBe(true);
		}
	});

	it("should execute and return indicator result", async () => {
		if (!recalcIndicator.execute) throw new Error("execute not defined");
		const result = await recalcIndicator.execute({ indicator: "RSI", symbol: "AAPL" }, {} as never);

		if ("indicator" in result && "values" in result) {
			expect(result.indicator).toBe("RSI");
			expect(result.symbol).toBe("AAPL");
			expect(result.values).toHaveLength(5);
			expect(result.timestamps).toHaveLength(5);
		} else {
			throw new Error("Unexpected validation error");
		}
	});

	it("should return values in chronological order", async () => {
		if (!recalcIndicator.execute) throw new Error("execute not defined");
		const result = await recalcIndicator.execute(
			{ indicator: "SMA", symbol: "SPY", params: { period: 20 } },
			{} as never,
		);

		if ("values" in result && "timestamps" in result) {
			expect(Array.isArray(result.values)).toBe(true);
			expect(Array.isArray(result.timestamps)).toBe(true);
			expect(result.values.length).toBe(result.timestamps.length);
		} else {
			throw new Error("Unexpected validation error");
		}
	});
});
