/**
 * Rule-Based Market Regime Classifier
 *
 * Simple, interpretable regime classification using:
 * - Moving average crossovers for trend detection
 * - Volatility percentiles for vol regime detection
 *
 * Rules:
 * - Fast MA > Slow MA = bullish trend (BULL_TREND)
 * - Fast MA < Slow MA = bearish trend (BEAR_TREND)
 * - MAs converged + low vol = range-bound (RANGE)
 * - High volatility (>80th percentile) = HIGH_VOL
 * - Low volatility (<20th percentile) = LOW_VOL
 *
 * @see docs/plans/11-configuration.md
 */

import type { RegimeLabel, RuleBasedConfig } from "@cream/config";
import { type Candle, calculateATR, calculateSMA } from "@cream/indicators";

// ============================================
// Types
// ============================================

/**
 * Input data for regime classification.
 */
export interface RegimeInput {
  /** Recent price candles (oldest first) */
  candles: Candle[];
  /** Historical ATR values for percentile calculation */
  historicalAtr?: number[];
}

/**
 * Regime classification result.
 */
export interface RegimeClassification {
  /** Classified regime label */
  regime: RegimeLabel;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for the classification */
  reasoning: string;
  /** Supporting metrics */
  metrics: {
    fastMa: number;
    slowMa: number;
    maDiff: number;
    maDiffPct: number;
    currentAtr: number;
    atrPercentile: number;
  };
}

/**
 * Default configuration for rule-based classifier.
 */
export const DEFAULT_RULE_BASED_CONFIG: RuleBasedConfig = {
  trend_ma_fast: 20,
  trend_ma_slow: 50,
  volatility_percentile_high: 80,
  volatility_percentile_low: 20,
};

// ============================================
// Thresholds
// ============================================

/**
 * Threshold for MA convergence (as % of price).
 * MAs within this threshold are considered "converged" (range-bound).
 */
const MA_CONVERGENCE_THRESHOLD_PCT = 0.005; // 0.5%

/**
 * Threshold for strong trend (MA diff as % of price).
 */
const STRONG_TREND_THRESHOLD_PCT = 0.02; // 2%

// ============================================
// Main Classifier
// ============================================

/**
 * Classify market regime using rule-based logic.
 *
 * @param input - Candle data and historical ATR
 * @param config - Classifier configuration
 * @returns Regime classification with confidence and reasoning
 */
export function classifyRegime(
  input: RegimeInput,
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): RegimeClassification {
  const { candles, historicalAtr = [] } = input;

  // Calculate indicators
  const fastMaResults = calculateSMA(candles, { period: config.trend_ma_fast });
  const slowMaResults = calculateSMA(candles, { period: config.trend_ma_slow });
  const atrResults = calculateATR(candles, { period: 14 });

  // Get latest values
  const fastMa = fastMaResults[fastMaResults.length - 1]?.ma ?? 0;
  const slowMa = slowMaResults[slowMaResults.length - 1]?.ma ?? 0;
  const currentAtr = atrResults[atrResults.length - 1]?.atr ?? 0;
  const currentPrice = candles[candles.length - 1]?.close ?? 0;

  // Calculate MA difference
  const maDiff = fastMa - slowMa;
  const maDiffPct = currentPrice > 0 ? Math.abs(maDiff) / currentPrice : 0;

  // Calculate ATR percentile
  const allAtr = [...historicalAtr, currentAtr];
  const atrPercentile = calculatePercentile(allAtr, currentAtr);

  // Build metrics
  const metrics = {
    fastMa,
    slowMa,
    maDiff,
    maDiffPct,
    currentAtr,
    atrPercentile,
  };

  // Apply classification rules
  return applyRules(metrics, config);
}

/**
 * Apply classification rules based on calculated metrics.
 */
function applyRules(
  metrics: RegimeClassification["metrics"],
  config: RuleBasedConfig
): RegimeClassification {
  const { maDiff, maDiffPct, atrPercentile } = metrics;

  // Priority 1: High volatility (overrides trend)
  if (atrPercentile >= config.volatility_percentile_high) {
    return {
      regime: "HIGH_VOL",
      confidence: calculateConfidence(atrPercentile, config.volatility_percentile_high, 100),
      reasoning: `High volatility regime: ATR at ${atrPercentile.toFixed(0)}th percentile (threshold: ${config.volatility_percentile_high}th)`,
      metrics,
    };
  }

  // Priority 2: Low volatility (may indicate range or quiet market)
  if (atrPercentile <= config.volatility_percentile_low) {
    // If MAs are also converged, it's a range
    if (maDiffPct < MA_CONVERGENCE_THRESHOLD_PCT) {
      return {
        regime: "RANGE",
        confidence: calculateConfidence(config.volatility_percentile_low, atrPercentile, 0),
        reasoning: `Range-bound regime: Low volatility (${atrPercentile.toFixed(0)}th percentile) with converged MAs (diff: ${(maDiffPct * 100).toFixed(2)}%)`,
        metrics,
      };
    }
    return {
      regime: "LOW_VOL",
      confidence: calculateConfidence(config.volatility_percentile_low, atrPercentile, 0),
      reasoning: `Low volatility regime: ATR at ${atrPercentile.toFixed(0)}th percentile (threshold: ${config.volatility_percentile_low}th)`,
      metrics,
    };
  }

  // Priority 3: Trend detection
  if (maDiff > 0) {
    const trendStrength = maDiffPct / STRONG_TREND_THRESHOLD_PCT;
    return {
      regime: "BULL_TREND",
      confidence: Math.min(trendStrength, 1),
      reasoning: `Bullish trend: Fast MA (${metrics.fastMa.toFixed(2)}) > Slow MA (${metrics.slowMa.toFixed(2)}), diff: ${(maDiffPct * 100).toFixed(2)}%`,
      metrics,
    };
  }

  if (maDiff < 0) {
    const trendStrength = maDiffPct / STRONG_TREND_THRESHOLD_PCT;
    return {
      regime: "BEAR_TREND",
      confidence: Math.min(trendStrength, 1),
      reasoning: `Bearish trend: Fast MA (${metrics.fastMa.toFixed(2)}) < Slow MA (${metrics.slowMa.toFixed(2)}), diff: ${(maDiffPct * 100).toFixed(2)}%`,
      metrics,
    };
  }

  // Fallback: Range-bound
  return {
    regime: "RANGE",
    confidence: 0.5,
    reasoning: `Range-bound: MAs converged (diff: ${(maDiffPct * 100).toFixed(2)}%), normal volatility (${atrPercentile.toFixed(0)}th percentile)`,
    metrics,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate percentile rank of a value in a sorted array.
 */
function calculatePercentile(values: number[], target: number): number {
  if (values.length === 0) {
    return 50; // Default to middle
  }
  if (values.length === 1) {
    return 50; // Single element, no comparison possible
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = sorted.filter((v) => v < target).length;
  return (index / sorted.length) * 100;
}

/**
 * Calculate confidence score based on how far the value is from threshold.
 */
function calculateConfidence(value: number, threshold: number, extreme: number): number {
  if (extreme === threshold) {
    return 1;
  }
  const distance = Math.abs(value - threshold);
  const maxDistance = Math.abs(extreme - threshold);
  return Math.min(distance / maxDistance, 1);
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a rule-based classifier function with bound config.
 */
export function createRuleBasedClassifier(
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): (input: RegimeInput) => RegimeClassification {
  return (input: RegimeInput) => classifyRegime(input, config);
}

/**
 * Get the minimum number of candles required for classification.
 *
 * @param config - Classifier configuration
 * @returns Minimum candle count
 */
export function getRequiredCandleCount(
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): number {
  // Need enough candles for slow MA + ATR period
  return Math.max(config.trend_ma_slow, 14) + 1;
}

/**
 * Check if enough data is available for classification.
 */
export function hasEnoughData(
  candles: Candle[],
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): boolean {
  return candles.length >= getRequiredCandleCount(config);
}
