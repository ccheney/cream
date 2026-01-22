/**
 * EMA (Exponential Moving Average) Calculator
 *
 * EMA gives more weight to recent prices, making it more responsive
 * to new information than SMA.
 *
 * Formula:
 * EMA = Price × Multiplier + EMA_prev × (1 - Multiplier)
 * Multiplier = 2 / (Period + 1)
 *
 * Common periods:
 * - 9-day: Short-term trend
 * - 12-day: MACD fast line
 * - 21-day: Short-term trading
 * - 26-day: MACD slow line
 * - 50-day: Medium-term trend
 * - 200-day: Long-term trend
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface EMAResult {
	/** EMA value */
	ema: number;
	/** Period used */
	period: number;
	/** Timestamp */
	timestamp: number;
}

export interface MultiEMAResult {
	/** EMA values by period */
	emas: Map<number, number>;
	/** Timestamp */
	timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate EMA multiplier (smoothing factor)
 */
export function calculateEMAMultiplier(period: number): number {
	return 2 / (period + 1);
}

/**
 * Calculate EMA for a series of bars
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - EMA period
 * @returns Latest EMA value or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 10+ bars
 * const result = calculateEMA(bars, 9);
 * // result.ema = 152.45
 * ```
 */
export function calculateEMA(bars: OHLCVBar[], period: number): EMAResult | null {
	if (bars.length < period || period <= 0) {
		return null;
	}

	const multiplier = calculateEMAMultiplier(period);

	// Initialize with SMA of first 'period' bars
	let sum = 0;
	for (let i = 0; i < period; i++) {
		const bar = bars[i];
		if (!bar) {
			return null;
		}
		sum += bar.close;
	}
	let ema = sum / period;

	// Calculate EMA for remaining bars
	for (let i = period; i < bars.length; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		ema = bar.close * multiplier + ema * (1 - multiplier);
	}

	const lastBar = bars[bars.length - 1];

	return {
		ema,
		period,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate EMA series for each bar
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - EMA period
 * @returns Array of EMA results
 */
export function calculateEMASeries(bars: OHLCVBar[], period: number): EMAResult[] {
	const results: EMAResult[] = [];

	if (bars.length < period || period <= 0) {
		return results;
	}

	const multiplier = calculateEMAMultiplier(period);

	// Initialize with SMA
	let sum = 0;
	for (let i = 0; i < period; i++) {
		const bar = bars[i];
		if (!bar) {
			return results;
		}
		sum += bar.close;
	}
	let ema = sum / period;

	// First EMA point
	const firstBar = bars[period - 1];
	if (firstBar) {
		results.push({
			ema,
			period,
			timestamp: firstBar.timestamp,
		});
	}

	// Calculate EMA for remaining bars
	for (let i = period; i < bars.length; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}

		ema = bar.close * multiplier + ema * (1 - multiplier);

		results.push({
			ema,
			period,
			timestamp: bar.timestamp,
		});
	}

	return results;
}

/**
 * Calculate multiple EMAs at once (more efficient)
 *
 * @param bars - OHLCV bars (oldest first)
 * @param periods - Array of EMA periods
 * @returns Map of period to EMA value
 *
 * @example
 * ```typescript
 * const bars = [...]; // 200+ bars
 * const result = calculateMultipleEMAs(bars, [9, 12, 21, 26, 50, 200]);
 * // result.emas.get(9) = 152.45
 * // result.emas.get(200) = 148.20
 * ```
 */
export function calculateMultipleEMAs(bars: OHLCVBar[], periods: number[]): MultiEMAResult | null {
	if (bars.length === 0 || periods.length === 0) {
		return null;
	}

	const maxPeriod = Math.max(...periods);
	if (bars.length < maxPeriod) {
		return null;
	}

	const emas = new Map<number, number>();

	for (const period of periods) {
		const result = calculateEMA(bars, period);
		if (result) {
			emas.set(period, result.ema);
		}
	}

	if (emas.size === 0) {
		return null;
	}

	const lastBar = bars[bars.length - 1];

	return {
		emas,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate EMA crossover signals
 *
 * @param bars - OHLCV bars (oldest first)
 * @param fastPeriod - Fast EMA period
 * @param slowPeriod - Slow EMA period
 * @returns Crossover signal or null
 */
export function detectEMACrossover(
	bars: OHLCVBar[],
	fastPeriod: number,
	slowPeriod: number,
): "bullish_crossover" | "bearish_crossover" | "no_crossover" | null {
	if (bars.length < slowPeriod + 2) {
		return null;
	}

	// Calculate EMAs for last two bars
	const currentBars = bars;
	const previousBars = bars.slice(0, -1);

	const currentFast = calculateEMA(currentBars, fastPeriod);
	const currentSlow = calculateEMA(currentBars, slowPeriod);
	const previousFast = calculateEMA(previousBars, fastPeriod);
	const previousSlow = calculateEMA(previousBars, slowPeriod);

	if (!currentFast || !currentSlow || !previousFast || !previousSlow) {
		return null;
	}

	const currentDiff = currentFast.ema - currentSlow.ema;
	const previousDiff = previousFast.ema - previousSlow.ema;

	// Bullish crossover: fast crosses above slow
	if (previousDiff <= 0 && currentDiff > 0) {
		return "bullish_crossover";
	}

	// Bearish crossover: fast crosses below slow
	if (previousDiff >= 0 && currentDiff < 0) {
		return "bearish_crossover";
	}

	return "no_crossover";
}

/**
 * Calculate price position relative to EMA
 *
 * @param price - Current price
 * @param ema - EMA value
 * @returns Percentage above/below EMA
 */
export function calculatePriceToEMA(price: number, ema: number): number | null {
	if (ema <= 0) {
		return null;
	}
	return ((price - ema) / ema) * 100;
}
