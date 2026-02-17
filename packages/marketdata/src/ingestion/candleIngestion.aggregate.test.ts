/**
 * Candle aggregation tests
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import { aggregateCandles, type Candle } from "./candleIngestion";

const hourlyCandles: Candle[] = [
	{
		symbol: "AAPL",
		timeframe: "1h",
		timestamp: "2024-01-01T09:00:00.000Z",
		open: 150,
		high: 152,
		low: 149,
		close: 151,
		volume: 1000000,
		vwap: 150.5,
		tradeCount: 5000,
		adjusted: true,
	},
	{
		symbol: "AAPL",
		timeframe: "1h",
		timestamp: "2024-01-01T10:00:00.000Z",
		open: 151,
		high: 154,
		low: 150,
		close: 153,
		volume: 1100000,
		vwap: 152,
		tradeCount: 5500,
		adjusted: true,
	},
	{
		symbol: "AAPL",
		timeframe: "1h",
		timestamp: "2024-01-01T11:00:00.000Z",
		open: 153,
		high: 155,
		low: 152,
		close: 154,
		volume: 1200000,
		vwap: 153.5,
		tradeCount: 6000,
		adjusted: true,
	},
	{
		symbol: "AAPL",
		timeframe: "1h",
		timestamp: "2024-01-01T12:00:00.000Z",
		open: 154,
		high: 156,
		low: 153,
		close: 155,
		volume: 1300000,
		vwap: 154.5,
		tradeCount: 6500,
		adjusted: true,
	},
];

describe("aggregateCandles", () => {
	it("aggregates 1h to 4h candles", () => {
		const result = aggregateCandles(hourlyCandles, "4h");

		expect(result).toHaveLength(1);
		const candle = requireValue(result[0], "aggregated candle");
		expect(candle.timeframe).toBe("4h");
		expect(candle.open).toBe(150);
		expect(candle.high).toBe(156);
		expect(candle.low).toBe(149);
		expect(candle.close).toBe(155);
		expect(candle.volume).toBe(4600000);
	});

	it("calculates VWAP correctly", () => {
		const result = aggregateCandles(hourlyCandles, "4h");

		const expectedVWAP =
			(150.5 * 1000000 + 152 * 1100000 + 153.5 * 1200000 + 154.5 * 1300000) /
			(1000000 + 1100000 + 1200000 + 1300000);

		const firstResult = requireValue(result[0], "aggregated candle");
		expect(firstResult.vwap).toBeCloseTo(expectedVWAP, 2);
	});

	it("throws error for invalid aggregation direction", () => {
		expect(() => aggregateCandles(hourlyCandles, "1m")).toThrow(
			"Cannot aggregate to smaller timeframe",
		);
	});

	it("handles empty input", () => {
		const result = aggregateCandles([], "4h");
		expect(result).toHaveLength(0);
	});
});
