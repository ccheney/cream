/**
 * Average True Range (ATR) Calculator
 *
 * ATR measures market volatility by decomposing the entire range of an asset
 * price for that period. True Range is the greatest of:
 * - Current High - Current Low
 * - |Current High - Previous Close|
 * - |Current Low - Previous Close|
 *
 * ATR is the moving average of the True Range.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

export interface ATRResult {
	value: number | null;
	timestamp: number;
}

function calculateInitialAverage(values: number[], period: number): number | null {
	if (values.length < period) {
		return null;
	}

	return values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
}

function collectTrueRanges(bars: OHLCVBar[]): number[] {
	const trueRanges: number[] = [];

	for (let i = 1; i < bars.length; i++) {
		const current = bars[i];
		const previous = bars[i - 1];
		if (current && previous) {
			trueRanges.push(calculateTrueRange(current, previous));
		}
	}

	return trueRanges;
}

function applyWilderSmoothing(previousATR: number, trueRange: number, period: number): number {
	const multiplier = 1 / period;
	return (trueRange - previousATR) * multiplier + previousATR;
}

/**
 * Calculate True Range for a single bar
 *
 * @param current - Current bar
 * @param previous - Previous bar (for close reference)
 * @returns True Range value
 */
export function calculateTrueRange(current: OHLCVBar, previous: OHLCVBar): number {
	const highLow = current.high - current.low;
	const highPrevClose = Math.abs(current.high - previous.close);
	const lowPrevClose = Math.abs(current.low - previous.close);

	return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate Average True Range for a series of bars
 *
 * Uses Wilder's smoothing method (exponential moving average).
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period (default: 14)
 * @returns ATR value for the most recent bar, or null if insufficient data
 */
export function calculateATR(bars: OHLCVBar[], period = 14): number | null {
	if (bars.length < period + 1) {
		return null;
	}

	const trueRanges = collectTrueRanges(bars);
	const initialATR = calculateInitialAverage(trueRanges, period);
	if (initialATR === null) {
		return null;
	}

	let atr = initialATR;

	for (let i = period; i < trueRanges.length; i++) {
		const tr = trueRanges[i];
		if (tr !== undefined) {
			atr = applyWilderSmoothing(atr, tr, period);
		}
	}

	return atr;
}

/**
 * Calculate ATR for each bar in a series (returns array)
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period (default: 14)
 * @returns Array of ATR values (null for bars with insufficient history)
 */
export function calculateATRSeries(bars: OHLCVBar[], period = 14): ATRResult[] {
	if (bars.length < 2) {
		return bars.map((bar) => ({ value: null, timestamp: bar.timestamp }));
	}

	const firstBar = bars[0];
	if (!firstBar) {
		return [];
	}

	const results: ATRResult[] = [{ value: null, timestamp: firstBar.timestamp }];
	const trueRanges = collectTrueRanges(bars);
	let atr: number | null = null;
	let rollingSum = 0;

	for (const [index, tr] of trueRanges.entries()) {
		const nextBar = bars[index + 1];
		if (!nextBar) {
			continue;
		}

		rollingSum += tr;

		if (index < period - 1) {
			results.push({ value: null, timestamp: nextBar.timestamp });
			continue;
		}

		if (index === period - 1) {
			atr = rollingSum / period;
			results.push({ value: atr, timestamp: nextBar.timestamp });
			continue;
		}

		if (atr !== null) {
			atr = applyWilderSmoothing(atr, tr, period);
		}

		results.push({ value: atr, timestamp: nextBar.timestamp });
	}

	return results;
}
