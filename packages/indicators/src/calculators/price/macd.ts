/**
 * MACD (Moving Average Convergence Divergence) Calculator
 *
 * MACD is a trend-following momentum indicator that shows the relationship
 * between two EMAs of a security's price.
 *
 * Theoretical Foundation:
 * - Appel (1970s): Created MACD for timing buy/sell decisions
 *
 * Components:
 * - MACD Line: 12-period EMA - 26-period EMA
 * - Signal Line: 9-period EMA of MACD Line
 * - Histogram: MACD Line - Signal Line
 *
 * Signals:
 * - MACD crosses above signal: Bullish
 * - MACD crosses below signal: Bearish
 * - Histogram positive/negative: Momentum direction
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";
import { calculateEMAMultiplier } from "./ema";

// ============================================================
// TYPES
// ============================================================

export interface MACDResult {
	/** MACD line (fast EMA - slow EMA) */
	macdLine: number;
	/** Signal line (EMA of MACD line) */
	signalLine: number;
	/** Histogram (MACD line - Signal line) */
	histogram: number;
	/** Fast EMA value */
	fastEMA: number;
	/** Slow EMA value */
	slowEMA: number;
	/** Timestamp */
	timestamp: number;
}

export interface MACDSettings {
	fastPeriod: number;
	slowPeriod: number;
	signalPeriod: number;
}

// ============================================================
// CALCULATORS
// ============================================================

const DEFAULT_SETTINGS: MACDSettings = {
	fastPeriod: 12,
	slowPeriod: 26,
	signalPeriod: 9,
};

/**
 * Calculate MACD
 *
 * @param bars - OHLCV bars (oldest first)
 * @param settings - MACD settings (default: 12, 26, 9)
 * @returns MACD result or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 35+ bars
 * const result = calculateMACD(bars);
 * // result.macdLine = 1.25
 * // result.signalLine = 0.95
 * // result.histogram = 0.30
 * ```
 */
export function calculateMACD(
	bars: OHLCVBar[],
	settings: MACDSettings = DEFAULT_SETTINGS
): MACDResult | null {
	const { fastPeriod, slowPeriod, signalPeriod } = settings;

	// Need enough bars for slow EMA + signal period
	const minBars = slowPeriod + signalPeriod;
	if (bars.length < minBars) {
		return null;
	}

	const fastMultiplier = calculateEMAMultiplier(fastPeriod);
	const slowMultiplier = calculateEMAMultiplier(slowPeriod);
	const signalMultiplier = calculateEMAMultiplier(signalPeriod);

	// Initialize fast EMA
	let fastSum = 0;
	for (let i = 0; i < fastPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return null;
		}
		fastSum += bar.close;
	}
	let fastEMA = fastSum / fastPeriod;

	// Initialize slow EMA
	let slowSum = 0;
	for (let i = 0; i < slowPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return null;
		}
		slowSum += bar.close;
	}
	let slowEMA = slowSum / slowPeriod;

	// Calculate EMAs up to the point where we can start MACD line
	for (let i = fastPeriod; i < slowPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return null;
		}
		fastEMA = bar.close * fastMultiplier + fastEMA * (1 - fastMultiplier);
	}

	// Calculate MACD line values and signal line
	const macdValues: number[] = [];

	for (let i = slowPeriod; i < bars.length; i++) {
		const bar = bars[i];
		if (!bar) {
			return null;
		}

		fastEMA = bar.close * fastMultiplier + fastEMA * (1 - fastMultiplier);
		slowEMA = bar.close * slowMultiplier + slowEMA * (1 - slowMultiplier);

		macdValues.push(fastEMA - slowEMA);
	}

	if (macdValues.length < signalPeriod) {
		return null;
	}

	// Initialize signal line EMA
	let signalSum = 0;
	for (let i = 0; i < signalPeriod; i++) {
		const val = macdValues[i];
		if (val === undefined) {
			return null;
		}
		signalSum += val;
	}
	let signalLine = signalSum / signalPeriod;

	// Calculate signal line for remaining values
	for (let i = signalPeriod; i < macdValues.length; i++) {
		const macdVal = macdValues[i];
		if (macdVal === undefined) {
			return null;
		}
		signalLine = macdVal * signalMultiplier + signalLine * (1 - signalMultiplier);
	}

	const macdLine = macdValues[macdValues.length - 1];
	if (macdLine === undefined) {
		return null;
	}

	const histogram = macdLine - signalLine;
	const lastBar = bars[bars.length - 1];

	return {
		macdLine,
		signalLine,
		histogram,
		fastEMA,
		slowEMA,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate MACD series for each bar
 *
 * @param bars - OHLCV bars (oldest first)
 * @param settings - MACD settings
 * @returns Array of MACD results
 */
export function calculateMACDSeries(
	bars: OHLCVBar[],
	settings: MACDSettings = DEFAULT_SETTINGS
): MACDResult[] {
	const { fastPeriod, slowPeriod, signalPeriod } = settings;
	const results: MACDResult[] = [];

	const minBars = slowPeriod + signalPeriod;
	if (bars.length < minBars) {
		return results;
	}

	const fastMultiplier = calculateEMAMultiplier(fastPeriod);
	const slowMultiplier = calculateEMAMultiplier(slowPeriod);
	const signalMultiplier = calculateEMAMultiplier(signalPeriod);

	// Initialize fast EMA
	let fastSum = 0;
	for (let i = 0; i < fastPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return results;
		}
		fastSum += bar.close;
	}
	let fastEMA = fastSum / fastPeriod;

	// Initialize slow EMA
	let slowSum = 0;
	for (let i = 0; i < slowPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return results;
		}
		slowSum += bar.close;
	}
	let slowEMA = slowSum / slowPeriod;

	// Calculate EMAs up to slow period
	for (let i = fastPeriod; i < slowPeriod; i++) {
		const bar = bars[i];
		if (!bar) {
			return results;
		}
		fastEMA = bar.close * fastMultiplier + fastEMA * (1 - fastMultiplier);
	}

	// Collect MACD values
	const macdValues: number[] = [];

	for (let i = slowPeriod; i < bars.length; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}

		fastEMA = bar.close * fastMultiplier + fastEMA * (1 - fastMultiplier);
		slowEMA = bar.close * slowMultiplier + slowEMA * (1 - slowMultiplier);

		macdValues.push(fastEMA - slowEMA);
	}

	if (macdValues.length < signalPeriod) {
		return results;
	}

	// Initialize signal line
	let signalSum = 0;
	for (let i = 0; i < signalPeriod; i++) {
		const val = macdValues[i];
		if (val === undefined) {
			return results;
		}
		signalSum += val;
	}
	let signalLine = signalSum / signalPeriod;

	// First result
	const firstMacd = macdValues[signalPeriod - 1];
	const firstBar = bars[slowPeriod + signalPeriod - 1];
	if (firstMacd !== undefined && firstBar) {
		results.push({
			macdLine: firstMacd,
			signalLine,
			histogram: firstMacd - signalLine,
			fastEMA: 0, // Not tracked for series
			slowEMA: 0,
			timestamp: firstBar.timestamp,
		});
	}

	// Calculate remaining values
	for (let i = signalPeriod; i < macdValues.length; i++) {
		const macdVal = macdValues[i];
		if (macdVal === undefined) {
			continue;
		}

		signalLine = macdVal * signalMultiplier + signalLine * (1 - signalMultiplier);

		const barIndex = slowPeriod + i;
		const bar = bars[barIndex];
		if (bar) {
			results.push({
				macdLine: macdVal,
				signalLine,
				histogram: macdVal - signalLine,
				fastEMA: 0,
				slowEMA: 0,
				timestamp: bar.timestamp,
			});
		}
	}

	return results;
}

/**
 * Detect MACD crossover
 *
 * @param current - Current MACD result
 * @param previous - Previous MACD result
 * @returns Crossover type
 */
export function detectMACDCrossover(
	current: MACDResult,
	previous: MACDResult
): "bullish" | "bearish" | "none" {
	const currentDiff = current.macdLine - current.signalLine;
	const previousDiff = previous.macdLine - previous.signalLine;

	if (previousDiff <= 0 && currentDiff > 0) {
		return "bullish";
	}
	if (previousDiff >= 0 && currentDiff < 0) {
		return "bearish";
	}

	return "none";
}

/**
 * Detect MACD zero-line crossover
 */
export function detectZeroLineCrossover(
	current: MACDResult,
	previous: MACDResult
): "bullish" | "bearish" | "none" {
	if (previous.macdLine <= 0 && current.macdLine > 0) {
		return "bullish";
	}
	if (previous.macdLine >= 0 && current.macdLine < 0) {
		return "bearish";
	}
	return "none";
}

/**
 * Classify MACD histogram momentum
 */
export type MACDMomentum =
	| "strong_bullish"
	| "bullish"
	| "weakening_bullish"
	| "neutral"
	| "weakening_bearish"
	| "bearish"
	| "strong_bearish";

/**
 * Classify MACD momentum based on histogram
 */
export function classifyMACDMomentum(
	current: MACDResult,
	previous: MACDResult | null = null
): MACDMomentum {
	const histogram = current.histogram;

	if (histogram > 0) {
		if (!previous) {
			return histogram > 0.5 ? "strong_bullish" : "bullish";
		}
		if (histogram > previous.histogram) {
			return histogram > 0.5 ? "strong_bullish" : "bullish";
		}
		return "weakening_bullish";
	}

	if (histogram < 0) {
		if (!previous) {
			return histogram < -0.5 ? "strong_bearish" : "bearish";
		}
		if (histogram < previous.histogram) {
			return histogram < -0.5 ? "strong_bearish" : "bearish";
		}
		return "weakening_bearish";
	}

	return "neutral";
}
