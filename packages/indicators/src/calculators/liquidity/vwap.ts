/**
 * VWAP (Volume Weighted Average Price) Calculator
 *
 * VWAP is a trading benchmark that gives the average price a security
 * has traded at throughout the day, based on both volume and price.
 *
 * Theoretical Foundation:
 * - Standard institutional trading benchmark
 * - Used to assess execution quality (trades below VWAP = good buy, above = good sell)
 *
 * Formula:
 * VWAP = Σ(Typical Price × Volume) / Σ(Volume)
 * Typical Price = (High + Low + Close) / 3
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

export interface VWAPResult {
	/** Volume Weighted Average Price */
	vwap: number;
	/** Total volume used in calculation */
	totalVolume: number;
	/** Number of bars used */
	barsUsed: number;
	/** Timestamp of calculation */
	timestamp: number;
}

/**
 * Calculate typical price for a bar
 */
export function calculateTypicalPrice(bar: OHLCVBar): number {
	return (bar.high + bar.low + bar.close) / 3;
}

/**
 * Calculate VWAP for a series of bars
 *
 * @param bars - OHLCV bars (oldest first)
 * @returns VWAP result or null if no valid bars
 *
 * @example
 * ```typescript
 * const bars = [...]; // Intraday bars
 * const result = calculateVWAP(bars);
 * // result.vwap = 150.25
 * ```
 */
export function calculateVWAP(bars: OHLCVBar[]): VWAPResult | null {
	if (bars.length === 0) {
		return null;
	}

	let cumulativePV = 0; // Price × Volume
	let cumulativeVolume = 0;
	let validBars = 0;

	for (const bar of bars) {
		if (bar.volume <= 0) {
			continue;
		}

		const typicalPrice = calculateTypicalPrice(bar);
		cumulativePV += typicalPrice * bar.volume;
		cumulativeVolume += bar.volume;
		validBars++;
	}

	if (cumulativeVolume === 0 || validBars === 0) {
		return null;
	}

	const vwap = cumulativePV / cumulativeVolume;
	const latestBar = bars.at(-1);

	return {
		vwap,
		totalVolume: cumulativeVolume,
		barsUsed: validBars,
		timestamp: latestBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate VWAP deviation from current price
 *
 * Positive = price above VWAP (potentially overbought)
 * Negative = price below VWAP (potentially oversold)
 *
 * @param currentPrice - Current market price
 * @param vwap - VWAP value
 * @returns Deviation as percentage
 */
export function calculateVWAPDeviation(currentPrice: number, vwap: number): number {
	if (vwap <= 0) {
		return 0;
	}
	return ((currentPrice - vwap) / vwap) * 100;
}

/**
 * Calculate rolling VWAP series
 *
 * Returns VWAP for each bar using cumulative calculation from start
 *
 * @param bars - OHLCV bars (oldest first)
 * @returns Array of VWAP values for each bar
 */
export function calculateVWAPSeries(bars: OHLCVBar[]): VWAPResult[] {
	const results: VWAPResult[] = [];

	let cumulativePV = 0;
	let cumulativeVolume = 0;
	let validBars = 0;

	for (const bar of bars) {
		if (bar.volume > 0) {
			const typicalPrice = calculateTypicalPrice(bar);
			cumulativePV += typicalPrice * bar.volume;
			cumulativeVolume += bar.volume;
			validBars++;
		}

		if (cumulativeVolume > 0) {
			results.push({
				vwap: cumulativePV / cumulativeVolume,
				totalVolume: cumulativeVolume,
				barsUsed: validBars,
				timestamp: bar.timestamp,
			});
		} else {
			results.push({
				vwap: 0,
				totalVolume: 0,
				barsUsed: 0,
				timestamp: bar.timestamp,
			});
		}
	}

	return results;
}
