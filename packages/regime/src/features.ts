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
	const logReturns: number[] = [];
	for (let i = 1; i < candles.length; i++) {
		const prevClose = candles[i - 1]?.close ?? 0;
		const currClose = candles[i]?.close ?? 0;
		if (prevClose > 0 && currClose > 0) {
			logReturns.push(Math.log(currClose / prevClose));
		} else {
			logReturns.push(0);
		}
	}

	for (let i = config.volatilityPeriod; i < candles.length; i++) {
		const returnIdx = i - 1;
		const candle = candles[i];
		if (!candle) {
			continue;
		}

		const returns = logReturns[returnIdx] ?? 0;

		const recentReturns = logReturns.slice(returnIdx - config.volatilityPeriod + 1, returnIdx + 1);
		const volatility = calculateStd(recentReturns);

		const recentVolumes = candles.slice(i - config.volumePeriod + 1, i + 1).map((c) => c.volume);
		const volumeMean = calculateMean(recentVolumes);
		const volumeStd = calculateStd(recentVolumes);
		const volumeZScore = volumeStd > 0.0001 ? (candle.volume - volumeMean) / volumeStd : 0;

		const trendStrength = volatility > 0.0001 ? returns / volatility : 0;

		features.push({
			returns,
			volatility,
			volumeZScore,
			trendStrength: Math.max(-3, Math.min(3, trendStrength)),
			timestamp: new Date(candle.timestamp).toISOString(),
		});
	}

	return features;
}

export function extractSingleFeature(
	candles: OHLCVBar[],
	config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG,
): RegimeFeatures | null {
	const features = extractFeatures(candles, config);
	return features[features.length - 1] ?? null;
}

export function getMinimumCandleCount(
	config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG,
): number {
	return Math.max(config.volatilityPeriod, config.volumePeriod) + 1;
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
	if (std < 0.0001) {
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
		Math.max(calculateStd(returns), 0.0001),
		Math.max(calculateStd(volatility), 0.0001),
		Math.max(calculateStd(volumeZScore), 0.0001),
		Math.max(calculateStd(trendStrength), 0.0001),
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
