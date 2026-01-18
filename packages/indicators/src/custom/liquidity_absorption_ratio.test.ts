/**
 * Tests for Liquidity Absorption Ratio (LAR) Calculator
 */

import { describe, expect, test } from "bun:test";
import type { OHLCVBar } from "../types";
import {
	calculateLiquidityAbsorptionRatio,
	calculateLiquidityAbsorptionRatioSeries,
	classifyLAR,
	detectTrendExhaustion,
	type LiquidityAbsorptionRatioResult,
} from "./liquidity_absorption_ratio";

// ============================================================
// Test Fixtures
// ============================================================

/**
 * Generate random OHLCV bars for testing
 */
function generateBars(count: number, startPrice = 100, volatility = 0.02): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let price = startPrice;
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		const change = (Math.random() - 0.5) * 2 * volatility;
		const open = price;
		const high = price * (1 + Math.abs(change) + Math.random() * 0.01);
		const low = price * (1 - Math.abs(change) - Math.random() * 0.01);
		price = price * (1 + change);
		const close = price;
		const volume = Math.floor(1000000 + Math.random() * 500000);

		bars.push({
			timestamp: baseTime + i * 86400000,
			open,
			high,
			low,
			close,
			volume,
		});
	}

	return bars;
}

/**
 * Generate a bullish candle with a specific upper wick ratio
 * Used to test absorption detection
 */
function generateBullishCandleWithWick(
	upperWickRatio: number,
	lowerWickRatio: number,
	basePrice = 100,
	totalRange = 10,
	volume = 1000000,
	timestamp = Date.now()
): OHLCVBar {
	const low = basePrice;
	const high = basePrice + totalRange;
	const bodySize = totalRange * (1 - upperWickRatio - lowerWickRatio);
	const open = low + totalRange * lowerWickRatio;
	const close = open + bodySize;

	return {
		timestamp,
		open,
		high,
		low,
		close,
		volume,
	};
}

/**
 * Generate a bearish candle with a specific lower wick ratio
 */
function generateBearishCandleWithWick(
	upperWickRatio: number,
	lowerWickRatio: number,
	basePrice = 100,
	totalRange = 10,
	volume = 1000000,
	timestamp = Date.now()
): OHLCVBar {
	const low = basePrice;
	const high = basePrice + totalRange;
	const bodySize = totalRange * (1 - upperWickRatio - lowerWickRatio);
	const close = low + totalRange * lowerWickRatio;
	const open = close + bodySize;

	return {
		timestamp,
		open,
		high,
		low,
		close,
		volume,
	};
}

/**
 * Generate bars with low absorption (small wicks relative to body)
 */
function generateLowAbsorptionBars(count: number): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		// Alternate between bullish and bearish candles with small wicks
		const isBullish = i % 2 === 0;

		if (isBullish) {
			// Bullish candle with small upper wick (5% upper, 5% lower, 90% body)
			bars.push(
				generateBullishCandleWithWick(0.05, 0.05, 100, 10, 1000000, baseTime + i * 86400000)
			);
		} else {
			// Bearish candle with small lower wick (5% upper, 5% lower, 90% body)
			bars.push(
				generateBearishCandleWithWick(0.05, 0.05, 100, 10, 1000000, baseTime + i * 86400000)
			);
		}
	}

	return bars;
}

// ============================================================
// Edge Case Tests
// ============================================================

describe("calculateLiquidityAbsorptionRatio", () => {
	describe("edge cases", () => {
		test("returns null for empty array", () => {
			const result = calculateLiquidityAbsorptionRatio([]);
			expect(result).toBeNull();
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
			const result = calculateLiquidityAbsorptionRatio(bars);
			expect(result).toBeNull();
		});

		test("returns null for insufficient data (less than normalization period + 1)", () => {
			const bars = generateBars(15); // Default period is 20
			const result = calculateLiquidityAbsorptionRatio(bars);
			expect(result).toBeNull();
		});

		test("returns result for exactly normalization period + 1 bars", () => {
			const bars = generateBars(21); // 20 + 1
			const result = calculateLiquidityAbsorptionRatio(bars);
			expect(result).not.toBeNull();
		});

		test("handles doji candles (open equals close)", () => {
			const bars: OHLCVBar[] = [];
			const baseTime = Date.now() - 25 * 86400000;

			for (let i = 0; i < 25; i++) {
				bars.push({
					timestamp: baseTime + i * 86400000,
					open: 100,
					high: 105,
					low: 95,
					close: 100, // Doji - open equals close
					volume: 1000000,
				});
			}

			const result = calculateLiquidityAbsorptionRatio(bars);
			expect(result).not.toBeNull();
			// For doji, body is 0 in the result (actual volume estimate)
			// The minBodyFraction is used internally for absorption ratio calculation
			expect(result!.bodyVolume).toBe(0);
			// But we still get a valid absorption ratio (not NaN or Infinity)
			expect(Number.isFinite(result!.rawAbsorptionRatio)).toBe(true);
			expect(Number.isFinite(result!.value)).toBe(true);
		});

		test("handles zero volume bars", () => {
			const bars: OHLCVBar[] = [];
			const baseTime = Date.now() - 25 * 86400000;

			for (let i = 0; i < 25; i++) {
				bars.push({
					timestamp: baseTime + i * 86400000,
					open: 100,
					high: 105,
					low: 95,
					close: 102,
					volume: 0,
				});
			}

			const result = calculateLiquidityAbsorptionRatio(bars);
			expect(result).not.toBeNull();
			expect(result!.upperWickVolume).toBe(0);
			expect(result!.lowerWickVolume).toBe(0);
			expect(result!.bodyVolume).toBe(0);
		});

		test("handles very small price ranges (returns null due to minRangeFraction)", () => {
			const bars: OHLCVBar[] = [];
			const baseTime = Date.now() - 25 * 86400000;

			for (let i = 0; i < 25; i++) {
				bars.push({
					timestamp: baseTime + i * 86400000,
					open: 100.0000001,
					high: 100.0000002,
					low: 100.0,
					close: 100.0000001,
					volume: 1000000,
				});
			}

			const result = calculateLiquidityAbsorptionRatio(bars);
			// Should return null because range is below minRangeFraction threshold
			expect(result).toBeNull();
		});
	});
});

// ============================================================
// Result Structure Tests
// ============================================================

describe("result structure", () => {
	test("contains all required fields", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(typeof result!.value).toBe("number");
		expect(typeof result!.rawAbsorptionRatio).toBe("number");
		expect(typeof result!.upperWickVolume).toBe("number");
		expect(typeof result!.lowerWickVolume).toBe("number");
		expect(typeof result!.bodyVolume).toBe("number");
		expect(["upper", "lower"]).toContain(result!.trendOpposingWickDirection);
		expect(typeof result!.rollingMean).toBe("number");
		expect(typeof result!.rollingStdDev).toBe("number");
		expect(typeof result!.timestamp).toBe("number");
	});

	test("value is clamped to [-3, 3] range", () => {
		const bars = generateBars(100);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(result!.value).toBeGreaterThanOrEqual(-3);
		expect(result!.value).toBeLessThanOrEqual(3);
	});

	test("volume components are non-negative", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(result!.upperWickVolume).toBeGreaterThanOrEqual(0);
		expect(result!.lowerWickVolume).toBeGreaterThanOrEqual(0);
		expect(result!.bodyVolume).toBeGreaterThanOrEqual(0);
	});

	test("rollingStdDev is positive", () => {
		const bars = generateBars(50);
		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(result!.rollingStdDev).toBeGreaterThan(0);
	});
});

// ============================================================
// Absorption Detection Tests
// ============================================================

describe("absorption detection", () => {
	test("identifies bullish candle trend-opposing wick as upper", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 25 * 86400000;

		// Generate 24 normal bars, then one bullish candle
		for (let i = 0; i < 24; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000000,
			});
		}

		// Final bullish candle (close > open)
		bars.push({
			timestamp: baseTime + 24 * 86400000,
			open: 100,
			high: 110,
			low: 98,
			close: 105, // Bullish
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(result!.trendOpposingWickDirection).toBe("upper");
	});

	test("identifies bearish candle trend-opposing wick as lower", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 25 * 86400000;

		// Generate 24 normal bars, then one bearish candle
		for (let i = 0; i < 24; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000000,
			});
		}

		// Final bearish candle (close < open)
		bars.push({
			timestamp: baseTime + 24 * 86400000,
			open: 105,
			high: 107,
			low: 95,
			close: 100, // Bearish
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		expect(result!.trendOpposingWickDirection).toBe("lower");
	});

	test("higher wick-to-body ratio produces higher raw absorption ratio", () => {
		// Create a series of low absorption bars followed by a high absorption bar
		const lowAbsorptionBars: OHLCVBar[] = [];
		const highAbsorptionBars: OHLCVBar[] = [];
		const baseTime = Date.now() - 25 * 86400000;

		// Same base bars for both
		for (let i = 0; i < 24; i++) {
			const bar: OHLCVBar = {
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000000,
			};
			lowAbsorptionBars.push(bar);
			highAbsorptionBars.push(bar);
		}

		// Low absorption final bar (small upper wick relative to body)
		lowAbsorptionBars.push({
			timestamp: baseTime + 24 * 86400000,
			open: 100,
			high: 106, // 1 point upper wick
			low: 99, // 1 point lower wick
			close: 105, // 5 point body
			volume: 1000000,
		});

		// High absorption final bar (large upper wick relative to body)
		highAbsorptionBars.push({
			timestamp: baseTime + 24 * 86400000,
			open: 100,
			high: 110, // 8 point upper wick
			low: 99, // 1 point lower wick
			close: 102, // 2 point body
			volume: 1000000,
		});

		const lowResult = calculateLiquidityAbsorptionRatio(lowAbsorptionBars);
		const highResult = calculateLiquidityAbsorptionRatio(highAbsorptionBars);

		expect(lowResult).not.toBeNull();
		expect(highResult).not.toBeNull();
		expect(highResult!.rawAbsorptionRatio).toBeGreaterThan(lowResult!.rawAbsorptionRatio);
	});
});

// ============================================================
// Z-Score Normalization Tests
// ============================================================

describe("Z-score normalization", () => {
	test("produces higher Z-score for outlier absorption", () => {
		// Create bars with consistent low absorption, then add high absorption
		const bars = generateLowAbsorptionBars(24);

		// Add a high absorption bar at the end
		bars.push(
			generateBullishCandleWithWick(
				0.6, // 60% upper wick
				0.1, // 10% lower wick
				100,
				10,
				1000000,
				Date.now()
			)
		);

		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();
		// The final high absorption bar should have a positive Z-score
		expect(result!.value).toBeGreaterThan(0);
	});

	test("produces near-zero Z-score for average absorption", () => {
		// Create consistent bars
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
		// Consistent bars should produce Z-score near 0
		expect(Math.abs(result!.value)).toBeLessThan(1.5);
	});
});

// ============================================================
// Golden Value Test
// ============================================================

describe("golden value test", () => {
	test("produces expected result for deterministic input", () => {
		// Create a deterministic sequence of bars
		const bars: OHLCVBar[] = [];
		const baseTime = 1700000000000; // Fixed timestamp

		// 20 bars with consistent structure (5% upper wick, 5% lower wick, 90% body)
		for (let i = 0; i < 20; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 110.5263, // Upper wick = 0.5263
				low: 99.4737, // Lower wick = 0.5263
				close: 110, // Body = 10
				volume: 1000000,
			});
		}

		// 21st bar with high upper wick (40% upper, 5% lower, 55% body)
		// This should produce a higher absorption ratio
		bars.push({
			timestamp: baseTime + 20 * 86400000,
			open: 100,
			high: 118.18, // 18.18 total range, 4 point upper wick (40%)
			low: 100,
			close: 110, // 10 point body (55%), no lower wick adjusted
			volume: 1000000,
		});

		const result = calculateLiquidityAbsorptionRatio(bars);

		expect(result).not.toBeNull();
		expect(result!.timestamp).toBe(baseTime + 20 * 86400000);
		expect(result!.trendOpposingWickDirection).toBe("upper");

		// The raw absorption ratio should be higher than the previous bars
		// Previous bars: upper wick / body ≈ 0.5263 / 10 ≈ 0.053
		// Current bar: upper wick / body ≈ 8.18 / 10 ≈ 0.818
		expect(result!.rawAbsorptionRatio).toBeGreaterThan(0.3);

		// Z-score should be positive (higher than mean)
		expect(result!.value).toBeGreaterThan(0);
	});
});

// ============================================================
// Series Calculation Tests
// ============================================================

describe("calculateLiquidityAbsorptionRatioSeries", () => {
	test("returns array of same length as input", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);

		expect(series).toHaveLength(50);
	});

	test("returns null for early bars with insufficient history", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);

		// First 20 bars should be null (need 21 bars minimum)
		for (let i = 0; i < 20; i++) {
			expect(series[i]).toBeNull();
		}

		// 21st bar should have a result
		expect(series[20]).not.toBeNull();
	});

	test("produces consistent results with single calculation", () => {
		const bars = generateBars(50);
		const series = calculateLiquidityAbsorptionRatioSeries(bars);
		const singleResult = calculateLiquidityAbsorptionRatio(bars);

		// Last result in series should match single calculation
		const lastSeriesResult = series[series.length - 1];

		expect(lastSeriesResult).not.toBeNull();
		expect(singleResult).not.toBeNull();
		expect(lastSeriesResult!.value).toBe(singleResult!.value);
		expect(lastSeriesResult!.rawAbsorptionRatio).toBe(singleResult!.rawAbsorptionRatio);
	});
});

// ============================================================
// Classification Tests
// ============================================================

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

// ============================================================
// Trend Exhaustion Detection Tests
// ============================================================

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

		// Negative Z-score means lower-than-average absorption, not exhaustion
		expect(detectTrendExhaustion(result)).toBe(false);
	});
});

// ============================================================
// Configuration Tests
// ============================================================

describe("configuration options", () => {
	test("respects custom normalization period", () => {
		const bars = generateBars(15);

		// Default period (20) should return null
		const defaultResult = calculateLiquidityAbsorptionRatio(bars);
		expect(defaultResult).toBeNull();

		// Custom period (10) should return result
		const customResult = calculateLiquidityAbsorptionRatio(bars, { normalizationPeriod: 10 });
		expect(customResult).not.toBeNull();
	});

	test("handles custom minRangeFraction", () => {
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 25 * 86400000;

		// Create bars with small but non-zero range
		for (let i = 0; i < 25; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100.0,
				high: 100.01, // 0.01% range
				low: 99.99,
				close: 100.005,
				volume: 1000000,
			});
		}

		// With default minRangeFraction (0.0001), this should work
		const result = calculateLiquidityAbsorptionRatio(bars);
		expect(result).not.toBeNull();

		// With higher minRangeFraction, it should return null
		const strictResult = calculateLiquidityAbsorptionRatio(bars, { minRangeFraction: 0.01 });
		expect(strictResult).toBeNull();
	});
});
