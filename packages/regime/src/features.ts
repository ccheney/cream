/**
 * Feature Extraction for Regime Classification
 *
 * Computes features used for regime classification:
 * - Returns (daily/periodic)
 * - Realized volatility
 * - Volume metrics
 * - Trend strength
 *
 * @see docs/plans/02-data-layer.md
 */

import type { OHLCVBar } from "@cream/indicators";

export interface RegimeFeatures {
	/** Log returns */
	returns: number;
	/** Realized volatility (std of returns) */
	volatility: number;
	/** Volume z-score relative to recent average */
	volumeZScore: number;
	/** Trend strength (price change / volatility) */
	trendStrength: number;
	/** Timestamp of the feature observation */
	timestamp: string;
}

export interface FeatureExtractionConfig {
	/** Lookback period for returns calculation */
	returnsPeriod: number;
	/** Lookback period for volatility calculation */
	volatilityPeriod: number;
	/** Lookback period for volume average */
	volumePeriod: number;
}

export const DEFAULT_FEATURE_CONFIG: FeatureExtractionConfig = {
	returnsPeriod: 1,
	volatilityPeriod: 20,
	volumePeriod: 20,
};

const STABILITY_EPSILON = 0.0001;
const TREND_STRENGTH_MIN = -3;
const TREND_STRENGTH_MAX = 3;

/**
 * Extract regime classification features from candle data.
 *
 * @param candles - Price candles (oldest first)
 * @param config - Feature extraction configuration
 * @returns Array of extracted features
 */
export function extractFeatures(
	candles: OHLCVBar[],
	config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG,
): RegimeFeatures[] {
	if (candles.length < config.volatilityPeriod + 1) {
		return [];
	}

	const features: RegimeFeatures[] = [];
	const logReturns = computeLogReturns(candles);
	for (let i = config.volatilityPeriod; i < candles.length; i++) {
		const feature = createFeatureObservation(candles, logReturns, i, config);
		if (feature) {
			features.push(feature);
		}
	}

	return features;
}

export function extractSingleFeature(
	candles: OHLCVBar[],
	config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG,
): RegimeFeatures | null {
	const features = extractFeatures(candles, config);
	return features.at(-1) ?? null;
}

export function getMinimumCandleCount(
	config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG,
): number {
	return Math.max(config.volatilityPeriod, config.volumePeriod) + 1;
}

function computeLogReturns(candles: OHLCVBar[]): number[] {
	const returns: number[] = [];
	for (let i = 1; i < candles.length; i++) {
		returns.push(computeLogReturn(candles[i - 1]?.close ?? 0, candles[i]?.close ?? 0));
	}
	return returns;
}

function computeLogReturn(previousClose: number, currentClose: number): number {
	if (previousClose <= 0 || currentClose <= 0) {
		return 0;
	}
	return Math.log(currentClose / previousClose);
}

function createFeatureObservation(
	candles: OHLCVBar[],
	logReturns: number[],
	candleIndex: number,
	config: FeatureExtractionConfig,
): RegimeFeatures | null {
	const candle = candles[candleIndex];
	if (!candle) {
		return null;
	}

	const returnIndex = candleIndex - 1;
	const returns = logReturns[returnIndex] ?? 0;
	const recentReturns = logReturns.slice(
		returnIndex - config.volatilityPeriod + 1,
		returnIndex + 1,
	);
	const volatility = calculateStd(recentReturns);

	const recentVolumes = candles
		.slice(candleIndex - config.volumePeriod + 1, candleIndex + 1)
		.map((item) => item.volume);
	const volumeZScore = calculateRollingVolumeZScore(candle.volume, recentVolumes);

	return {
		returns,
		volatility,
		volumeZScore,
		trendStrength: calculateTrendStrength(returns, volatility),
		timestamp: new Date(candle.timestamp).toISOString(),
	};
}

function calculateRollingVolumeZScore(volume: number, sample: number[]): number {
	const mean = calculateMean(sample);
	const std = calculateStd(sample);
	if (std <= STABILITY_EPSILON) {
		return 0;
	}
	return (volume - mean) / std;
}

function calculateTrendStrength(returns: number, volatility: number): number {
	if (volatility <= STABILITY_EPSILON) {
		return 0;
	}
	const rawStrength = returns / volatility;
	return Math.max(TREND_STRENGTH_MIN, Math.min(TREND_STRENGTH_MAX, rawStrength));
}

export function calculateStd(values: number[]): number {
	if (values.length === 0) {
		throw new Error("Cannot calculate standard deviation of empty array");
	}
	if (values.length === 1) {
		throw new Error("Cannot calculate standard deviation with single value");
	}

	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const squaredDiffs = values.map((v) => (v - mean) ** 2);
	const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
	return Math.sqrt(variance);
}

export function calculateMean(values: number[]): number {
	if (values.length === 0) {
		throw new Error("Cannot calculate mean of empty array");
	}
	return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateZScore(value: number, sample: number[]): number {
	const mean = calculateMean(sample);
	const std = calculateStd(sample);
	if (std < STABILITY_EPSILON) {
		throw new Error("Cannot calculate z-score: standard deviation is near zero");
	}
	return (value - mean) / std;
}

export function normalizeFeatures(features: RegimeFeatures[]): {
	normalized: number[][];
	means: number[];
	stds: number[];
} {
	if (features.length === 0) {
		throw new Error("Cannot normalize empty feature array");
	}
	if (features.length < 2) {
		throw new Error("Cannot normalize features: need at least 2 samples for standard deviation");
	}

	const returns = features.map((f) => f.returns);
	const volatility = features.map((f) => f.volatility);
	const volumeZScore = features.map((f) => f.volumeZScore);
	const trendStrength = features.map((f) => f.trendStrength);

	const means = [
		calculateMean(returns),
		calculateMean(volatility),
		calculateMean(volumeZScore),
		calculateMean(trendStrength),
	];

	const stds = [
		Math.max(calculateStd(returns), STABILITY_EPSILON),
		Math.max(calculateStd(volatility), STABILITY_EPSILON),
		Math.max(calculateStd(volumeZScore), STABILITY_EPSILON),
		Math.max(calculateStd(trendStrength), STABILITY_EPSILON),
	];

	const meanReturns = means[0] ?? 0;
	const meanVol = means[1] ?? 0;
	const meanVolZ = means[2] ?? 0;
	const meanTrend = means[3] ?? 0;
	const stdReturns = stds[0] ?? 1;
	const stdVol = stds[1] ?? 1;
	const stdVolZ = stds[2] ?? 1;
	const stdTrend = stds[3] ?? 1;

	const normalized = features.map((f) => [
		(f.returns - meanReturns) / stdReturns,
		(f.volatility - meanVol) / stdVol,
		(f.volumeZScore - meanVolZ) / stdVolZ,
		(f.trendStrength - meanTrend) / stdTrend,
	]);

	return { normalized, means, stds };
}

export function normalizeFeatureVector(
	feature: RegimeFeatures,
	means: number[],
	stds: number[],
): number[] {
	const meanReturns = means[0] ?? 0;
	const meanVol = means[1] ?? 0;
	const meanVolZ = means[2] ?? 0;
	const meanTrend = means[3] ?? 0;
	const stdReturns = stds[0] ?? 1;
	const stdVol = stds[1] ?? 1;
	const stdVolZ = stds[2] ?? 1;
	const stdTrend = stds[3] ?? 1;

	return [
		(feature.returns - meanReturns) / stdReturns,
		(feature.volatility - meanVol) / stdVol,
		(feature.volumeZScore - meanVolZ) / stdVolZ,
		(feature.trendStrength - meanTrend) / stdTrend,
	];
}
