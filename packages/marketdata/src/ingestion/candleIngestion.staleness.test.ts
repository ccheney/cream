/**
 * Candle staleness tests
 */

import { describe, expect, it } from "bun:test";
import { type Candle, checkStaleness } from "./candleIngestion";

describe("checkStaleness", () => {
	it("returns stale for null candle", () => {
		const result = checkStaleness(null, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBe(Infinity);
		expect(result.lastTimestamp).toBeNull();
	});

	it("returns not stale for recent candle", () => {
		const recentCandle: Candle = {
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 1000000,
			vwap: 150.5,
			tradeCount: 5000,
			adjusted: true,
		};

		const result = checkStaleness(recentCandle, "1h");

		expect(result.isStale).toBe(false);
		expect(result.staleMinutes).toBeLessThan(120);
	});

	it("returns stale for old candle", () => {
		const oldCandle: Candle = {
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 1000000,
			vwap: 150.5,
			tradeCount: 5000,
			adjusted: true,
		};

		const result = checkStaleness(oldCandle, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBeGreaterThan(120);
	});
});
