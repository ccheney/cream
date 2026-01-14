/**
 * Volatility Calculators
 *
 * Various methods for calculating realized (historical) volatility.
 *
 * Methods:
 * - Close-to-Close: Standard deviation of log returns
 * - Parkinson: High-Low range-based (more efficient)
 * - Garman-Klass: Uses OHLC data for better efficiency
 * - Yang-Zhang: Combines overnight and intraday volatility
 *
 * All outputs are annualized using 252 trading days.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface VolatilityResult {
	/** Annualized volatility (decimal, e.g., 0.25 = 25%) */
	volatility: number;
	/** Method used */
	method: VolatilityMethod;
	/** Period used */
	period: number;
	/** Annualization factor */
	annualizationFactor: number;
	/** Timestamp */
	timestamp: number;
}

export type VolatilityMethod = "close_to_close" | "parkinson" | "garman_klass" | "yang_zhang";

export interface VolatilityComparison {
	/** Close-to-close volatility */
	closeToClose: number | null;
	/** Parkinson volatility */
	parkinson: number | null;
	/** Garman-Klass volatility */
	garmanKlass: number | null;
	/** Average of available methods */
	average: number | null;
	/** Timestamp */
	timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate close-to-close realized volatility
 *
 * Standard method using log returns.
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period (default: 20)
 * @param annualizationFactor - Trading days per year (default: 252)
 * @returns Volatility result or null
 */
export function calculateCloseToCloseVolatility(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252
): VolatilityResult | null {
	if (bars.length < period + 1) {
		return null;
	}

	const recentBars = bars.slice(-period - 1);
	const logReturns: number[] = [];

	for (let i = 1; i < recentBars.length; i++) {
		const current = recentBars[i];
		const previous = recentBars[i - 1];

		if (!current || !previous) {
			continue;
		}
		if (previous.close <= 0 || current.close <= 0) {
			continue;
		}

		const logReturn = Math.log(current.close / previous.close);
		logReturns.push(logReturn);
	}

	if (logReturns.length < 2) {
		return null;
	}

	// Calculate standard deviation
	const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
	const variance =
		logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
	const dailyVol = Math.sqrt(variance);

	const volatility = dailyVol * Math.sqrt(annualizationFactor);
	const lastBar = bars[bars.length - 1];

	return {
		volatility,
		method: "close_to_close",
		period,
		annualizationFactor,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate Parkinson volatility
 *
 * Uses high-low range, more efficient than close-to-close.
 * Parkinson (1980): "The Extreme Value Method"
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period
 * @param annualizationFactor - Trading days per year
 * @returns Volatility result or null
 */
export function calculateParkinsonVolatility(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252
): VolatilityResult | null {
	if (bars.length < period) {
		return null;
	}

	const recentBars = bars.slice(-period);
	const parkinsonConstant = 1 / (4 * Math.log(2)); // ≈ 0.361

	let sumSquaredLogRange = 0;
	let validBars = 0;

	for (const bar of recentBars) {
		if (bar.high <= 0 || bar.low <= 0 || bar.high < bar.low) {
			continue;
		}

		const logRange = Math.log(bar.high / bar.low);
		sumSquaredLogRange += logRange ** 2;
		validBars++;
	}

	if (validBars === 0) {
		return null;
	}

	const dailyVariance = parkinsonConstant * (sumSquaredLogRange / validBars);
	const volatility = Math.sqrt(dailyVariance) * Math.sqrt(annualizationFactor);

	const lastBar = bars[bars.length - 1];

	return {
		volatility,
		method: "parkinson",
		period,
		annualizationFactor,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate Garman-Klass volatility
 *
 * Uses OHLC data for better efficiency than Parkinson.
 * Garman & Klass (1980): "On the Estimation of Security Price Volatilities"
 *
 * @param bars - OHLCV bars
 * @param period - Lookback period
 * @param annualizationFactor - Trading days per year
 * @returns Volatility result or null
 */
export function calculateGarmanKlassVolatility(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252
): VolatilityResult | null {
	if (bars.length < period) {
		return null;
	}

	const recentBars = bars.slice(-period);
	let sumVariance = 0;
	let validBars = 0;

	for (const bar of recentBars) {
		if (bar.high <= 0 || bar.low <= 0 || bar.open <= 0 || bar.close <= 0) {
			continue;
		}
		if (bar.high < bar.low) {
			continue;
		}

		const logHL = Math.log(bar.high / bar.low);
		const logCO = Math.log(bar.close / bar.open);

		// Garman-Klass formula
		const variance = 0.5 * logHL ** 2 - (2 * Math.log(2) - 1) * logCO ** 2;
		sumVariance += variance;
		validBars++;
	}

	if (validBars === 0) {
		return null;
	}

	const avgDailyVariance = sumVariance / validBars;
	const volatility = Math.sqrt(Math.max(0, avgDailyVariance)) * Math.sqrt(annualizationFactor);

	const lastBar = bars[bars.length - 1];

	return {
		volatility,
		method: "garman_klass",
		period,
		annualizationFactor,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate volatility using all methods and compare
 */
export function calculateVolatilityComparison(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252
): VolatilityComparison {
	const c2c = calculateCloseToCloseVolatility(bars, period, annualizationFactor);
	const parkinson = calculateParkinsonVolatility(bars, period, annualizationFactor);
	const gk = calculateGarmanKlassVolatility(bars, period, annualizationFactor);

	const values = [c2c?.volatility, parkinson?.volatility, gk?.volatility].filter(
		(v): v is number => v !== null && v !== undefined
	);

	const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

	const lastBar = bars[bars.length - 1];

	return {
		closeToClose: c2c?.volatility ?? null,
		parkinson: parkinson?.volatility ?? null,
		garmanKlass: gk?.volatility ?? null,
		average,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate volatility series
 */
export function calculateVolatilitySeries(
	bars: OHLCVBar[],
	period = 20,
	method: VolatilityMethod = "close_to_close",
	annualizationFactor = 252
): VolatilityResult[] {
	const results: VolatilityResult[] = [];

	const calculator =
		method === "parkinson"
			? calculateParkinsonVolatility
			: method === "garman_klass"
				? calculateGarmanKlassVolatility
				: calculateCloseToCloseVolatility;

	const minBars = method === "close_to_close" ? period + 1 : period;

	for (let i = minBars; i <= bars.length; i++) {
		const windowBars = bars.slice(0, i);
		const result = calculator(windowBars, period, annualizationFactor);
		if (result) {
			results.push(result);
		}
	}

	return results;
}

/**
 * Classify volatility level
 */
export type VolatilityLevel = "very_low" | "low" | "normal" | "high" | "very_high" | "extreme";

/**
 * Classify volatility level
 *
 * Thresholds based on typical equity volatility:
 * - Very Low: < 10%
 * - Low: 10-15%
 * - Normal: 15-25%
 * - High: 25-40%
 * - Very High: 40-60%
 * - Extreme: > 60%
 */
export function classifyVolatility(volatility: number): VolatilityLevel {
	if (volatility < 0.1) {
		return "very_low";
	}
	if (volatility < 0.15) {
		return "low";
	}
	if (volatility < 0.25) {
		return "normal";
	}
	if (volatility < 0.4) {
		return "high";
	}
	if (volatility < 0.6) {
		return "very_high";
	}
	return "extreme";
}

/**
 * Calculate volatility percentile vs history
 */
export function calculateVolatilityPercentile(
	currentVol: number,
	historicalVols: number[]
): number | null {
	if (historicalVols.length === 0) {
		return null;
	}

	const belowCount = historicalVols.filter((v) => v < currentVol).length;
	return (belowCount / historicalVols.length) * 100;
}

/**
 * Detect volatility regime change
 */
export function detectVolatilityRegimeChange(
	recentVols: number[],
	threshold = 0.5
): "increasing" | "decreasing" | "stable" {
	if (recentVols.length < 3) {
		return "stable";
	}

	const recent = recentVols.slice(-3);
	const older = recentVols.slice(-6, -3);

	if (older.length === 0) {
		return "stable";
	}

	const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
	const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;

	const change = (recentAvg - olderAvg) / olderAvg;

	if (change > threshold) {
		return "increasing";
	}
	if (change < -threshold) {
		return "decreasing";
	}
	return "stable";
}
