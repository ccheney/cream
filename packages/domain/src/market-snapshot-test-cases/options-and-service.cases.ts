import { describe, expect, test } from "bun:test";

import {
	GetOptionChainRequestSchema,
	GetSnapshotRequestSchema,
	OptionChainSchema,
	OptionQuoteSchema,
	SubscribeMarketDataRequestSchema,
	SubscribeMarketDataResponseSchema,
} from "../marketSnapshot";
import { validOptionContract, validQuote, validTimestamp } from "./fixtures";

describe("OptionQuoteSchema", () => {
	const validOptionQuote = {
		contract: validOptionContract,
		quote: validQuote,
		impliedVolatility: 0.25,
		delta: 0.65,
		gamma: 0.05,
		theta: -0.15,
		vega: 0.2,
		rho: 0.1,
		openInterest: 5000,
	};

	test("accepts valid option quote", () => {
		const result = OptionQuoteSchema.safeParse(validOptionQuote);
		expect(result.success).toBe(true);
	});

	test("accepts option quote without optional Greeks", () => {
		const result = OptionQuoteSchema.safeParse({
			contract: validOptionContract,
			quote: validQuote,
			openInterest: 1000,
		});
		expect(result.success).toBe(true);
	});

	test("rejects delta outside -1 to 1 range", () => {
		const result = OptionQuoteSchema.safeParse({
			...validOptionQuote,
			delta: 1.5,
		});
		expect(result.success).toBe(false);
	});

	test("accepts delta at boundaries", () => {
		const result1 = OptionQuoteSchema.safeParse({ ...validOptionQuote, delta: -1 });
		const result2 = OptionQuoteSchema.safeParse({ ...validOptionQuote, delta: 1 });
		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
	});

	test("accepts negative theta (time decay)", () => {
		const result = OptionQuoteSchema.safeParse({ ...validOptionQuote, theta: -0.5 });
		expect(result.success).toBe(true);
	});
});

describe("OptionChainSchema", () => {
	const validOptionQuote = {
		contract: validOptionContract,
		quote: validQuote,
		openInterest: 5000,
	};
	const validOptionChain = {
		underlying: "AAPL",
		underlyingPrice: 185.5,
		options: [validOptionQuote],
		asOf: validTimestamp,
	};

	test("accepts valid option chain", () => {
		const result = OptionChainSchema.safeParse(validOptionChain);
		expect(result.success).toBe(true);
	});

	test("accepts empty options array", () => {
		const result = OptionChainSchema.safeParse({
			...validOptionChain,
			options: [],
		});
		expect(result.success).toBe(true);
	});

	test("rejects zero underlying price", () => {
		const result = OptionChainSchema.safeParse({
			...validOptionChain,
			underlyingPrice: 0,
		});
		expect(result.success).toBe(false);
	});
});

describe("SubscribeMarketDataRequestSchema", () => {
	test("accepts valid request", () => {
		const result = SubscribeMarketDataRequestSchema.safeParse({
			symbols: ["AAPL", "GOOGL"],
			includeOptions: true,
			barTimeframes: [1, 5, 60],
		});
		expect(result.success).toBe(true);
	});

	test("applies defaults for optional fields", () => {
		const result = SubscribeMarketDataRequestSchema.safeParse({ symbols: ["AAPL"] });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.includeOptions).toBe(false);
			expect(result.data.barTimeframes).toEqual([]);
		}
	});
});

describe("SubscribeMarketDataResponseSchema", () => {
	test("accepts quote update", () => {
		const result = SubscribeMarketDataResponseSchema.safeParse({
			type: "quote",
			quote: validQuote,
		});
		expect(result.success).toBe(true);
	});

	test("accepts bar update", () => {
		const result = SubscribeMarketDataResponseSchema.safeParse({
			type: "bar",
			bar: {
				symbol: "AAPL",
				timestamp: validTimestamp,
				timeframeMinutes: 60,
				open: 185,
				high: 186,
				low: 184,
				close: 185.5,
				volume: 100,
			},
		});
		expect(result.success).toBe(true);
	});

	test("rejects unknown update type", () => {
		const result = SubscribeMarketDataResponseSchema.safeParse({
			type: "unknown",
			data: {},
		});
		expect(result.success).toBe(false);
	});
});

describe("GetSnapshotRequestSchema", () => {
	test("accepts valid request", () => {
		const result = GetSnapshotRequestSchema.safeParse({
			symbols: ["AAPL", "GOOGL"],
			includeBars: true,
			barTimeframes: [60, 1440],
		});
		expect(result.success).toBe(true);
	});

	test("allows empty symbols array", () => {
		const result = GetSnapshotRequestSchema.safeParse({
			symbols: [],
		});
		expect(result.success).toBe(true);
	});
});

describe("GetOptionChainRequestSchema", () => {
	test("accepts valid request", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
			expirations: ["2026-01-17", "2026-02-21"],
			minStrike: 180,
			maxStrike: 200,
		});
		expect(result.success).toBe(true);
	});

	test("rejects minStrike > maxStrike", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
			minStrike: 200,
			maxStrike: 180,
		});
		expect(result.success).toBe(false);
	});

	test("accepts request without strike range", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
		});
		expect(result.success).toBe(true);
	});

	test("rejects invalid expiration date format", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
			expirations: ["01/17/2026"],
		});
		expect(result.success).toBe(false);
	});
});
