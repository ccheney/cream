/**
 * Tests for Liquidity Absorption Ratio (LAR) Calculator
 */

import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar } from "../types";
import {
	calculateLiquidityAbsorptionRatio,
	calculateLiquidityAbsorptionRatioSeries,
	classifyLAR,
	detectTrendExhaustion,
	type LiquidityAbsorptionRatioResult,
} from "./liquidity_absorption_ratio";
import {
	generateBars,
	generateBullishCandleWithWick,
	generateLowAbsorptionBars,
} from "./liquidity_absorption_ratio.test-helpers";

describe("result structure", () => {
	test("contains all required fields", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(typeof requireValue(result, "result").value).toBe("number");
		expect(typeof requireValue(result, "result").rawAbsorptionRatio).toBe("number");
		expect(typeof requireValue(result, "result").upperWickVolume).toBe("number");
		expect(typeof requireValue(result, "result").lowerWickVolume).toBe("number");
		expect(typeof requireValue(result, "result").bodyVolume).toBe("number");
		expect(["upper", "lower"]).toContain(requireValue(result, "result").trendOpposingWickDirection);
		expect(typeof requireValue(result, "result").rollingMean).toBe("number");
		expect(typeof requireValue(result, "result").rollingStdDev).toBe("number");
		expect(typeof requireValue(result, "result").timestamp).toBe("number");
	});

	test("value is clamped to [-3, 3] range", () => {
		const bars = generateBars(100);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").value).toBeGreaterThanOrEqual(-3);
		expect(requireValue(result, "result").value).toBeLessThanOrEqual(3);
	});

	test("volume components are non-negative", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").upperWickVolume).toBeGreaterThanOrEqual(0);
		expect(requireValue(result, "result").lowerWickVolume).toBeGreaterThanOrEqual(0);
		expect(requireValue(result, "result").bodyVolume).toBeGreaterThanOrEqual(0);
	});

	test("rollingStdDev is positive", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").rollingStdDev).toBeGreaterThan(0);
	});
});

describe("Z-score normalization", () => {
	test("produces higher Z-score for outlier absorption", () => {
		const bars = generateLowAbsorptionBars(24);
		bars.push(generateBullishCandleWithWick(0.6, 0.1, 100, 10, 1000000, Date.now()));

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(requireValue(result, "result").value).toBeGreaterThan(0);
	});

	test("produces near-zero Z-score for average absorption", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 30 * 86400000;

		for (let i = 0; i < 30; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000000,
			});
		}

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(Math.abs(requireValue(result, "result").value)).toBeLessThan(1.5);
	});
});

describe("golden value test", () => {
	test("produces expected result for deterministic input", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = 1700000000000;

		for (let i = 0; i < 20; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 110.5263,
				low: 99.4737,
				close: 110,
				volume: 1000000,
			});
		}

		bars.push({
			timestamp: baseTime + 20 * 86400000,
			open: 100,
			high: 118.18,
			low: 100,
			close: 110,
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(requireValue(result, "result").timestamp).toBe(baseTime + 20 * 86400000);
		expect(requireValue(result, "result").trendOpposingWickDirection).toBe("upper");
		expect(requireValue(result, "result").rawAbsorptionRatio).toBeGreaterThan(0.3);
		expect(requireValue(result, "result").value).toBeGreaterThan(0);
	});
});

describe("calculateLiquidityAbsorptionRatioSeries", () => {
	test("returns array of same length as input", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);
		expect(series).toHaveLength(50);
	});

	test("returns null for early bars with insufficient history", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);

		for (let i = 0; i < 20; i++) {
			expect(series[i]).toBeNull();
		}

		expect(series[20]).not.toBeNull();
	});

	test("produces consistent results with single calculation", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);
		const singleResult = calculateLiquidityAbsorptionRatio(bars);
		const lastSeriesResult = series.at(-1);

		expect(lastSeriesResult).not.toBeNull();
		expect(singleResult).not.toBeNull();
		expect(requireValue(lastSeriesResult, "last series result").value).toBe(
			requireValue(singleResult, "single result").value,
		);
		expect(requireValue(lastSeriesResult, "last series result").rawAbsorptionRatio).toBe(
			requireValue(singleResult, "single result").rawAbsorptionRatio,
		);
	});
});

describe("classifyLAR", () => {
	test("classifies extreme absorption correctly", () => {
		expect(classifyLAR(2.5)).toBe("extreme_absorption");
		expect(classifyLAR(3.0)).toBe("extreme_absorption");
		expect(classifyLAR(-2.5)).toBe("extreme_absorption");
		expect(classifyLAR(-3.0)).toBe("extreme_absorption");
	});

	test("classifies high absorption correctly", () => {
		expect(classifyLAR(2.0)).toBe("high_absorption");
		expect(classifyLAR(2.4)).toBe("high_absorption");
		expect(classifyLAR(-2.0)).toBe("high_absorption");
		expect(classifyLAR(-2.4)).toBe("high_absorption");
	});

	test("classifies moderate absorption correctly", () => {
		expect(classifyLAR(1.5)).toBe("moderate_absorption");
		expect(classifyLAR(1.9)).toBe("moderate_absorption");
		expect(classifyLAR(-1.5)).toBe("moderate_absorption");
	});

	test("classifies normal correctly", () => {
		expect(classifyLAR(1.0)).toBe("normal");
		expect(classifyLAR(1.4)).toBe("normal");
		expect(classifyLAR(-1.0)).toBe("normal");
	});

	test("classifies low absorption correctly", () => {
		expect(classifyLAR(0.0)).toBe("low_absorption");
		expect(classifyLAR(0.5)).toBe("low_absorption");
		expect(classifyLAR(0.9)).toBe("low_absorption");
		expect(classifyLAR(-0.5)).toBe("low_absorption");
	});
});

describe("detectTrendExhaustion", () => {
	test("returns true for high absorption (Z-score > 2.0)", () => {
		const result: LiquidityAbsorptionRatioResult = {
			value: 2.5,
			rawAbsorptionRatio: 1.5,
			upperWickVolume: 400000,
			lowerWickVolume: 100000,
			bodyVolume: 500000,
			trendOpposingWickDirection: "upper",
			rollingMean: 0.5,
			rollingStdDev: 0.4,
			timestamp: Date.now(),
		};

		expect(detectTrendExhaustion(result)).toBe(true);
	});

	test("returns false for normal absorption (Z-score <= 2.0)", () => {
		const result: LiquidityAbsorptionRatioResult = {
			value: 1.5,
			rawAbsorptionRatio: 0.8,
			upperWickVolume: 200000,
			lowerWickVolume: 100000,
			bodyVolume: 700000,
			trendOpposingWickDirection: "upper",
			rollingMean: 0.5,
			rollingStdDev: 0.2,
			timestamp: Date.now(),
		};

		expect(detectTrendExhaustion(result)).toBe(false);
	});

	test("returns false for negative Z-score", () => {
		const result: LiquidityAbsorptionRatioResult = {
			value: -2.5,
			rawAbsorptionRatio: 0.1,
			upperWickVolume: 50000,
			lowerWickVolume: 50000,
			bodyVolume: 900000,
			trendOpposingWickDirection: "upper",
			rollingMean: 0.5,
			rollingStdDev: 0.16,
			timestamp: Date.now(),
		};

		expect(detectTrendExhaustion(result)).toBe(false);
	});
});

describe("configuration options", () => {
	test("respects custom normalization period", () => {
		const bars = generateBars(15);

		const defaultResult = calculateLiquidityAbsorptionRatio(bars);
		expect(defaultResult).toBeNull();

		const customResult = calculateLiquidityAbsorptionRatio(bars, { normalizationPeriod: 10 });
		expect(customResult).not.toBeNull();
	});

	test("handles custom minRangeFraction", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 25 * 86400000;

		for (let i = 0; i < 25; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100.0,
				high: 100.01,
				low: 99.99,
				close: 100.005,
				volume: 1000000,
			});
		}

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();

		const strictResult = calculateLiquidityAbsorptionRatio(bars, { minRangeFraction: 0.01 });
		expect(strictResult).toBeNull();
	});
});
