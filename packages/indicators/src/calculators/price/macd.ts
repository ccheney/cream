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

interface MACDMultipliers {
	fast: number;
	slow: number;
	signal: number;
}

interface EMAState {
	fastEMA: number;
	slowEMA: number;
}

interface MACDComputation {
	macdValues: number[];
	fastEMA: number;
	slowEMA: number;
}

function hasMinimumBars(
	barsLength: number,
	{ slowPeriod, signalPeriod }: Pick<MACDSettings, "slowPeriod" | "signalPeriod">,
): boolean {
	return barsLength >= slowPeriod + signalPeriod;
}

function average(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function updateEMA(previousEMA: number, price: number, multiplier: number): number {
	return price * multiplier + previousEMA * (1 - multiplier);
}

function getMultipliers(settings: MACDSettings): MACDMultipliers {
	return {
		fast: calculateEMAMultiplier(settings.fastPeriod),
		slow: calculateEMAMultiplier(settings.slowPeriod),
		signal: calculateEMAMultiplier(settings.signalPeriod),
	};
}

function seedEMAState(
	bars: OHLCVBar[],
	{ fastPeriod, slowPeriod }: MACDSettings,
	multipliers: MACDMultipliers,
): EMAState | null {
	const fastSeedBars = bars.slice(0, fastPeriod);
	const slowSeedBars = bars.slice(0, slowPeriod);
	if (fastSeedBars.length < fastPeriod || slowSeedBars.length < slowPeriod) {
		return null;
	}

	let fastEMA = average(fastSeedBars.map((bar) => bar.close));
	const slowEMA = average(slowSeedBars.map((bar) => bar.close));

	for (const bar of bars.slice(fastPeriod, slowPeriod)) {
		fastEMA = updateEMA(fastEMA, bar.close, multipliers.fast);
	}

	return { fastEMA, slowEMA };
}

function computeMACDValues(
	bars: OHLCVBar[],
	slowPeriod: number,
	initialState: EMAState,
	multipliers: MACDMultipliers,
): MACDComputation {
	const macdValues: number[] = [];
	let { fastEMA, slowEMA } = initialState;

	for (const bar of bars.slice(slowPeriod)) {
		fastEMA = updateEMA(fastEMA, bar.close, multipliers.fast);
		slowEMA = updateEMA(slowEMA, bar.close, multipliers.slow);
		macdValues.push(fastEMA - slowEMA);
	}

	return { macdValues, fastEMA, slowEMA };
}

function calculateSignalLine(
	macdValues: number[],
	signalPeriod: number,
	signalMultiplier: number,
): number | null {
	if (macdValues.length < signalPeriod) {
		return null;
	}

	let signalLine = average(macdValues.slice(0, signalPeriod));
	for (const value of macdValues.slice(signalPeriod)) {
		signalLine = updateEMA(signalLine, value, signalMultiplier);
	}

	return signalLine;
}

function calculateSignalSeries(
	macdValues: number[],
	signalPeriod: number,
	signalMultiplier: number,
): number[] {
	if (macdValues.length < signalPeriod) {
		return [];
	}

	const signalSeries: number[] = [];
	let signalLine = average(macdValues.slice(0, signalPeriod));
	signalSeries.push(signalLine);

	for (const value of macdValues.slice(signalPeriod)) {
		signalLine = updateEMA(signalLine, value, signalMultiplier);
		signalSeries.push(signalLine);
	}

	return signalSeries;
}

function buildSeriesResult(
	macdValues: number[],
	bars: OHLCVBar[],
	slowPeriod: number,
	signalPeriod: number,
	signalSeries: number[],
): MACDResult[] {
	return signalSeries
		.map((signalLine, signalOffset) => {
			const macdIndex = signalPeriod - 1 + signalOffset;
			const macdLine = macdValues[macdIndex];
			const bar = bars[slowPeriod + macdIndex];
			if (macdLine === undefined || !bar) {
				return null;
			}

			return {
				macdLine,
				signalLine,
				histogram: macdLine - signalLine,
				fastEMA: 0,
				slowEMA: 0,
				timestamp: bar.timestamp,
			};
		})
		.filter((result): result is MACDResult => result !== null);
}

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
	settings: MACDSettings = DEFAULT_SETTINGS,
): MACDResult | null {
	const { slowPeriod, signalPeriod } = settings;
	if (!hasMinimumBars(bars.length, settings)) {
		return null;
	}

	const multipliers = getMultipliers(settings);
	const initialState = seedEMAState(bars, settings, multipliers);
	if (!initialState) {
		return null;
	}

	const { macdValues, fastEMA, slowEMA } = computeMACDValues(
		bars,
		slowPeriod,
		initialState,
		multipliers,
	);
	const signalLine = calculateSignalLine(macdValues, signalPeriod, multipliers.signal);
	const macdLine = macdValues.at(-1);
	if (signalLine === null || macdLine === undefined) {
		return null;
	}

	return {
		macdLine,
		signalLine,
		histogram: macdLine - signalLine,
		fastEMA,
		slowEMA,
		timestamp: bars.at(-1)?.timestamp ?? Date.now(),
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
	settings: MACDSettings = DEFAULT_SETTINGS,
): MACDResult[] {
	const { slowPeriod, signalPeriod } = settings;
	if (!hasMinimumBars(bars.length, settings)) {
		return [];
	}

	const multipliers = getMultipliers(settings);
	const initialState = seedEMAState(bars, settings, multipliers);
	if (!initialState) {
		return [];
	}

	const { macdValues } = computeMACDValues(bars, slowPeriod, initialState, multipliers);
	const signalSeries = calculateSignalSeries(macdValues, signalPeriod, multipliers.signal);
	return buildSeriesResult(macdValues, bars, slowPeriod, signalPeriod, signalSeries);
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
	previous: MACDResult,
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
	previous: MACDResult,
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
	previous: MACDResult | null = null,
): MACDMomentum {
	const histogram = current.histogram;
	const previousHistogram = previous?.histogram ?? null;

	if (histogram > 0) {
		return classifyPositiveMomentum(histogram, previousHistogram);
	}
	if (histogram < 0) {
		return classifyNegativeMomentum(histogram, previousHistogram);
	}
	return "neutral";
}

function classifyPositiveMomentum(
	histogram: number,
	previousHistogram: number | null,
): MACDMomentum {
	if (previousHistogram !== null && histogram <= previousHistogram) {
		return "weakening_bullish";
	}
	return histogram > 0.5 ? "strong_bullish" : "bullish";
}

function classifyNegativeMomentum(
	histogram: number,
	previousHistogram: number | null,
): MACDMomentum {
	if (previousHistogram !== null && histogram >= previousHistogram) {
		return "weakening_bearish";
	}
	return histogram < -0.5 ? "strong_bearish" : "bearish";
}
