/**
 * Stochastic Oscillator Calculator
 *
 * The Stochastic Oscillator is a momentum indicator comparing a security's
 * closing price to its price range over a given period.
 *
 * Theoretical Foundation:
 * - Lane (1950s): Created to track momentum and price reversals
 *
 * Formula:
 * %K = (Close - Lowest Low) / (Highest High - Lowest Low) × 100
 * %D = SMA of %K (typically 3-period)
 *
 * Types:
 * - Fast Stochastic: Raw %K and %D
 * - Slow Stochastic: Smoothed %K (= Fast %D) and smoothed %D
 *
 * Interpretation:
 * - %K > 80: Overbought
 * - %K < 20: Oversold
 * - %K crosses above %D: Bullish signal
 * - %K crosses below %D: Bearish signal
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface StochasticResult {
	/** Fast %K (raw stochastic) */
	k: number;
	/** %D (SMA of %K) */
	d: number;
	/** Timestamp */
	timestamp: number;
}

export interface SlowStochasticResult extends StochasticResult {
	/** Slow %K (smoothed, equals Fast %D) */
	slowK: number;
	/** Slow %D (SMA of Slow %K) */
	slowD: number;
}

export interface StochasticSettings {
	/** %K period (default: 14) */
	kPeriod: number;
	/** %D period - SMA of %K (default: 3) */
	dPeriod: number;
	/** Slow %K smoothing period (default: 3) */
	slowKPeriod: number;
}

// ============================================================
// CALCULATORS
// ============================================================

const DEFAULT_SETTINGS: StochasticSettings = {
	kPeriod: 14,
	dPeriod: 3,
	slowKPeriod: 3,
};

/**
 * Calculate raw %K for a single window
 */
function calculateRawK(bars: OHLCVBar[]): number | null {
	if (bars.length === 0) {
		return null;
	}

	let lowestLow = Infinity;
	let highestHigh = -Infinity;

	for (const bar of bars) {
		if (bar.low < lowestLow) {
			lowestLow = bar.low;
		}
		if (bar.high > highestHigh) {
			highestHigh = bar.high;
		}
	}

	const range = highestHigh - lowestLow;
	if (range <= 0) {
		return 50; // No price movement
	}

	const lastBar = bars[bars.length - 1];
	if (!lastBar) {
		return null;
	}

	return ((lastBar.close - lowestLow) / range) * 100;
}

/**
 * Calculate Fast Stochastic
 *
 * @param bars - OHLCV bars (oldest first)
 * @param settings - Stochastic settings
 * @returns Stochastic result or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 17+ bars
 * const result = calculateStochastic(bars);
 * // result.k = 75.5 (%K)
 * // result.d = 68.2 (%D)
 * ```
 */
export function calculateStochastic(
	bars: OHLCVBar[],
	settings: Partial<StochasticSettings> = {}
): StochasticResult | null {
	const { kPeriod, dPeriod } = { ...DEFAULT_SETTINGS, ...settings };

	const minBars = kPeriod + dPeriod - 1;
	if (bars.length < minBars) {
		return null;
	}

	// Calculate %K values for %D calculation
	const kValues: number[] = [];

	for (let i = kPeriod - 1; i < bars.length; i++) {
		const windowBars = bars.slice(i - kPeriod + 1, i + 1);
		const rawK = calculateRawK(windowBars);
		if (rawK !== null) {
			kValues.push(rawK);
		}
	}

	if (kValues.length < dPeriod) {
		return null;
	}

	// Current %K
	const k = kValues[kValues.length - 1];
	if (k === undefined) {
		return null;
	}

	// Calculate %D (SMA of last dPeriod %K values)
	const recentKValues = kValues.slice(-dPeriod);
	const d = recentKValues.reduce((sum, val) => sum + val, 0) / dPeriod;

	const lastBar = bars[bars.length - 1];

	return {
		k,
		d,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate Slow Stochastic
 *
 * Slow Stochastic applies additional smoothing:
 * - Slow %K = Fast %D (3-period SMA of Fast %K)
 * - Slow %D = 3-period SMA of Slow %K
 *
 * @param bars - OHLCV bars (oldest first)
 * @param settings - Stochastic settings
 * @returns Slow Stochastic result or null
 */
export function calculateSlowStochastic(
	bars: OHLCVBar[],
	settings: Partial<StochasticSettings> = {}
): SlowStochasticResult | null {
	const { kPeriod, dPeriod, slowKPeriod } = { ...DEFAULT_SETTINGS, ...settings };

	const minBars = kPeriod + dPeriod + slowKPeriod - 2;
	if (bars.length < minBars) {
		return null;
	}

	// Calculate all %K values
	const kValues: number[] = [];
	for (let i = kPeriod - 1; i < bars.length; i++) {
		const windowBars = bars.slice(i - kPeriod + 1, i + 1);
		const rawK = calculateRawK(windowBars);
		if (rawK !== null) {
			kValues.push(rawK);
		}
	}

	if (kValues.length < dPeriod + slowKPeriod - 1) {
		return null;
	}

	// Calculate Fast %D (Slow %K) values
	const slowKValues: number[] = [];
	for (let i = dPeriod - 1; i < kValues.length; i++) {
		const window = kValues.slice(i - dPeriod + 1, i + 1);
		const avg = window.reduce((sum, val) => sum + val, 0) / dPeriod;
		slowKValues.push(avg);
	}

	if (slowKValues.length < slowKPeriod) {
		return null;
	}

	// Current Slow %K
	const slowK = slowKValues[slowKValues.length - 1];
	if (slowK === undefined) {
		return null;
	}

	// Calculate Slow %D
	const recentSlowK = slowKValues.slice(-slowKPeriod);
	const slowD = recentSlowK.reduce((sum, val) => sum + val, 0) / slowKPeriod;

	// Current Fast %K for reference
	const k = kValues[kValues.length - 1];
	if (k === undefined) {
		return null;
	}

	const lastBar = bars[bars.length - 1];

	return {
		k,
		d: slowK, // Fast %D
		slowK,
		slowD,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate Stochastic series
 */
export function calculateStochasticSeries(
	bars: OHLCVBar[],
	settings: Partial<StochasticSettings> = {}
): StochasticResult[] {
	const { kPeriod, dPeriod } = { ...DEFAULT_SETTINGS, ...settings };
	const results: StochasticResult[] = [];

	const minBars = kPeriod + dPeriod - 1;
	if (bars.length < minBars) {
		return results;
	}

	// Calculate all %K values
	const kValues: Array<{ k: number; timestamp: number }> = [];
	for (let i = kPeriod - 1; i < bars.length; i++) {
		const windowBars = bars.slice(i - kPeriod + 1, i + 1);
		const rawK = calculateRawK(windowBars);
		const bar = bars[i];
		if (rawK !== null && bar) {
			kValues.push({ k: rawK, timestamp: bar.timestamp });
		}
	}

	// Calculate %D for each point
	for (let i = dPeriod - 1; i < kValues.length; i++) {
		const window = kValues.slice(i - dPeriod + 1, i + 1);
		const d = window.reduce((sum, val) => sum + val.k, 0) / dPeriod;
		const current = kValues[i];
		if (current) {
			results.push({
				k: current.k,
				d,
				timestamp: current.timestamp,
			});
		}
	}

	return results;
}

/**
 * Classify Stochastic level
 */
export type StochasticLevel =
	| "extreme_overbought"
	| "overbought"
	| "neutral"
	| "oversold"
	| "extreme_oversold";

/**
 * Classify Stochastic reading
 */
export function classifyStochastic(k: number): StochasticLevel {
	if (k >= 90) {
		return "extreme_overbought";
	}
	if (k >= 80) {
		return "overbought";
	}
	if (k <= 10) {
		return "extreme_oversold";
	}
	if (k <= 20) {
		return "oversold";
	}
	return "neutral";
}

/**
 * Detect Stochastic crossover
 */
export function detectStochasticCrossover(
	current: StochasticResult,
	previous: StochasticResult
): "bullish" | "bearish" | "none" {
	const currentDiff = current.k - current.d;
	const previousDiff = previous.k - previous.d;

	if (previousDiff <= 0 && currentDiff > 0) {
		return "bullish";
	}
	if (previousDiff >= 0 && currentDiff < 0) {
		return "bearish";
	}

	return "none";
}

/**
 * Detect overbought/oversold crossover (hook pattern)
 *
 * Bullish hook: %K rises above 20 (exiting oversold)
 * Bearish hook: %K falls below 80 (exiting overbought)
 */
export function detectStochasticHook(
	current: StochasticResult,
	previous: StochasticResult
): "bullish_hook" | "bearish_hook" | "none" {
	// Bullish hook: crossing up through 20
	if (previous.k <= 20 && current.k > 20) {
		return "bullish_hook";
	}

	// Bearish hook: crossing down through 80
	if (previous.k >= 80 && current.k < 80) {
		return "bearish_hook";
	}

	return "none";
}
