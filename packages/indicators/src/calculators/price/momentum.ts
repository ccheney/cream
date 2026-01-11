/**
 * Momentum Calculator
 *
 * Momentum measures the rate of change in price over a specified period.
 * Simple yet effective indicator for trend strength and direction.
 *
 * Formulas:
 * - Simple Momentum: Close - Close[n periods ago]
 * - Rate of Change (ROC): ((Close - Close[n]) / Close[n]) × 100
 *
 * Interpretation:
 * - Positive momentum: Uptrend
 * - Negative momentum: Downtrend
 * - Momentum divergence: Potential reversal
 *
 * Common periods:
 * - 1 month (~21 trading days)
 * - 3 months (~63 trading days)
 * - 6 months (~126 trading days)
 * - 12 months (~252 trading days)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

// ============================================================
// TYPES
// ============================================================

export interface MomentumResult {
  /** Absolute momentum (price change) */
  momentum: number;
  /** Rate of Change as percentage */
  roc: number;
  /** Period used */
  period: number;
  /** Starting price */
  startPrice: number;
  /** Ending price */
  endPrice: number;
  /** Timestamp */
  timestamp: number;
}

export interface MultiPeriodMomentum {
  /** Momentum results by period (in trading days) */
  byPeriod: Map<number, MomentumResult>;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate momentum for a single period
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period
 * @returns Momentum result or null
 *
 * @example
 * ```typescript
 * const bars = [...]; // 22+ bars
 * const result = calculateMomentum(bars, 21);
 * // result.momentum = 5.25 (price increased $5.25)
 * // result.roc = 3.5 (3.5% return)
 * ```
 */
export function calculateMomentum(bars: OHLCVBar[], period: number): MomentumResult | null {
  if (bars.length < period + 1 || period <= 0) {
    return null;
  }

  const endBar = bars[bars.length - 1];
  const startBar = bars[bars.length - 1 - period];

  if (!endBar || !startBar) {
    return null;
  }

  const endPrice = endBar.close;
  const startPrice = startBar.close;

  if (startPrice <= 0) {
    return null;
  }

  const momentum = endPrice - startPrice;
  const roc = ((endPrice - startPrice) / startPrice) * 100;

  return {
    momentum,
    roc,
    period,
    startPrice,
    endPrice,
    timestamp: endBar.timestamp,
  };
}

/**
 * Calculate momentum series
 */
export function calculateMomentumSeries(bars: OHLCVBar[], period: number): MomentumResult[] {
  const results: MomentumResult[] = [];

  if (bars.length < period + 1 || period <= 0) {
    return results;
  }

  for (let i = period; i < bars.length; i++) {
    const endBar = bars[i];
    const startBar = bars[i - period];

    if (!endBar || !startBar || startBar.close <= 0) {
      continue;
    }

    const momentum = endBar.close - startBar.close;
    const roc = ((endBar.close - startBar.close) / startBar.close) * 100;

    results.push({
      momentum,
      roc,
      period,
      startPrice: startBar.close,
      endPrice: endBar.close,
      timestamp: endBar.timestamp,
    });
  }

  return results;
}

/**
 * Calculate momentum for standard periods
 *
 * Standard periods (in trading days):
 * - 1 month: 21
 * - 3 months: 63
 * - 6 months: 126
 * - 12 months: 252
 *
 * @param bars - OHLCV bars (oldest first)
 * @returns Multi-period momentum results
 */
export function calculateMultiPeriodMomentum(bars: OHLCVBar[]): MultiPeriodMomentum | null {
  const standardPeriods = [21, 63, 126, 252];
  const byPeriod = new Map<number, MomentumResult>();

  for (const period of standardPeriods) {
    const result = calculateMomentum(bars, period);
    if (result) {
      byPeriod.set(period, result);
    }
  }

  if (byPeriod.size === 0) {
    return null;
  }

  const lastBar = bars[bars.length - 1];

  return {
    byPeriod,
    timestamp: lastBar?.timestamp ?? Date.now(),
  };
}

/**
 * Calculate momentum with custom periods
 */
export function calculateCustomMomentumPeriods(
  bars: OHLCVBar[],
  periods: number[]
): MultiPeriodMomentum | null {
  const byPeriod = new Map<number, MomentumResult>();

  for (const period of periods) {
    const result = calculateMomentum(bars, period);
    if (result) {
      byPeriod.set(period, result);
    }
  }

  if (byPeriod.size === 0) {
    return null;
  }

  const lastBar = bars[bars.length - 1];

  return {
    byPeriod,
    timestamp: lastBar?.timestamp ?? Date.now(),
  };
}

/**
 * Classify momentum strength
 */
export type MomentumStrength =
  | "strong_bullish"
  | "bullish"
  | "weak_bullish"
  | "neutral"
  | "weak_bearish"
  | "bearish"
  | "strong_bearish";

/**
 * Classify momentum based on ROC
 *
 * @param roc - Rate of change percentage
 * @returns Momentum classification
 */
export function classifyMomentum(roc: number): MomentumStrength {
  if (roc > 20) {
    return "strong_bullish";
  }
  if (roc > 10) {
    return "bullish";
  }
  if (roc > 3) {
    return "weak_bullish";
  }
  if (roc >= -3) {
    return "neutral";
  }
  if (roc >= -10) {
    return "weak_bearish";
  }
  if (roc >= -20) {
    return "bearish";
  }
  return "strong_bearish";
}

/**
 * Detect momentum trend consistency
 *
 * Checks if all periods show consistent direction
 */
export function detectMomentumTrend(
  multiPeriod: MultiPeriodMomentum
): "uptrend" | "downtrend" | "mixed" {
  const values = Array.from(multiPeriod.byPeriod.values());

  if (values.length === 0) {
    return "mixed";
  }

  const allPositive = values.every((r) => r.roc > 0);
  const allNegative = values.every((r) => r.roc < 0);

  if (allPositive) {
    return "uptrend";
  }
  if (allNegative) {
    return "downtrend";
  }
  return "mixed";
}

/**
 * Calculate momentum acceleration
 *
 * Compares short-term momentum to long-term momentum
 *
 * @param shortTermRoc - Short-term ROC (e.g., 1-month)
 * @param longTermRoc - Long-term ROC (e.g., 3-month)
 * @returns Acceleration indicator
 */
export function calculateMomentumAcceleration(
  shortTermRoc: number,
  longTermRoc: number
): "accelerating" | "decelerating" | "stable" {
  // Acceleration = short-term momentum > long-term momentum (in same direction)

  if (shortTermRoc > 0 && longTermRoc > 0) {
    if (shortTermRoc > longTermRoc * 1.2) {
      return "accelerating";
    }
    if (shortTermRoc < longTermRoc * 0.8) {
      return "decelerating";
    }
  }

  if (shortTermRoc < 0 && longTermRoc < 0) {
    if (shortTermRoc < longTermRoc * 1.2) {
      return "accelerating";
    }
    if (shortTermRoc > longTermRoc * 0.8) {
      return "decelerating";
    }
  }

  return "stable";
}

/**
 * Calculate momentum score (normalized -100 to +100)
 *
 * Combines multiple momentum periods into a single score
 */
export function calculateMomentumScore(multiPeriod: MultiPeriodMomentum): number | null {
  const periods = [21, 63, 126, 252];
  const weights = [0.4, 0.3, 0.2, 0.1]; // Weight short-term more heavily

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const weight = weights[i];
    if (period === undefined || weight === undefined) {
      continue;
    }

    const result = multiPeriod.byPeriod.get(period);
    if (result) {
      // Normalize ROC to -100 to +100 range (assuming ±50% is extreme)
      const normalizedRoc = Math.max(-100, Math.min(100, result.roc * 2));
      weightedSum += normalizedRoc * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    return null;
  }

  return weightedSum / totalWeight;
}
