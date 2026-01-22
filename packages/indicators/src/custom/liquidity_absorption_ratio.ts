/**
 * Liquidity Absorption Ratio (LAR) Calculator
 *
 * Hypothesis:
 * The liquidity_absorption_ratio (LAR) identifies market regime exhaustion by measuring
 * the concentration of volume at price extremes (wicks) relative to the price progress (body).
 * The hypothesis posits that price trends fail not when volume decreases, but when volume
 * migrates from the 'discovery zone' (the candle body) to the 'rejection zone' (the wicks).
 * A high LAR in the direction of the prevailing trend indicates that aggressive participants
 * are being absorbed by passive limit orders, predicting a transition from a TRENDING regime
 * to a RANGING or CRISIS regime.
 *
 * Economic Rationale:
 * Market movements are a function of the interaction between aggressive (market) orders and
 * passive (limit) orders. During healthy price discovery, aggressive orders successfully shift
 * the equilibrium, resulting in volume being transacted across a new price range (the candle body).
 * However, when a trend nears exhaustion, 'informed' passive liquidity providers step in at
 * extreme price levels. This creates high volume at the 'wicks' of the candle where price was
 * unable to sustain itself. This 'Absorption' is a leading indicator of trend fragility that
 * price-only momentum indicators cannot capture, as they treat all volume within a period as
 * equal contributors to the price move.
 *
 * Mathematical Approach:
 * 1. Define the Price Core as the range between the Open and Close, and the Price Extremes as
 *    the Upper Wick (High - max(Open, Close)) and Lower Wick (min(Open, Close) - Low).
 * 2. Calculate the Extreme Volume Share: Estimate the volume transacted in the Price Extremes
 *    by multiplying the total volume by the ratio of the Wick length to the Total Range (High-Low).
 * 3. Define the Absorption Metric: The ratio of volume in the 'Trend-Opposing Wick' to the
 *    volume in the 'Price Core.'
 * 4. Normalize the metric using a 20-period rolling Z-score to identify statistically significant
 *    absorption events.
 * 5. The final indicator value ranges from -3 to +3.
 *
 * Related Academic Work:
 * - Kyle, A. S. (1985). "Continuous Auctions and Insider Trading." Econometrica.
 * - Amihud, Y. (2002). "Illiquidity and stock returns: cross-section and time-series effects."
 * - Easley, D., Lopez de Prado, M. M., & O'Hara, M. (2012). "Flow Toxicity and Liquidity in a
 *   High-frequency World." The Review of Financial Studies.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import type { OHLCVBar } from "../types";

// ============================================================
// TYPES
// ============================================================

export interface LiquidityAbsorptionRatioResult {
	/** The normalized LAR value (Z-score, clamped to [-3, 3]) */
	value: number;
	/** Raw absorption ratio before normalization */
	rawAbsorptionRatio: number;
	/** Volume estimated in the upper wick */
	upperWickVolume: number;
	/** Volume estimated in the lower wick */
	lowerWickVolume: number;
	/** Volume estimated in the body (core) */
	bodyVolume: number;
	/** Direction of the trend-opposing wick ('upper' for bullish candles, 'lower' for bearish) */
	trendOpposingWickDirection: "upper" | "lower";
	/** Rolling mean used for Z-score */
	rollingMean: number;
	/** Rolling standard deviation used for Z-score */
	rollingStdDev: number;
	/** Timestamp of the bar */
	timestamp: number;
}

export interface LiquidityAbsorptionRatioConfig {
	/** Period for rolling Z-score normalization (default: 20) */
	normalizationPeriod?: number;
	/** Minimum total range as a fraction of price to avoid division by zero (default: 0.0001) */
	minRangeFraction?: number;
	/** Minimum body size as a fraction of total range (default: 0.01) */
	minBodyFraction?: number;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

interface CandleMetrics {
	upperWick: number;
	lowerWick: number;
	body: number;
	totalRange: number;
	isBullish: boolean;
}

/**
 * Extract wick and body metrics from a candle
 */
function getCandleMetrics(bar: OHLCVBar): CandleMetrics {
	const isBullish = bar.close >= bar.open;
	const bodyTop = Math.max(bar.open, bar.close);
	const bodyBottom = Math.min(bar.open, bar.close);

	const upperWick = bar.high - bodyTop;
	const lowerWick = bodyBottom - bar.low;
	const body = bodyTop - bodyBottom;
	const totalRange = bar.high - bar.low;

	return {
		upperWick: Math.max(0, upperWick),
		lowerWick: Math.max(0, lowerWick),
		body: Math.max(0, body),
		totalRange: Math.max(0, totalRange),
		isBullish,
	};
}

/**
 * Calculate absorption ratio for a single bar
 *
 * Returns the ratio of trend-opposing wick volume to body volume.
 * For bullish candles, the trend-opposing wick is the upper wick (resistance).
 * For bearish candles, the trend-opposing wick is the lower wick (support).
 */
function calculateSingleBarAbsorptionRatio(
	bar: OHLCVBar,
	config: Required<LiquidityAbsorptionRatioConfig>,
): {
	absorptionRatio: number;
	upperWickVolume: number;
	lowerWickVolume: number;
	bodyVolume: number;
	trendOpposingWickDirection: "upper" | "lower";
} | null {
	const metrics = getCandleMetrics(bar);

	// Avoid division by zero or extremely small ranges
	const minRange = bar.close * config.minRangeFraction;
	if (metrics.totalRange < minRange) {
		return null;
	}

	// Estimate volume distribution based on price range proportions
	// This assumes volume is uniformly distributed across the price range traded
	const upperWickFraction = metrics.totalRange > 0 ? metrics.upperWick / metrics.totalRange : 0;
	const lowerWickFraction = metrics.totalRange > 0 ? metrics.lowerWick / metrics.totalRange : 0;
	const bodyFraction = metrics.totalRange > 0 ? metrics.body / metrics.totalRange : 0;

	const upperWickVolume = bar.volume * upperWickFraction;
	const lowerWickVolume = bar.volume * lowerWickFraction;
	const bodyVolume = bar.volume * bodyFraction;

	// Ensure minimum body volume to avoid division by zero
	const minBodyVolume = bar.volume * config.minBodyFraction;
	const effectiveBodyVolume = Math.max(bodyVolume, minBodyVolume);

	// Determine trend-opposing wick based on candle direction
	// For bullish candles: upper wick represents rejection of higher prices (absorption)
	// For bearish candles: lower wick represents rejection of lower prices (absorption)
	const trendOpposingWickDirection: "upper" | "lower" = metrics.isBullish ? "upper" : "lower";
	const trendOpposingWickVolume = metrics.isBullish ? upperWickVolume : lowerWickVolume;

	// Absorption ratio: trend-opposing wick volume / body volume
	const absorptionRatio = trendOpposingWickVolume / effectiveBodyVolume;

	return {
		absorptionRatio,
		upperWickVolume,
		lowerWickVolume,
		bodyVolume,
		trendOpposingWickDirection,
	};
}

/**
 * Calculate rolling mean and standard deviation
 */
function calculateRollingStats(values: number[]): { mean: number; stdDev: number } {
	if (values.length === 0) {
		return { mean: 0, stdDev: 1 };
	}

	const n = values.length;
	const mean = values.reduce((sum, v) => sum + v, 0) / n;

	if (n < 2) {
		return { mean, stdDev: 1 };
	}

	const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
	const stdDev = Math.sqrt(variance);

	// Avoid division by zero in Z-score calculation
	return { mean, stdDev: stdDev > 0 ? stdDev : 1 };
}

// ============================================================
// MAIN CALCULATOR
// ============================================================

/**
 * Calculate Liquidity Absorption Ratio (LAR)
 *
 * Measures the concentration of volume at price extremes (wicks) relative to price
 * progress (body), normalized as a Z-score to identify statistically significant
 * absorption events.
 *
 * @param bars - OHLCV bars (oldest first)
 * @param config - Optional configuration parameters
 * @returns LAR result or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 21+ bars for default period
 * const result = calculateLiquidityAbsorptionRatio(bars);
 * if (result && result.value > 2.0) {
 *   // High absorption signal - potential trend exhaustion
 * }
 * ```
 */
export function calculateLiquidityAbsorptionRatio(
	bars: OHLCVBar[],
	config?: LiquidityAbsorptionRatioConfig,
): LiquidityAbsorptionRatioResult | null {
	// Default configuration
	const fullConfig: Required<LiquidityAbsorptionRatioConfig> = {
		normalizationPeriod: config?.normalizationPeriod ?? 20,
		minRangeFraction: config?.minRangeFraction ?? 0.0001,
		minBodyFraction: config?.minBodyFraction ?? 0.01,
	};

	// Need at least normalizationPeriod + 1 bars for meaningful Z-score
	if (bars.length < fullConfig.normalizationPeriod + 1) {
		return null;
	}

	// Calculate absorption ratios for all bars
	const absorptionRatios: number[] = [];
	const barResults: Array<ReturnType<typeof calculateSingleBarAbsorptionRatio>> = [];

	for (const bar of bars) {
		const result = calculateSingleBarAbsorptionRatio(bar, fullConfig);
		barResults.push(result);
		if (result !== null) {
			absorptionRatios.push(result.absorptionRatio);
		}
	}

	// Get the most recent bar's result
	const lastBarResult = barResults[barResults.length - 1];
	if (!lastBarResult) {
		return null;
	}

	// Need enough valid absorption ratios for normalization
	if (absorptionRatios.length < fullConfig.normalizationPeriod) {
		return null;
	}

	// Get the rolling window for Z-score calculation (excluding the current bar)
	const windowStart = Math.max(0, absorptionRatios.length - fullConfig.normalizationPeriod - 1);
	const windowEnd = absorptionRatios.length - 1;
	const rollingWindow = absorptionRatios.slice(windowStart, windowEnd);

	const { mean, stdDev } = calculateRollingStats(rollingWindow);

	// Calculate Z-score for the current bar
	const rawAbsorptionRatio = lastBarResult.absorptionRatio;
	const zScore = (rawAbsorptionRatio - mean) / stdDev;

	// Clamp to [-3, 3] as per hypothesis specification
	const clampedValue = Math.max(-3, Math.min(3, zScore));

	const lastBar = bars[bars.length - 1];

	return {
		value: clampedValue,
		rawAbsorptionRatio,
		upperWickVolume: lastBarResult.upperWickVolume,
		lowerWickVolume: lastBarResult.lowerWickVolume,
		bodyVolume: lastBarResult.bodyVolume,
		trendOpposingWickDirection: lastBarResult.trendOpposingWickDirection,
		rollingMean: mean,
		rollingStdDev: stdDev,
		timestamp: lastBar?.timestamp ?? Date.now(),
	};
}

/**
 * Calculate LAR series for each bar
 *
 * @param bars - OHLCV bars (oldest first)
 * @param config - Optional configuration parameters
 * @returns Array of LAR results (null for bars with insufficient history)
 */
export function calculateLiquidityAbsorptionRatioSeries(
	bars: OHLCVBar[],
	config?: LiquidityAbsorptionRatioConfig,
): Array<LiquidityAbsorptionRatioResult | null> {
	const fullConfig: Required<LiquidityAbsorptionRatioConfig> = {
		normalizationPeriod: config?.normalizationPeriod ?? 20,
		minRangeFraction: config?.minRangeFraction ?? 0.0001,
		minBodyFraction: config?.minBodyFraction ?? 0.01,
	};

	const results: Array<LiquidityAbsorptionRatioResult | null> = [];

	for (let i = 0; i < bars.length; i++) {
		const windowBars = bars.slice(0, i + 1);
		const result = calculateLiquidityAbsorptionRatio(windowBars, fullConfig);
		results.push(result);
	}

	return results;
}

/**
 * Classify LAR signal strength
 */
export type LARSignalLevel =
	| "extreme_absorption"
	| "high_absorption"
	| "moderate_absorption"
	| "normal"
	| "low_absorption";

/**
 * Classify LAR reading
 *
 * @param value - LAR Z-score value
 * @returns Classification of signal strength
 */
export function classifyLAR(value: number): LARSignalLevel {
	const absValue = Math.abs(value);

	if (absValue >= 2.5) {
		return "extreme_absorption";
	}
	if (absValue >= 2.0) {
		return "high_absorption";
	}
	if (absValue >= 1.5) {
		return "moderate_absorption";
	}
	if (absValue >= 1.0) {
		return "normal";
	}
	return "low_absorption";
}

/**
 * Detect potential trend exhaustion based on LAR
 *
 * A high LAR (> 2.0) combined with a trending candle direction suggests
 * the trend is facing significant absorption and may be exhausting.
 *
 * @param result - LAR calculation result
 * @returns Whether trend exhaustion is signaled
 */
export function detectTrendExhaustion(result: LiquidityAbsorptionRatioResult): boolean {
	// High absorption (Z-score > 2.0) indicates potential trend exhaustion
	return result.value > 2.0;
}
