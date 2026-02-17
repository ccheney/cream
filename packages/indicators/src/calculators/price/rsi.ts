/**
 * RSI (Relative Strength Index) Calculator
 *
 * RSI is a momentum oscillator that measures the speed and magnitude of
 * recent price changes to evaluate overbought or oversold conditions.
 *
 * Theoretical Foundation:
 * - Wilder (1978): "New Concepts in Technical Trading Systems"
 *
 * Formula:
 * RSI = 100 - (100 / (1 + RS))
 * RS = Average Gain / Average Loss (over period)
 *
 * Uses Wilder's smoothing method (exponential with α = 1/period)
 *
 * Interpretation:
 * - RSI > 70: Overbought (potential reversal down)
 * - RSI < 30: Oversold (potential reversal up)
 * - RSI 40-60: Neutral trending zone
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface RSIResult {
	/** RSI value (0-100) */
	rsi: number;
	/** Average gain */
	avgGain: number;
	/** Average loss */
	avgLoss: number;
	/** Timestamp */
	timestamp: number;
}

interface GainLossAverages {
	avgGain: number;
	avgLoss: number;
}

function calculatePriceChanges(bars: OHLCVBar[]): number[] {
	const changes: number[] = [];
	for (let i = 1; i < bars.length; i++) {
		const current = bars[i];
		const previous = bars[i - 1];
		if (current && previous) {
			changes.push(current.close - previous.close);
		}
	}
	return changes;
}

function getGainLoss(change: number): { gain: number; loss: number } {
	return {
		gain: change > 0 ? change : 0,
		loss: change < 0 ? Math.abs(change) : 0,
	};
}

function calculateInitialAverages(changes: number[], period: number): GainLossAverages | null {
	if (changes.length < period) {
		return null;
	}

	let avgGain = 0;
	let avgLoss = 0;
	for (const change of changes.slice(0, period)) {
		const { gain, loss } = getGainLoss(change);
		avgGain += gain;
		avgLoss += loss;
	}

	return {
		avgGain: avgGain / period,
		avgLoss: avgLoss / period,
	};
}

function applyWilderSmoothing(
	averages: GainLossAverages,
	change: number,
	period: number,
): GainLossAverages {
	const { gain, loss } = getGainLoss(change);
	return {
		avgGain: (averages.avgGain * (period - 1) + gain) / period,
		avgLoss: (averages.avgLoss * (period - 1) + loss) / period,
	};
}

function toRSI(avgGain: number, avgLoss: number): number {
	if (avgLoss === 0) {
		return 100;
	}
	if (avgGain === 0) {
		return 0;
	}

	const rs = avgGain / avgLoss;
	return 100 - 100 / (1 + rs);
}

function toRSIResult(averages: GainLossAverages, timestamp: number): RSIResult {
	return {
		rsi: toRSI(averages.avgGain, averages.avgLoss),
		avgGain: averages.avgGain,
		avgLoss: averages.avgLoss,
		timestamp,
	};
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate RSI using Wilder's smoothing method
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - RSI period (default: 14)
 * @returns RSI result or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 15+ bars
 * const result = calculateRSI(bars, 14);
 * // result.rsi = 65.5
 * ```
 */
export function calculateRSI(bars: OHLCVBar[], period = 14): RSIResult | null {
	if (bars.length < period + 1) {
		return null;
	}

	const changes = calculatePriceChanges(bars);
	const initialAverages = calculateInitialAverages(changes, period);
	if (!initialAverages) {
		return null;
	}

	let averages = initialAverages;
	for (const change of changes.slice(period)) {
		averages = applyWilderSmoothing(averages, change, period);
	}

	return toRSIResult(averages, bars.at(-1)?.timestamp ?? Date.now());
}

/**
 * Calculate RSI series for each bar
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - RSI period
 * @returns Array of RSI results
 */
export function calculateRSISeries(bars: OHLCVBar[], period = 14): RSIResult[] {
	if (bars.length < period + 1) {
		return [];
	}

	const changes = calculatePriceChanges(bars);
	const initialAverages = calculateInitialAverages(changes, period);
	const firstBar = bars[period];
	if (!initialAverages || !firstBar) {
		return [];
	}

	const results: RSIResult[] = [toRSIResult(initialAverages, firstBar.timestamp)];
	let averages = initialAverages;

	for (const [offset, change] of changes.slice(period).entries()) {
		averages = applyWilderSmoothing(averages, change, period);
		const bar = bars[period + offset + 1];
		if (!bar) {
			continue;
		}

		results.push(toRSIResult(averages, bar.timestamp));
	}

	return results;
}

/**
 * Classify RSI level
 */
export type RSILevel =
	| "extreme_overbought"
	| "overbought"
	| "neutral_bullish"
	| "neutral"
	| "neutral_bearish"
	| "oversold"
	| "extreme_oversold";

/**
 * Classify RSI reading
 *
 * @param rsi - RSI value (0-100)
 * @returns Classification
 */
export function classifyRSI(rsi: number): RSILevel {
	if (rsi >= 80) {
		return "extreme_overbought";
	}
	if (rsi >= 70) {
		return "overbought";
	}
	if (rsi >= 55) {
		return "neutral_bullish";
	}
	if (rsi >= 45) {
		return "neutral";
	}
	if (rsi >= 30) {
		return "neutral_bearish";
	}
	if (rsi >= 20) {
		return "oversold";
	}
	return "extreme_oversold";
}

/**
 * Check for RSI divergence (bullish or bearish)
 *
 * @param priceHighs - Recent price highs [older, newer]
 * @param priceLows - Recent price lows [older, newer]
 * @param rsiHighs - RSI values at price highs [older, newer]
 * @param rsiLows - RSI values at price lows [older, newer]
 * @returns Divergence type or null
 */
export function detectRSIDivergence(
	priceHighs: [number, number],
	priceLows: [number, number],
	rsiHighs: [number, number],
	rsiLows: [number, number],
): "bullish" | "bearish" | null {
	// Bullish divergence: lower price lows, but higher RSI lows
	if (priceLows[1] < priceLows[0] && rsiLows[1] > rsiLows[0]) {
		return "bullish";
	}

	// Bearish divergence: higher price highs, but lower RSI highs
	if (priceHighs[1] > priceHighs[0] && rsiHighs[1] < rsiHighs[0]) {
		return "bearish";
	}

	return null;
}
