import { expect, it } from "bun:test";

import { validateRawCandle, validateRawCandles } from "./external";

it("validateRawCandle accepts valid standard format", () => {
	const result = validateRawCandle({
		timestamp: "2024-01-15T10:30:00Z",
		open: 100,
		high: 105,
		low: 98,
		close: 103,
		volume: 1000000,
	});
	expect(result.valid).toBe(true);
	expect(result.issues).toHaveLength(0);
	expect(result.sanitized).toBeDefined();
});

it("validateRawCandle accepts valid polygon format", () => {
	const result = validateRawCandle({
		t: Date.now(),
		o: 100,
		h: 105,
		l: 98,
		c: 103,
		v: 1000000,
	});
	expect(result.valid).toBe(true);
	expect(result.issues).toHaveLength(0);
});

it("validateRawCandle rejects invalid OHLC", () => {
	const result = validateRawCandle({
		timestamp: "2024-01-15T10:30:00Z",
		open: 100,
		high: 95,
		low: 98,
		close: 103,
		volume: 1000000,
	});
	expect(result.valid).toBe(false);
	expect(result.issues.some((i) => i.issue.includes("High"))).toBe(true);
});

it("validateRawCandle rejects missing prices", () => {
	const result = validateRawCandle({
		timestamp: "2024-01-15T10:30:00Z",
		open: 100,
		high: 105,
		close: 103,
		volume: 1000000,
	});
	expect(result.valid).toBe(false);
});

it("validateRawCandle rejects negative volume", () => {
	const result = validateRawCandle({
		timestamp: "2024-01-15T10:30:00Z",
		open: 100,
		high: 105,
		low: 98,
		close: 103,
		volume: -1000,
	});
	expect(result.valid).toBe(false);
});

it("validateRawCandles separates valid and invalid candles", () => {
	const candles = [
		{
			timestamp: "2024-01-15T10:30:00Z",
			open: 100,
			high: 105,
			low: 98,
			close: 103,
			volume: 1000000,
		},
		{
			timestamp: "2024-01-15T10:31:00Z",
			open: 100,
			high: 95,
			low: 98,
			close: 103,
			volume: 1000000,
		},
		{
			timestamp: "2024-01-15T10:32:00Z",
			open: 103,
			high: 108,
			low: 102,
			close: 106,
			volume: 1200000,
		},
	];

	const result = validateRawCandles(candles);
	expect(result.valid).toHaveLength(2);
	expect(result.invalid).toHaveLength(1);
	expect(result.invalid[0]?.index).toBe(1);
});
