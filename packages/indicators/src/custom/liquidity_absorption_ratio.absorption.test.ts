import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar } from "../types";
import { calculateLiquidityAbsorptionRatio } from "./liquidity_absorption_ratio";
import {
	generateBearishCandleWithWick,
	generateBullishCandleWithWick,
} from "./liquidity_absorption_ratio.test-helpers";

const DAY_MS = 86400000;

function buildBaseBars(baseTime: number): OHLCVBar[] {
	return Array.from({ length: 24 }, (_, i) => ({
		timestamp: baseTime + i * DAY_MS,
		open: 100,
		high: 105,
		low: 95,
		close: 102,
		volume: 1000000,
	}));
}

describe("absorption detection direction", () => {
	test("identifies bullish candle trend-opposing wick as upper", () => {
		const baseTime = Date.now() - 25 * DAY_MS;
		const bars = buildBaseBars(baseTime);
		bars.push({
			timestamp: baseTime + 24 * DAY_MS,
			open: 100,
			high: 110,
			low: 98,
			close: 105,
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(requireValue(result, "result").trendOpposingWickDirection).toBe("upper");
	});

	test("identifies bearish candle trend-opposing wick as lower", () => {
		const baseTime = Date.now() - 25 * DAY_MS;
		const bars = buildBaseBars(baseTime);
		bars.push({
			timestamp: baseTime + 24 * DAY_MS,
			open: 105,
			high: 107,
			low: 95,
			close: 100,
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(requireValue(result, "result").trendOpposingWickDirection).toBe("lower");
	});
});

describe("absorption detection strength", () => {
	test("higher wick-to-body ratio produces higher raw absorption ratio", () => {
		const baseTime = Date.now() - 25 * DAY_MS;
		const lowAbsorptionBars = buildBaseBars(baseTime);
		const highAbsorptionBars = buildBaseBars(baseTime);

		lowAbsorptionBars.push(
			generateBullishCandleWithWick(1 / 7, 1 / 7, 99, 7, 1000000, baseTime + 24 * DAY_MS),
		);
		highAbsorptionBars.push(
			generateBullishCandleWithWick(8 / 11, 1 / 11, 99, 11, 1000000, baseTime + 24 * DAY_MS),
		);

		const lowResult = calculateLiquidityAbsorptionRatio(lowAbsorptionBars);
		const highResult = calculateLiquidityAbsorptionRatio(highAbsorptionBars);

		expect(lowResult).not.toBeNull();
		expect(highResult).not.toBeNull();
		expect(requireValue(highResult, "high result").rawAbsorptionRatio).toBeGreaterThan(
			requireValue(lowResult, "low result").rawAbsorptionRatio,
		);
	});

	test("bearish wick helper produces a bearish candle", () => {
		const bar = generateBearishCandleWithWick(0.05, 0.25, 100, 10, 1000000, Date.now());
		expect(bar.close).toBeLessThan(bar.open);
	});
});
