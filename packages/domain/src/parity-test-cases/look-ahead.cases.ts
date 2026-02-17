import { describe, expect, test } from "bun:test";

import { checkLookAheadBias, type ParityCandle } from "../parity";

const baseCandles: ParityCandle[] = [
	{
		timestamp: "2026-01-04T09:00:00Z",
		open: 100,
		high: 105,
		low: 99,
		close: 103,
		volume: 1000,
	},
	{
		timestamp: "2026-01-04T10:00:00Z",
		open: 103,
		high: 108,
		low: 102,
		close: 107,
		volume: 1200,
	},
	{
		timestamp: "2026-01-04T11:00:00Z",
		open: 107,
		high: 110,
		low: 105,
		close: 108,
		volume: 1100,
	},
];

describe("checkLookAheadBias", () => {
	test("passes for valid sequential candles", () => {
		const result = checkLookAheadBias(baseCandles, "2026-01-04T12:00:00Z");

		expect(result.valid).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("detects future data", () => {
		const result = checkLookAheadBias(baseCandles, "2026-01-04T10:30:00Z");

		expect(result.valid).toBe(false);
		expect(result.violations.some((violation) => violation.type === "future_data")).toBe(true);
	});
});

describe("checkLookAheadBias", () => {
	test("detects non-sequential timestamps", () => {
		const outOfOrder = [baseCandles[1], baseCandles[0], baseCandles[2]].filter(
			(candle): candle is ParityCandle => candle !== undefined,
		);

		const result = checkLookAheadBias(outOfOrder, "2026-01-04T12:00:00Z");

		expect(result.valid).toBe(false);
		expect(result.violations.some((violation) => violation.type === "non_sequential")).toBe(true);
	});
});
