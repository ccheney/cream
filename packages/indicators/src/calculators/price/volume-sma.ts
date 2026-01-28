/**
 * Volume SMA Calculator
 *
 * Simple Moving Average of volume, used to detect unusual volume patterns.
 */

import type { OHLCVBar } from "../../types/index.js";

/**
 * Volume SMA result with volume relative to average
 */
export interface VolumeSMAResult {
	/** Timestamp of the bar */
	timestamp: number;
	/** Simple moving average of volume */
	volumeSma: number;
	/** Current volume */
	currentVolume: number;
	/** Volume ratio (current / SMA) */
	volumeRatio: number;
}

/**
 * Calculate a single Volume SMA value from bars
 *
 * @param bars - OHLCV bar data
 * @param period - SMA period (default: 20)
 * @returns Volume SMA value or null if insufficient data
 */
export function calculateVolumeSMA(
	bars: OHLCVBar[],
	config: { period: number } = { period: 20 },
): VolumeSMAResult | null {
	const { period } = config;

	if (bars.length < period) {
		return null;
	}

	// Get the most recent `period` bars
	const recentBars = bars.slice(-period);
	const volumeSum = recentBars.reduce((sum, bar) => sum + bar.volume, 0);
	const volumeSma = volumeSum / period;

	const lastBar = bars.at(-1);
	if (!lastBar) {
		return null;
	}

	const currentVolume = lastBar.volume;
	const volumeRatio = volumeSma > 0 ? currentVolume / volumeSma : 0;

	return {
		timestamp: lastBar.timestamp,
		volumeSma,
		currentVolume,
		volumeRatio,
	};
}

/**
 * Calculate Volume SMA series for all bars
 *
 * @param bars - OHLCV bar data
 * @param period - SMA period (default: 20)
 * @returns Array of Volume SMA results
 */
export function calculateVolumeSMASeries(
	bars: OHLCVBar[],
	config: { period: number } = { period: 20 },
): VolumeSMAResult[] {
	const { period } = config;
	const results: VolumeSMAResult[] = [];

	for (let i = period - 1; i < bars.length; i++) {
		const windowBars = bars.slice(i - period + 1, i + 1);
		const volumeSum = windowBars.reduce((sum, bar) => sum + bar.volume, 0);
		const volumeSma = volumeSum / period;

		const currentBar = bars[i];
		if (!currentBar) {
			continue;
		}

		const currentVolume = currentBar.volume;
		const volumeRatio = volumeSma > 0 ? currentVolume / volumeSma : 0;

		results.push({
			timestamp: currentBar.timestamp,
			volumeSma,
			currentVolume,
			volumeRatio,
		});
	}

	return results;
}
