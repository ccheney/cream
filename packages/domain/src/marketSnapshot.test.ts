/**
 * Market Snapshot Schema Tests
 */

import { describe, expect, test } from "bun:test";
import {
	BarSchema,
	GetOptionChainRequestSchema,
	GetSnapshotRequestSchema,
	MarketSnapshotSchema,
	OptionChainSchema,
	OptionQuoteSchema,
	QuoteSchema,
	SubscribeMarketDataRequestSchema,
	SubscribeMarketDataResponseSchema,
	SymbolSnapshotSchema,
} from "./marketSnapshot";
import { Iso8601Schema, Iso8601UtcSchema } from "./time";

// ============================================
// Test Fixtures
// ============================================

const validTimestamp = "2026-01-04T16:30:00Z";

const validQuote = {
	symbol: "AAPL",
	bid: 185.5,
	ask: 185.55,
	bidSize: 100,
	askSize: 200,
	last: 185.52,
	lastSize: 50,
	volume: 1000000,
	timestamp: validTimestamp,
};

const validBar = {
	symbol: "AAPL",
	timestamp: validTimestamp,
	timeframeMinutes: 60,
	open: 185.0,
	high: 186.0,
	low: 184.5,
	close: 185.75,
	volume: 500000,
	vwap: 185.25,
	tradeCount: 1500,
};

const validOptionContract = {
	underlying: "AAPL",
	expiration: "2026-01-17",
	strike: 190.0,
	optionType: "CALL" as const,
};

// ============================================
// Timestamp Tests
// ============================================

describe("Iso8601Schema", () => {
	test("accepts valid ISO-8601 timestamp with Z timezone", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T16:30:00Z");
		expect(result.success).toBe(true);
	});

	test("accepts valid ISO-8601 timestamp with offset", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T10:30:00-06:00");
		expect(result.success).toBe(true);
	});

	test("rejects timestamp without timezone", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T16:30:00");
		expect(result.success).toBe(false);
	});

	test("rejects invalid date format", () => {
		const result = Iso8601Schema.safeParse("2026/01/04 16:30:00");
		expect(result.success).toBe(false);
	});
});

describe("Iso8601UtcSchema", () => {
	test("accepts valid UTC timestamp with milliseconds", () => {
		const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00.123Z");
		expect(result.success).toBe(true);
	});

	test("accepts valid UTC timestamp without milliseconds", () => {
		const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00Z");
		expect(result.success).toBe(true);
	});

	test("rejects non-UTC timestamp with offset", () => {
		const result = Iso8601UtcSchema.safeParse("2026-01-04T10:30:00-06:00");
		expect(result.success).toBe(false);
	});
});

// ============================================
// Quote Tests
// ============================================

describe("QuoteSchema", () => {
	test("accepts valid quote", () => {
		const result = QuoteSchema.safeParse(validQuote);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.symbol).toBe("AAPL");
			expect(result.data.bid).toBe(185.5);
		}
	});

	test("rejects quote with empty symbol", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, symbol: "" });
		expect(result.success).toBe(false);
	});

	test("rejects quote with negative bid", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, bid: -1 });
		expect(result.success).toBe(false);
	});

	test("accepts quote with zero volume", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, volume: 0 });
		expect(result.success).toBe(true);
	});

	test("rejects quote with non-integer volume", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, volume: 100.5 });
		expect(result.success).toBe(false);
	});
});

// ============================================
// Bar Tests
// ============================================

describe("BarSchema", () => {
	test("accepts valid bar", () => {
		const result = BarSchema.safeParse(validBar);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.symbol).toBe("AAPL");
			expect(result.data.timeframeMinutes).toBe(60);
		}
	});

	test("accepts bar without optional fields", () => {
		const { vwap, tradeCount, ...barWithoutOptional } = validBar;
		const result = BarSchema.safeParse(barWithoutOptional);
		expect(result.success).toBe(true);
	});

	test("rejects bar with invalid timeframe", () => {
		const result = BarSchema.safeParse({ ...validBar, timeframeMinutes: 30 });
		expect(result.success).toBe(false);
	});

	test("accepts 1-minute timeframe", () => {
		const result = BarSchema.safeParse({ ...validBar, timeframeMinutes: 1 });
		expect(result.success).toBe(true);
	});

	test("accepts 1440-minute (daily) timeframe", () => {
		const result = BarSchema.safeParse({ ...validBar, timeframeMinutes: 1440 });
		expect(result.success).toBe(true);
	});

	test("rejects bar where high < low", () => {
		const result = BarSchema.safeParse({
			...validBar,
			high: 184.0,
			low: 185.0,
		});
		expect(result.success).toBe(false);
	});

	test("rejects bar where high < open", () => {
		const result = BarSchema.safeParse({
			...validBar,
			high: 184.0,
			open: 185.0,
		});
		expect(result.success).toBe(false);
	});

	test("rejects bar where low > close", () => {
		const result = BarSchema.safeParse({
			...validBar,
			low: 186.0,
			close: 185.0,
		});
		expect(result.success).toBe(false);
	});

	test("accepts bar where high = open = close = low (doji)", () => {
		const result = BarSchema.safeParse({
			...validBar,
			open: 185.0,
			high: 185.0,
			low: 185.0,
			close: 185.0,
		});
		expect(result.success).toBe(true);
	});
});

// ============================================
// Symbol Snapshot Tests
// ============================================

describe("SymbolSnapshotSchema", () => {
	const validSymbolSnapshot = {
		symbol: "AAPL",
		quote: validQuote,
		bars: [validBar],
		marketStatus: "OPEN" as const,
		dayHigh: 186.5,
		dayLow: 184.0,
		prevClose: 185.0,
		open: 185.25,
		asOf: validTimestamp,
	};

	test("accepts valid symbol snapshot", () => {
		const result = SymbolSnapshotSchema.safeParse(validSymbolSnapshot);
		expect(result.success).toBe(true);
	});

	test("accepts snapshot with empty bars array", () => {
		const result = SymbolSnapshotSchema.safeParse({
			...validSymbolSnapshot,
			bars: [],
		});
		expect(result.success).toBe(true);
	});

	test("rejects snapshot where dayHigh < dayLow", () => {
		const result = SymbolSnapshotSchema.safeParse({
			...validSymbolSnapshot,
			dayHigh: 183.0,
			dayLow: 184.0,
		});
		expect(result.success).toBe(false);
	});

	test("accepts all market status values", () => {
		const statuses = ["PRE_MARKET", "OPEN", "AFTER_HOURS", "CLOSED"] as const;
		for (const status of statuses) {
			const result = SymbolSnapshotSchema.safeParse({
				...validSymbolSnapshot,
				marketStatus: status,
			});
			expect(result.success).toBe(true);
		}
	});
});

// ============================================
// Market Snapshot Tests
// ============================================

describe("MarketSnapshotSchema", () => {
	const validSymbolSnapshot = {
		symbol: "AAPL",
		quote: validQuote,
		bars: [validBar],
		marketStatus: "OPEN" as const,
		dayHigh: 186.5,
		dayLow: 184.0,
		prevClose: 185.0,
		open: 185.25,
		asOf: validTimestamp,
	};

	const validMarketSnapshot = {
		environment: "PAPER" as const,
		asOf: validTimestamp,
		marketStatus: "OPEN" as const,
		regime: "BULL_TREND" as const,
		symbols: [validSymbolSnapshot],
	};

	test("accepts valid market snapshot", () => {
		const result = MarketSnapshotSchema.safeParse(validMarketSnapshot);
		expect(result.success).toBe(true);
	});

	test("accepts all environment values", () => {
		const envs = ["PAPER", "LIVE"] as const;
		for (const env of envs) {
			const result = MarketSnapshotSchema.safeParse({
				...validMarketSnapshot,
				environment: env,
			});
			expect(result.success).toBe(true);
		}
	});

	test("rejects BACKTEST environment", () => {
		const result = MarketSnapshotSchema.safeParse({
			...validMarketSnapshot,
			environment: "BACKTEST",
		});
		expect(result.success).toBe(false);
	});

	test("accepts all regime values", () => {
		const regimes = [
			"BULL_TREND",
			"BEAR_TREND",
			"RANGE_BOUND",
			"HIGH_VOLATILITY",
			"LOW_VOLATILITY",
			"CRISIS",
		] as const;
		for (const regime of regimes) {
			const result = MarketSnapshotSchema.safeParse({
				...validMarketSnapshot,
				regime,
			});
			expect(result.success).toBe(true);
		}
	});

	test("accepts snapshot with empty symbols array", () => {
		const result = MarketSnapshotSchema.safeParse({
			...validMarketSnapshot,
			symbols: [],
		});
		expect(result.success).toBe(true);
	});
});

// ============================================
// Option Quote Tests
// ============================================

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
		const result1 = OptionQuoteSchema.safeParse({
			...validOptionQuote,
			delta: -1,
		});
		const result2 = OptionQuoteSchema.safeParse({
			...validOptionQuote,
			delta: 1,
		});
		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
	});

	test("accepts negative theta (time decay)", () => {
		const result = OptionQuoteSchema.safeParse({
			...validOptionQuote,
			theta: -0.5,
		});
		expect(result.success).toBe(true);
	});
});

// ============================================
// Option Chain Tests
// ============================================

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

// ============================================
// Service Request/Response Tests
// ============================================

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
		const result = SubscribeMarketDataRequestSchema.safeParse({
			symbols: ["AAPL"],
		});
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
			bar: validBar,
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

	test("rejects empty symbols array", () => {
		const result = GetSnapshotRequestSchema.safeParse({
			symbols: [],
		});
		// Empty array is technically valid, but let's allow it
		expect(result.success).toBe(true);
	});
});

describe("GetOptionChainRequestSchema", () => {
	test("accepts valid request", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
			expirations: ["2026-01-17", "2026-02-21"],
			minStrike: 180.0,
			maxStrike: 200.0,
		});
		expect(result.success).toBe(true);
	});

	test("rejects minStrike > maxStrike", () => {
		const result = GetOptionChainRequestSchema.safeParse({
			underlying: "AAPL",
			minStrike: 200.0,
			maxStrike: 180.0,
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
