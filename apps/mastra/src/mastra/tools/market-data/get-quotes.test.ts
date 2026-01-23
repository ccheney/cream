/**
 * Get Quotes Tool Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { getQuotes } from "./get-quotes.js";

// Mock the implementation from @cream/agents
mock.module("@cream/agents", () => ({
	getQuotes: async (_ctx: unknown, instruments: string[]) => {
		return instruments.map((symbol) => ({
			symbol,
			bid: 150.0,
			ask: 150.05,
			last: 150.02,
			volume: 1000000,
			timestamp: new Date().toISOString(),
		}));
	},
}));

// Mock @cream/domain
mock.module("@cream/domain", () => ({
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	requireEnv: () => "PAPER",
}));

describe("getQuotes tool", () => {
	it("should have correct tool id", () => {
		expect(getQuotes.id).toBe("get_quotes");
	});

	it("should have a description", () => {
		expect(getQuotes.description).toContain("Get real-time quotes");
	});

	it("should validate input schema - accepts valid instruments", () => {
		const result = getQuotes.inputSchema?.safeParse({
			instruments: ["AAPL", "MSFT"],
		});
		expect(result?.success).toBe(true);
	});

	it("should validate input schema - rejects empty instruments", () => {
		const result = getQuotes.inputSchema?.safeParse({
			instruments: [],
		});
		expect(result?.success).toBe(false);
	});

	it("should validate input schema - rejects missing instruments", () => {
		const result = getQuotes.inputSchema?.safeParse({});
		expect(result?.success).toBe(false);
	});

	it("should execute and return quotes", async () => {
		if (!getQuotes.execute) throw new Error("execute not defined");
		const result = await getQuotes.execute({ instruments: ["AAPL", "MSFT"] }, {} as never);

		if ("quotes" in result) {
			expect(result.quotes).toHaveLength(2);
			expect(result.quotes[0]?.symbol).toBe("AAPL");
			expect(result.quotes[1]?.symbol).toBe("MSFT");
		} else {
			throw new Error("Unexpected validation error");
		}
	});

	it("should return quotes with expected fields", async () => {
		if (!getQuotes.execute) throw new Error("execute not defined");
		const result = await getQuotes.execute({ instruments: ["SPY"] }, {} as never);

		if ("quotes" in result) {
			const quote = result.quotes[0];
			expect(quote).toHaveProperty("symbol");
			expect(quote).toHaveProperty("bid");
			expect(quote).toHaveProperty("ask");
			expect(quote).toHaveProperty("last");
			expect(quote).toHaveProperty("volume");
			expect(quote).toHaveProperty("timestamp");
		} else {
			throw new Error("Unexpected validation error");
		}
	});
});
