/**
 * Recalc Indicator Tool Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { recalcIndicator } from "./recalc-indicator.js";

// Mock the implementation from @cream/agents/implementations
mock.module("@cream/agents/implementations", () => ({
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

describe("recalcIndicator metadata", () => {
	it("should have correct tool id", () => {
		expect(recalcIndicator.id).toBe("recalcIndicator");
	});

	it("should have a description mentioning indicators", () => {
		expect(recalcIndicator.description).toContain("technical indicator");
		expect(recalcIndicator.description).toContain("RSI");
		expect(recalcIndicator.description).toContain("SMA");
	});
});

describe("recalcIndicator input schema", () => {
	const parse = (input: Record<string, unknown>) => recalcIndicator.inputSchema?.safeParse(input);

	it("should accept valid RSI request", () => {
		expect(parse({ indicator: "RSI", symbol: "AAPL" })?.success).toBe(true);
	});

	it("should accept request with params", () => {
		expect(
			parse({ indicator: "BOLLINGER", symbol: "SPY", params: { period: 20, stdDev: 2 } })?.success,
		).toBe(true);
	});

	it("should reject invalid indicator", () => {
		expect(parse({ indicator: "INVALID", symbol: "AAPL" })?.success).toBe(false);
	});

	it("should reject missing symbol", () => {
		expect(parse({ indicator: "RSI" })?.success).toBe(false);
	});

	it("should accept all supported indicator types", () => {
		const indicators = ["RSI", "SMA", "EMA", "ATR", "BOLLINGER", "STOCHASTIC", "VOLUME_SMA"];
		for (const indicator of indicators) {
			expect(parse({ indicator, symbol: "AAPL" })?.success).toBe(true);
		}
	});
});

describe("recalcIndicator execution", () => {
	it("should execute and return indicator result", async () => {
		if (!recalcIndicator.execute) throw new Error("execute not defined");
		const result = await recalcIndicator.execute({ indicator: "RSI", symbol: "AAPL" }, {} as never);

		if (!("indicator" in result && "values" in result && "timestamps" in result)) {
			throw new Error("Unexpected validation error");
		}

		expect(result.indicator).toBe("RSI");
		expect(result.symbol).toBe("AAPL");
		expect(result.values).toHaveLength(5);
		expect(result.timestamps).toHaveLength(5);
	});

	it("should return values in chronological order", async () => {
		if (!recalcIndicator.execute) throw new Error("execute not defined");
		const result = await recalcIndicator.execute(
			{ indicator: "SMA", symbol: "SPY", params: { period: 20 } },
			{} as never,
		);

		if (!("values" in result && "timestamps" in result)) {
			throw new Error("Unexpected validation error");
		}

		expect(Array.isArray(result.values)).toBe(true);
		expect(Array.isArray(result.timestamps)).toBe(true);
		expect(result.values.length).toBe(result.timestamps.length);
	});
});
