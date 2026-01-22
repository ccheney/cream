/**
 * Bollinger Bands Calculator
 *
 * Bollinger Bands consist of a middle band (SMA) with upper and lower bands
 * at N standard deviations. They measure volatility and relative price levels.
 *
 * Theoretical Foundation:
 * - Bollinger (1983): "Using Bollinger Bands"
 *
 * Formula:
 * - Middle Band = SMA(period)
 * - Upper Band = Middle + (stdDev × multiplier)
 * - Lower Band = Middle - (stdDev × multiplier)
 *
 * Common settings: 20-period SMA, 2 standard deviations
 *
 * Key metrics:
 * - Bandwidth: (Upper - Lower) / Middle × 100
 * - %B: (Price - Lower) / (Upper - Lower)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface BollingerBandsResult {
	/** Upper band */
	upper: number;
	/** Middle band (SMA) */
	middle: number;
	/** Lower band */
	lower: number;
	/** Bandwidth: (upper - lower) / middle × 100 */
	bandwidth: number;
	/** %B: position within bands (0 = lower, 1 = upper) */
	percentB: number;
	/** Standard deviation */
	stdDev: number;
	/** Timestamp */
	timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
	if (values.length === 0) {
		return 0;
	}

	const sumSquaredDiff = values.reduce((sum, val) => sum + (val - mean) ** 2, 0);
	return Math.sqrt(sumSquaredDiff / values.length);
}

/**
 * Calculate Bollinger Bands
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - SMA period (default: 20)
 * @param multiplier - Standard deviation multiplier (default: 2)
 * @returns Bollinger Bands result or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 20+ bars
 * const result = calculateBollingerBands(bars, 20, 2);
 * // result.upper = 155.50
 * // result.middle = 150.00
 * // result.lower = 144.50
 * // result.percentB = 0.75 (price near upper band)
 * ```
 */
export function calculateBollingerBands(
	bars: OHLCVBar[],
	period = 20,
	multiplier = 2,
): BollingerBandsResult | null {
	if (bars.length < period || period <= 0) {
		return null;
	}

	// Get closing prices for the period
	const recentBars = bars.slice(-period);
	const closes = recentBars.map((b) => b.close);

	// Calculate SMA (middle band)
	const sum = closes.reduce((acc, val) => acc + val, 0);
	const middle = sum / period;

	// Calculate standard deviation
	const stdDev = calculateStdDev(closes, middle);

	// Calculate bands
	const upper = middle + stdDev * multiplier;
	const lower = middle - stdDev * multiplier;

	// Calculate bandwidth
	const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;

	// Calculate %B
	const lastBar = bars[bars.length - 1];
	if (!lastBar) {
		return null;
	}

	const currentPrice = lastBar.close;
	const bandRange = upper - lower;
	const percentB = bandRange > 0 ? (currentPrice - lower) / bandRange : 0.5;

	return {
		upper,
		middle,
		lower,
		bandwidth,
		percentB,
		stdDev,
		timestamp: lastBar.timestamp,
	};
}

/**
 * Calculate Bollinger Bands series for each bar
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - SMA period
 * @param multiplier - Standard deviation multiplier
 * @returns Array of Bollinger Bands results
 */
export function calculateBollingerBandsSeries(
	bars: OHLCVBar[],
	period = 20,
	multiplier = 2,
): BollingerBandsResult[] {
	const results: BollingerBandsResult[] = [];

	if (bars.length < period || period <= 0) {
		return results;
	}

	for (let i = period - 1; i < bars.length; i++) {
		const windowBars = bars.slice(i - period + 1, i + 1);
		const result = calculateBollingerBands(windowBars, period, multiplier);
		if (result) {
			results.push(result);
		}
	}

	return results;
}

/**
 * Classify Bollinger Band position
 */
export type BollingerPosition =
	| "above_upper"
	| "at_upper"
	| "upper_half"
	| "at_middle"
	| "lower_half"
	| "at_lower"
	| "below_lower";

/**
 * Classify price position relative to Bollinger Bands
 *
 * @param percentB - %B value
 * @returns Position classification
 */
export function classifyBollingerPosition(percentB: number): BollingerPosition {
	if (percentB > 1.0) {
		return "above_upper";
	}
	if (percentB >= 0.95) {
		return "at_upper";
	}
	if (percentB > 0.55) {
		return "upper_half";
	}
	if (percentB >= 0.45) {
		return "at_middle";
	}
	if (percentB > 0.05) {
		return "lower_half";
	}
	if (percentB >= 0.0) {
		return "at_lower";
	}
	return "below_lower";
}

/**
 * Classify Bollinger Bandwidth (volatility)
 */
export type BandwidthLevel = "squeeze" | "low" | "normal" | "high" | "extreme";

/**
 * Classify Bollinger Bandwidth level
 *
 * Thresholds are percentage-based:
 * - Squeeze: < 5% (low volatility, potential breakout)
 * - Normal: 5-15%
 * - High: 15-25%
 * - Extreme: > 25%
 *
 * @param bandwidth - Bandwidth percentage
 * @returns Classification
 */
export function classifyBandwidth(bandwidth: number): BandwidthLevel {
	if (bandwidth < 5) {
		return "squeeze";
	}
	if (bandwidth < 10) {
		return "low";
	}
	if (bandwidth < 15) {
		return "normal";
	}
	if (bandwidth < 25) {
		return "high";
	}
	return "extreme";
}

/**
 * Detect Bollinger Band squeeze (low volatility precedes breakout)
 *
 * @param bandwidthHistory - Recent bandwidth values
 * @param threshold - Percentile threshold for squeeze (default: 10th percentile)
 * @returns Whether current bandwidth indicates a squeeze
 */
export function detectBollingerSqueeze(bandwidthHistory: number[], threshold = 10): boolean {
	if (bandwidthHistory.length < 20) {
		return false;
	}

	const sorted = bandwidthHistory.toSorted((a, b) => a - b);
	const percentileIndex = Math.floor((threshold / 100) * sorted.length);
	const percentileValue = sorted[percentileIndex] ?? sorted[0];

	const currentBandwidth = bandwidthHistory[bandwidthHistory.length - 1];
	if (currentBandwidth === undefined || percentileValue === undefined) {
		return false;
	}

	return currentBandwidth <= percentileValue;
}

/**
 * Calculate Bollinger Band walking (trend confirmation)
 *
 * Walking the upper band = strong uptrend
 * Walking the lower band = strong downtrend
 *
 * @param recentPercentB - Recent %B values
 * @param walkThreshold - Threshold for "walking" (default: 0.8 for upper, 0.2 for lower)
 * @returns Walking direction or null
 */
export function detectBandWalking(
	recentPercentB: number[],
	walkThreshold = 0.8,
): "upper" | "lower" | null {
	if (recentPercentB.length < 3) {
		return null;
	}

	const upperWalk = recentPercentB.every((pb) => pb >= walkThreshold);
	const lowerWalk = recentPercentB.every((pb) => pb <= 1 - walkThreshold);

	if (upperWalk) {
		return "upper";
	}
	if (lowerWalk) {
		return "lower";
	}
	return null;
}
