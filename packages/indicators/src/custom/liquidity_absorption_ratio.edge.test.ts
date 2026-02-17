import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar } from "../types";
import { calculateLiquidityAbsorptionRatio } from "./liquidity_absorption_ratio";
import { generateBars } from "./liquidity_absorption_ratio.test-helpers";

const DAY_MS = 86400000;

function buildFlatBars(
	count: number,
	bar: Omit<OHLCVBar, "timestamp">,
	baseTime = Date.now() - count * DAY_MS,
): OHLCVBar[] {
	return Array.from({ length: count }, (_, index) => ({
		timestamp: baseTime + index * DAY_MS,
		...bar,
	}));
}

describe("calculateLiquidityAbsorptionRatio edge input", () => {
	test("returns null for empty array", () => {
		expect(calculateLiquidityAbsorptionRatio([])).toBeNull();
	});

	test("returns null for single candle", () => {
		const bars: OHLCVBar[] = [
			{
				timestamp: Date.now(),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000000,
			},
		];
		expect(calculateLiquidityAbsorptionRatio(bars)).toBeNull();
	});

	test("returns null for insufficient data", () => {
		expect(calculateLiquidityAbsorptionRatio(generateBars(15))).toBeNull();
	});

	test("returns result for exactly normalization period + 1 bars", () => {
		expect(calculateLiquidityAbsorptionRatio(generateBars(21))).not.toBeNull();
	});
});

describe("calculateLiquidityAbsorptionRatio edge candle shape", () => {
	test("handles doji candles (open equals close)", () => {
		const bars = buildFlatBars(25, {
			open: 100,
			high: 105,
			low: 95,
			close: 100,
			volume: 1000000,
		});
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").bodyVolume).toBe(0);
		expect(Number.isFinite(requireValue(result, "result").rawAbsorptionRatio)).toBe(true);
		expect(Number.isFinite(requireValue(result, "result").value)).toBe(true);
	});

	test("handles zero volume bars", () => {
		const bars = buildFlatBars(25, {
			open: 100,
			high: 105,
			low: 95,
			close: 102,
			volume: 0,
		});
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").upperWickVolume).toBe(0);
		expect(requireValue(result, "result").lowerWickVolume).toBe(0);
		expect(requireValue(result, "result").bodyVolume).toBe(0);
	});
});

describe("calculateLiquidityAbsorptionRatio edge min range", () => {
	test("returns null for very small price ranges", () => {
		const bars = buildFlatBars(25, {
			open: 100.0000001,
			high: 100.0000002,
			low: 100.0,
			close: 100.0000001,
			volume: 1000000,
		});

		expect(calculateLiquidityAbsorptionRatio(bars)).toBeNull();
	});
});
