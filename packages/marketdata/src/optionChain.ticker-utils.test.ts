/**
 * Option Chain utility tests
 */

import { describe, expect, it } from "bun:test";
import { buildOptionTicker, calculateDte, DEFAULT_FILTERS, parseOptionTicker } from "./optionChain";

describe("parseOptionTicker", () => {
	it("parses valid call option ticker", () => {
		const result = parseOptionTicker("AAPL260119C00150000");
		expect(result).toEqual({
			underlying: "AAPL",
			expiration: "2026-01-19",
			type: "call",
			strike: 150,
		});
	});

	it("parses valid put option ticker", () => {
		const result = parseOptionTicker("MSFT260315P00400000");
		expect(result).toEqual({
			underlying: "MSFT",
			expiration: "2026-03-15",
			type: "put",
			strike: 400,
		});
	});

	it("handles fractional strikes", () => {
		const result = parseOptionTicker("SPY260221C00475500");
		expect(result).toEqual({
			underlying: "SPY",
			expiration: "2026-02-21",
			type: "call",
			strike: 475.5,
		});
	});

	it("returns undefined for invalid ticker", () => {
		expect(parseOptionTicker("AAPL")).toBeUndefined();
		expect(parseOptionTicker("invalid")).toBeUndefined();
		expect(parseOptionTicker("")).toBeUndefined();
	});
});

describe("buildOptionTicker", () => {
	it("builds call option ticker", () => {
		const ticker = buildOptionTicker("AAPL", "2026-01-19", "call", 150);
		expect(ticker).toBe("AAPL260119C00150000");
	});

	it("builds put option ticker", () => {
		const ticker = buildOptionTicker("MSFT", "2026-03-15", "put", 400);
		expect(ticker).toBe("MSFT260315P00400000");
	});

	it("handles fractional strikes", () => {
		const ticker = buildOptionTicker("SPY", "2026-02-21", "call", 475.5);
		expect(ticker).toBe("SPY260221C00475500");
	});

	it("roundtrips with parseOptionTicker", () => {
		const original = {
			underlying: "AAPL",
			expiration: "2026-01-19",
			type: "call" as const,
			strike: 150,
		};
		const ticker = buildOptionTicker(
			original.underlying,
			original.expiration,
			original.type,
			original.strike,
		);
		const parsed = parseOptionTicker(ticker);
		expect(parsed).toEqual(original);
	});
});

describe("calculateDte", () => {
	it("calculates positive DTE", () => {
		const future = new Date();
		future.setDate(future.getDate() + 30);
		const expiration = future.toISOString().split("T")[0];
		if (!expiration) {
			throw new Error("Failed to get expiration date");
		}

		const dte = calculateDte(expiration);
		expect(dte).toBeGreaterThanOrEqual(29);
		expect(dte).toBeLessThanOrEqual(31);
	});

	it("returns 0 for today", () => {
		const today = new Date().toISOString().split("T")[0];
		if (!today) {
			throw new Error("Failed to get today's date");
		}

		const dte = calculateDte(today);
		expect(dte).toBeLessThanOrEqual(1);
	});
});

describe("DEFAULT_FILTERS", () => {
	it("has creditSpread filter", () => {
		expect(DEFAULT_FILTERS.creditSpread).toBeDefined();
		expect(DEFAULT_FILTERS.creditSpread?.minDte).toBe(30);
		expect(DEFAULT_FILTERS.creditSpread?.maxDte).toBe(60);
	});

	it("has debitSpread filter", () => {
		expect(DEFAULT_FILTERS.debitSpread).toBeDefined();
		expect(DEFAULT_FILTERS.debitSpread?.minDelta).toBe(0.3);
	});

	it("has coveredCall filter with call type", () => {
		expect(DEFAULT_FILTERS.coveredCall).toBeDefined();
		expect(DEFAULT_FILTERS.coveredCall?.optionType).toBe("call");
	});

	it("has cashSecuredPut filter with put type", () => {
		expect(DEFAULT_FILTERS.cashSecuredPut).toBeDefined();
		expect(DEFAULT_FILTERS.cashSecuredPut?.optionType).toBe("put");
	});
});
