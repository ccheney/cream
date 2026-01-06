/**
 * Surprise Scoring
 *
 * Computes surprise score based on actual vs expected values.
 */

import type { DataPoint, ExtractionResult } from "../types.js";

/**
 * Surprise scoring configuration
 */
export interface SurpriseScoringConfig {
  /** Threshold for significant surprise (default: 0.1 = 10%) */
  significanceThreshold?: number;
  /** Maximum deviation to cap at (default: 0.5 = 50%) */
  maxDeviation?: number;
  /** Weight for magnitude vs direction (default: 0.7) */
  magnitudeWeight?: number;
}

const DEFAULT_CONFIG: Required<SurpriseScoringConfig> = {
  significanceThreshold: 0.1,
  maxDeviation: 0.5,
  magnitudeWeight: 0.7,
};

/**
 * Expected values for common metrics (for surprise calculation)
 */
export interface MetricExpectation {
  metric: string;
  expectedValue: number;
  consensusRange?: { low: number; high: number };
}

/**
 * Compute surprise score for a single data point
 *
 * @param actual - Actual reported value
 * @param expected - Expected/consensus value
 * @param config - Scoring configuration
 * @returns Surprise score from -1.0 (big miss) to 1.0 (big beat)
 */
export function computeSurpriseScore(
  actual: number,
  expected: number,
  config: SurpriseScoringConfig = {}
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (expected === 0) {
    // Cannot compute percentage deviation from zero
    return actual > 0 ? 0.5 : actual < 0 ? -0.5 : 0;
  }

  // Calculate percentage deviation
  const deviation = (actual - expected) / Math.abs(expected);

  // Cap at max deviation
  const cappedDeviation = Math.max(-cfg.maxDeviation, Math.min(cfg.maxDeviation, deviation));

  // Scale to [-1, 1] range
  return cappedDeviation / cfg.maxDeviation;
}

/**
 * Compute weighted surprise from multiple data points
 */
export function computeAggregatedSurprise(
  dataPoints: Array<{ actual: number; expected: number; weight?: number }>,
  config?: SurpriseScoringConfig
): number {
  if (dataPoints.length === 0) {
    return 0;
  }

  const scores = dataPoints.map((dp) => ({
    score: computeSurpriseScore(dp.actual, dp.expected, config),
    weight: dp.weight ?? 1,
  }));

  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  return scores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
}

/**
 * Compute surprise score from extraction result
 *
 * Attempts to match extracted data points with expectations
 */
export function computeSurpriseFromExtraction(
  extraction: ExtractionResult,
  expectations: MetricExpectation[],
  config?: SurpriseScoringConfig
): number {
  const matches: Array<{ actual: number; expected: number; weight: number }> = [];

  // Match data points with expectations
  for (const dp of extraction.dataPoints) {
    const expectation = findMatchingExpectation(dp, expectations);
    if (expectation) {
      matches.push({
        actual: dp.value,
        expected: expectation.expectedValue,
        weight: getMetricWeight(dp.metric),
      });
    }
  }

  if (matches.length === 0) {
    // No matches found - use event-based heuristics
    return computeEventBasedSurprise(extraction);
  }

  return computeAggregatedSurprise(matches, config);
}

/**
 * Find matching expectation for a data point
 */
function findMatchingExpectation(
  dataPoint: DataPoint,
  expectations: MetricExpectation[]
): MetricExpectation | null {
  const normalizedMetric = dataPoint.metric.toLowerCase();

  for (const exp of expectations) {
    const normalizedExpMetric = exp.metric.toLowerCase();

    // Exact match
    if (normalizedMetric === normalizedExpMetric) {
      return exp;
    }

    // Partial match (e.g., "revenue" matches "total revenue")
    if (
      normalizedMetric.includes(normalizedExpMetric) ||
      normalizedExpMetric.includes(normalizedMetric)
    ) {
      return exp;
    }
  }

  return null;
}

/**
 * Get weight for a metric based on its importance
 */
function getMetricWeight(metric: string): number {
  const weights: Record<string, number> = {
    revenue: 1.0,
    eps: 1.0,
    earnings: 1.0,
    "net income": 0.9,
    "gross margin": 0.8,
    "operating margin": 0.8,
    guidance: 1.0,
    outlook: 0.9,
    growth: 0.8,
  };

  const normalized = metric.toLowerCase();
  for (const [key, weight] of Object.entries(weights)) {
    if (normalized.includes(key)) {
      return weight;
    }
  }

  return 0.5; // Default weight
}

/**
 * Compute surprise based on event characteristics when no expectations available
 */
function computeEventBasedSurprise(extraction: ExtractionResult): number {
  // Use sentiment and importance as proxies for surprise
  // Strong sentiment + high importance = likely surprise

  // Map sentiment to direction
  const sentimentMultiplier =
    extraction.sentiment === "bullish" ? 1 : extraction.sentiment === "bearish" ? -1 : 0;

  // Higher importance suggests more surprising news
  const importanceFactor = (extraction.importance - 3) / 2; // -1 to 1 range

  // Combine with confidence
  return sentimentMultiplier * importanceFactor * extraction.confidence * 0.5;
}

/**
 * Classify surprise score
 */
export function classifySurprise(
  score: number
): "big_beat" | "beat" | "inline" | "miss" | "big_miss" {
  if (score >= 0.5) {
    return "big_beat";
  }
  if (score >= 0.15) {
    return "beat";
  }
  if (score > -0.15) {
    return "inline";
  }
  if (score > -0.5) {
    return "miss";
  }
  return "big_miss";
}

/**
 * Determine if surprise is significant
 */
export function isSurpriseSignificant(score: number, threshold = 0.15): boolean {
  return Math.abs(score) >= threshold;
}

/**
 * Get surprise direction
 */
export function getSurpriseDirection(score: number): "positive" | "negative" | "neutral" {
  if (score > 0.1) {
    return "positive";
  }
  if (score < -0.1) {
    return "negative";
  }
  return "neutral";
}
