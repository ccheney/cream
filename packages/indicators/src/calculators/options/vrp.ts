/**
 * Volatility Risk Premium (VRP) Calculator
 *
 * VRP measures the difference between implied volatility (forward-looking)
 * and realized volatility (backward-looking). Option sellers earn the VRP
 * as compensation for bearing volatility risk.
 *
 * Theoretical Foundation:
 * - Carr & Wu (2009): "Variance Risk Premiums" - Documents persistent VRP
 * - VRP is typically positive (IV > RV) reflecting risk aversion
 *
 * Formula:
 * VRP = Implied Volatility - Realized Volatility
 *
 * Interpretation:
 * - Positive VRP: Options are "expensive" (normal state)
 * - Negative VRP: Options are "cheap" (rare, often before big moves)
 * - High VRP: Good environment for selling options
 * - Low/Negative VRP: Avoid selling options
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface VRPResult {
	/** Volatility Risk Premium (IV - RV) */
	vrp: number;
	/** Implied volatility used */
	impliedVolatility: number;
	/** Realized volatility calculated */
	realizedVolatility: number;
	/** VRP as percentage of realized vol */
	vrpRatio: number | null;
	/** Period used for realized vol (days) */
	realizedVolPeriod: number;
	/** Annualization factor used */
	annualizationFactor: number;
	/** Timestamp */
	timestamp: number;
}

export interface VRPTermStructure {
	/** Underlying symbol */
	symbol: string;
	/** VRP at different horizons */
	horizons: Array<{
		days: number;
		impliedVol: number;
		realizedVol: number;
		vrp: number;
	}>;
	/** Average VRP across horizons */
	avgVRP: number;
	/** Timestamp */
	timestamp: number;
}

// ============================================================
// REALIZED VOLATILITY CALCULATION
// ============================================================

/**
 * Calculate close-to-close realized volatility
 *
 * Uses log returns and annualizes to match IV convention.
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period (default: 20 trading days)
 * @param annualizationFactor - Trading days per year (default: 252)
 * @returns Annualized realized volatility or null
 */
export function calculateRealizedVolatility(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252,
): number | null {
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

	// Calculate standard deviation of log returns
	const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
	const variance =
		logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
	const dailyVol = Math.sqrt(variance);

	// Annualize
	return dailyVol * Math.sqrt(annualizationFactor);
}

/**
 * Calculate Parkinson (high-low) realized volatility
 *
 * More efficient estimator using intraday range information.
 * Parkinson (1980): "The Extreme Value Method for Estimating the Variance of the Rate of Return"
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period
 * @param annualizationFactor - Trading days per year
 * @returns Annualized Parkinson volatility or null
 */
export function calculateParkinsonVolatility(
	bars: OHLCVBar[],
	period = 20,
	annualizationFactor = 252,
): number | null {
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
	const dailyVol = Math.sqrt(dailyVariance);

	return dailyVol * Math.sqrt(annualizationFactor);
}

// ============================================================
// VRP CALCULATORS
// ============================================================

/**
 * Calculate Volatility Risk Premium
 *
 * VRP = IV - RV
 *
 * @param impliedVolatility - Current implied volatility (annualized, decimal form e.g., 0.25 = 25%)
 * @param bars - OHLCV bars for realized vol calculation
 * @param realizedVolPeriod - Period for realized vol (default: 20 days to match ~1 month IV)
 * @param annualizationFactor - Trading days per year
 * @returns VRP result or null
 *
 * @example
 * ```typescript
 * const bars = [...]; // 21+ daily bars
 * const result = calculateVRP(0.30, bars, 20);
 * // result.vrp = 0.05 (5% premium, IV 30% vs RV 25%)
 * ```
 */
export function calculateVRP(
	impliedVolatility: number,
	bars: OHLCVBar[],
	realizedVolPeriod = 20,
	annualizationFactor = 252,
): VRPResult | null {
	if (impliedVolatility < 0) {
		return null;
	}

	const realizedVolatility = calculateRealizedVolatility(
		bars,
		realizedVolPeriod,
		annualizationFactor,
	);

	if (realizedVolatility === null) {
		return null;
	}

	const vrp = impliedVolatility - realizedVolatility;
	const vrpRatio = realizedVolatility > 0 ? vrp / realizedVolatility : null;

	return {
		vrp,
		impliedVolatility,
		realizedVolatility,
		vrpRatio,
		realizedVolPeriod,
		annualizationFactor,
		timestamp: Date.now(),
	};
}

/**
 * Calculate VRP using Parkinson volatility as realized vol estimate
 *
 * Parkinson vol is more efficient, useful when high/low data is reliable.
 */
export function calculateVRPWithParkinson(
	impliedVolatility: number,
	bars: OHLCVBar[],
	realizedVolPeriod = 20,
	annualizationFactor = 252,
): VRPResult | null {
	if (impliedVolatility < 0) {
		return null;
	}

	const realizedVolatility = calculateParkinsonVolatility(
		bars,
		realizedVolPeriod,
		annualizationFactor,
	);

	if (realizedVolatility === null) {
		return null;
	}

	const vrp = impliedVolatility - realizedVolatility;
	const vrpRatio = realizedVolatility > 0 ? vrp / realizedVolatility : null;

	return {
		vrp,
		impliedVolatility,
		realizedVolatility,
		vrpRatio,
		realizedVolPeriod,
		annualizationFactor,
		timestamp: Date.now(),
	};
}

/**
 * Calculate VRP term structure
 *
 * Compares IV at different expirations to corresponding realized vol periods.
 *
 * @param ivByDays - Map of days-to-expiry to implied volatility
 * @param bars - OHLCV bars for realized vol
 * @param symbol - Underlying symbol
 * @returns VRP term structure
 */
export function calculateVRPTermStructure(
	ivByDays: Map<number, number>,
	bars: OHLCVBar[],
	symbol: string,
): VRPTermStructure | null {
	if (ivByDays.size === 0) {
		return null;
	}

	const horizons: VRPTermStructure["horizons"] = [];

	for (const [days, impliedVol] of ivByDays) {
		// Use matching lookback period for RV
		const realizedVol = calculateRealizedVolatility(bars, days);
		if (realizedVol === null) {
			continue;
		}

		horizons.push({
			days,
			impliedVol,
			realizedVol,
			vrp: impliedVol - realizedVol,
		});
	}

	if (horizons.length === 0) {
		return null;
	}

	// Sort by days
	horizons.sort((a, b) => a.days - b.days);

	const avgVRP = horizons.reduce((sum, h) => sum + h.vrp, 0) / horizons.length;

	return {
		symbol,
		horizons,
		avgVRP,
		timestamp: Date.now(),
	};
}

/**
 * Classify VRP level
 */
export type VRPLevel = "very_rich" | "rich" | "fair" | "cheap" | "very_cheap";

/**
 * Classify VRP level for trading decisions
 *
 * @param vrp - VRP value (IV - RV)
 * @returns Classification
 */
export function classifyVRPLevel(vrp: number): VRPLevel {
	// Thresholds in absolute vol terms
	if (vrp > 0.1) {
		return "very_rich"; // >10% premium, great for selling
	}
	if (vrp > 0.03) {
		return "rich"; // 3-10% premium
	}
	if (vrp >= -0.02) {
		return "fair"; // -2% to 3%
	}
	if (vrp >= -0.05) {
		return "cheap"; // -5% to -2%
	}
	return "very_cheap"; // <-5%, avoid selling, consider buying
}

/**
 * Calculate VRP percentile vs historical values
 *
 * @param currentVRP - Current VRP
 * @param historicalVRPs - Array of historical VRP values
 * @returns Percentile (0-100)
 */
export function calculateVRPPercentile(
	currentVRP: number,
	historicalVRPs: number[],
): number | null {
	if (historicalVRPs.length === 0) {
		return null;
	}

	const belowCount = historicalVRPs.filter((v) => v < currentVRP).length;
	return (belowCount / historicalVRPs.length) * 100;
}
