/**
 * MockMarketDataAdapter Tests
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { MockMarketDataAdapter } from "./factory";

let adapter: MockMarketDataAdapter;

beforeEach(() => {
	adapter = new MockMarketDataAdapter();
});

describe("MockMarketDataAdapter.getCandles", () => {
	test("returns 120 candles by default", async () => {
		const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
		expect(candles).toHaveLength(120);
	});

	test("returns candles with valid OHLCV data", async () => {
		const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
		for (const candle of candles) {
			expect(candle.timestamp).toBeGreaterThan(0);
			expect(candle.open).toBeGreaterThan(0);
			expect(candle.high).toBeGreaterThanOrEqual(candle.low);
			expect(candle.close).toBeGreaterThan(0);
			expect(candle.volume).toBeGreaterThan(0);
		}
	});

	test("returns deterministic data for same symbol", async () => {
		const candles1 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
		const candles2 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
		expect(candles1).toEqual(candles2);
	});

	test("returns different data for different symbols", async () => {
		const candles1 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
		const candles2 = await adapter.getCandles("MSFT", "1h", "2026-01-01", "2026-01-06");
		expect(candles1[0]?.close).not.toBe(candles2[0]?.close);
	});
});

describe("MockMarketDataAdapter.getQuote", () => {
	test("returns quote with valid structure", async () => {
		const quote = await adapter.getQuote("AAPL");
		expect(quote).not.toBeNull();
		expect(quote?.symbol).toBe("AAPL");
		expect(quote?.bid).toBeGreaterThan(0);
		expect(quote?.ask).toBeGreaterThan(quote?.bid ?? 0);
		expect(quote?.last).toBeGreaterThan(0);
	});

	test("returns deterministic quote for same symbol", async () => {
		const quote1 = await adapter.getQuote("AAPL");
		const quote2 = await adapter.getQuote("AAPL");
		expect(quote1?.bid).toBe(quote2?.bid);
		expect(quote1?.ask).toBe(quote2?.ask);
	});
});

describe("MockMarketDataAdapter.getQuotes", () => {
	test("returns quotes for all symbols", async () => {
		const quotes = await adapter.getQuotes(["AAPL", "MSFT", "GOOGL"]);
		expect(quotes.size).toBe(3);
		expect(quotes.has("AAPL")).toBe(true);
		expect(quotes.has("MSFT")).toBe(true);
		expect(quotes.has("GOOGL")).toBe(true);
	});
});

describe("MockMarketDataAdapter.isReady", () => {
	test("returns true", () => {
		expect(adapter.isReady()).toBe(true);
	});
});
