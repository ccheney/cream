import { describe, expect, test } from "bun:test";

import { MarketSnapshotSchema, SymbolSnapshotSchema } from "../marketSnapshot";
import { validBar, validQuote, validTimestamp } from "./fixtures";

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
		for (const environment of ["PAPER", "LIVE"] as const) {
			const result = MarketSnapshotSchema.safeParse({
				...validMarketSnapshot,
				environment,
			});
			expect(result.success).toBe(true);
		}
	});
});

describe("MarketSnapshotSchema", () => {
	test("accepts all regime values", () => {
		const validMarketSnapshot = {
			environment: "PAPER" as const,
			asOf: validTimestamp,
			marketStatus: "OPEN" as const,
			regime: "BULL_TREND" as const,
			symbols: [],
		};

		for (const regime of [
			"BULL_TREND",
			"BEAR_TREND",
			"RANGE_BOUND",
			"HIGH_VOLATILITY",
			"LOW_VOLATILITY",
			"CRISIS",
		] as const) {
			const result = MarketSnapshotSchema.safeParse({
				...validMarketSnapshot,
				regime,
			});
			expect(result.success).toBe(true);
		}
	});

	test("accepts snapshot with empty symbols array", () => {
		const result = MarketSnapshotSchema.safeParse({
			environment: "PAPER",
			asOf: validTimestamp,
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		});
		expect(result.success).toBe(true);
	});
});
