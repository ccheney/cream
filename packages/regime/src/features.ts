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
  config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG
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
    // Returns array is offset by 1 from candles array due to diff calculation
    const returnIdx = i - 1;
    const candle = candles[i]!;

    const returns = logReturns[returnIdx] ?? 0;

    const recentReturns = logReturns.slice(returnIdx - config.volatilityPeriod + 1, returnIdx + 1);
    const volatility = calculateStd(recentReturns);

    const recentVolumes = candles.slice(i - config.volumePeriod + 1, i + 1).map((c) => c.volume);
    const volumeZScore = calculateZScore(candle.volume, recentVolumes);

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
  config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG
): RegimeFeatures | null {
  const features = extractFeatures(candles, config);
  return features[features.length - 1] ?? null;
}

export function getMinimumCandleCount(
  config: FeatureExtractionConfig = DEFAULT_FEATURE_CONFIG
): number {
  return Math.max(config.volatilityPeriod, config.volumePeriod) + 1;
}

export function calculateStd(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return 0;
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

export function calculateMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateZScore(value: number, sample: number[]): number {
  const mean = calculateMean(sample);
  const std = calculateStd(sample);
  if (std < 0.0001) {
    return 0; // Avoid division by near-zero
  }
  return (value - mean) / std;
}

export function normalizeFeatures(features: RegimeFeatures[]): {
  normalized: number[][];
  means: number[];
  stds: number[];
} {
  if (features.length === 0) {
    return { normalized: [], means: [0, 0, 0, 0], stds: [1, 1, 1, 1] };
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

  const normalized = features.map((f) => [
    (f.returns - means[0]!) / stds[0]!,
    (f.volatility - means[1]!) / stds[1]!,
    (f.volumeZScore - means[2]!) / stds[2]!,
    (f.trendStrength - means[3]!) / stds[3]!,
  ]);

  return { normalized, means, stds };
}

export function normalizeFeatureVector(
  feature: RegimeFeatures,
  means: number[],
  stds: number[]
): number[] {
  return [
    (feature.returns - means[0]!) / stds[0]!,
    (feature.volatility - means[1]!) / stds[1]!,
    (feature.volumeZScore - means[2]!) / stds[2]!,
    (feature.trendStrength - means[3]!) / stds[3]!,
  ];
}
