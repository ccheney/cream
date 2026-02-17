import { describe, expect, test } from "bun:test";

import { BarSchema } from "../marketSnapshot";
import { validBar } from "./fixtures";

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
});

describe("BarSchema", () => {
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
