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
import { calculateATR, calculateSMA, type OHLCVBar } from "@cream/indicators";

export interface RegimeInput {
  /** Recent price candles (oldest first) */
  candles: OHLCVBar[];
  /** Historical ATR values for percentile calculation */
  historicalAtr?: number[];
}

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

export const DEFAULT_RULE_BASED_CONFIG: RuleBasedConfig = {
  trend_ma_fast: 20,
  trend_ma_slow: 50,
  volatility_percentile_high: 80,
  volatility_percentile_low: 20,
};

/**
 * Threshold for MA convergence (as % of price).
 * MAs within this threshold are considered "converged" (range-bound).
 */
const MA_CONVERGENCE_THRESHOLD_PCT = 0.005; // 0.5%

/**
 * Threshold for strong trend (MA diff as % of price).
 */
const STRONG_TREND_THRESHOLD_PCT = 0.02; // 2%

export function classifyRegime(
  input: RegimeInput,
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): RegimeClassification {
  const { candles, historicalAtr = [] } = input;

  const fastMa = calculateSMA(candles, config.trend_ma_fast) ?? 0;
  const slowMa = calculateSMA(candles, config.trend_ma_slow) ?? 0;
  const currentAtr = calculateATR(candles, 14) ?? 0;
  const currentPrice = candles[candles.length - 1]?.close ?? 0;

  const maDiff = fastMa - slowMa;
  const maDiffPct = currentPrice > 0 ? Math.abs(maDiff) / currentPrice : 0;

  const allAtr = [...historicalAtr, currentAtr];
  const atrPercentile = calculatePercentile(allAtr, currentAtr);

  const metrics = {
    fastMa,
    slowMa,
    maDiff,
    maDiffPct,
    currentAtr,
    atrPercentile,
  };

  return applyRules(metrics, config);
}

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

function calculatePercentile(values: number[], target: number): number {
  if (values.length === 0) {
    return 50; // Default to middle
  }
  if (values.length === 1) {
    return 50; // Single element, no comparison possible
  }

  const sorted = values.toSorted((a, b) => a - b);
  const index = sorted.filter((v) => v < target).length;
  return (index / sorted.length) * 100;
}

function calculateConfidence(value: number, threshold: number, extreme: number): number {
  if (extreme === threshold) {
    return 1;
  }
  const distance = Math.abs(value - threshold);
  const maxDistance = Math.abs(extreme - threshold);
  return Math.min(distance / maxDistance, 1);
}

export function createRuleBasedClassifier(
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): (input: RegimeInput) => RegimeClassification {
  return (input: RegimeInput) => classifyRegime(input, config);
}

export function getRequiredCandleCount(
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): number {
  // Need enough candles for slow MA + ATR period
  return Math.max(config.trend_ma_slow, 14) + 1;
}

export function hasEnoughData(
  candles: OHLCVBar[],
  config: RuleBasedConfig = DEFAULT_RULE_BASED_CONFIG
): boolean {
  return candles.length >= getRequiredCandleCount(config);
}
