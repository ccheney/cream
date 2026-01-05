/**
 * EMA (Exponential Moving Average) Indicator
 *
 * Weighted moving average giving more weight to recent prices.
 * More responsive to recent price changes than SMA.
 *
 * Formula:
 *   Multiplier = 2 / (period + 1)
 *   EMA = (Close - Previous EMA) * Multiplier + Previous EMA
 *   First EMA = SMA of first N periods
 *
 * Common periods:
 *   - 9: Very short-term (scalping)
 *   - 12, 26: MACD components
 *   - 21: Short-term swing trading
 *
 * Interpretation:
 *   - Faster response to price changes than SMA
 *   - Used in MACD, Triple EMA, etc.
 *   - Good for trending markets
 *
 * @see https://www.investopedia.com/terms/e/ema.asp
 */

import {
  type Candle,
  type IndicatorCalculator,
  type MAParams,
  type MAResult,
  validateCandleCount,
} from "../types";

/**
 * Common EMA periods.
 */
export const EMA_PERIODS = {
  SCALP: 9,
  MACD_FAST: 12,
  SHORT: 21,
  MACD_SLOW: 26,
} as const;

/**
 * Default EMA parameters.
 */
export const EMA_DEFAULTS: MAParams = {
  period: EMA_PERIODS.SHORT,
};

/**
 * Calculate EMA multiplier (smoothing factor).
 */
export function calculateMultiplier(period: number): number {
  return 2 / (period + 1);
}

/**
 * Calculate EMA for a series of candles.
 *
 * First EMA value is seeded with SMA of the first N periods.
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - EMA parameters
 * @returns Array of EMA results
 */
export function calculateEMA(candles: Candle[], params: MAParams = EMA_DEFAULTS): MAResult[] {
  const { period } = params;

  validateCandleCount("EMA", candles, period);

  const results: MAResult[] = [];
  const multiplier = calculateMultiplier(period);

  // Calculate initial SMA for seeding EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;

  // First EMA value (seeded with SMA)
  results.push({
    timestamp: candles[period - 1].timestamp,
    ma: ema,
  });

  // Calculate remaining EMA values
  for (let i = period; i < candles.length; i++) {
    // EMA = (Close - Previous EMA) * Multiplier + Previous EMA
    ema = (candles[i].close - ema) * multiplier + ema;

    results.push({
      timestamp: candles[i].timestamp,
      ma: ema,
    });
  }

  return results;
}

/**
 * Get the minimum number of candles required for EMA calculation.
 */
export function emaRequiredPeriods(params: MAParams = EMA_DEFAULTS): number {
  return params.period;
}

/**
 * Calculate multiple EMAs at once (e.g., 9, 21).
 */
export function calculateMultipleEMAs(
  candles: Candle[],
  periods: number[]
): Map<number, MAResult[]> {
  const results = new Map<number, MAResult[]>();

  for (const period of periods) {
    if (candles.length >= period) {
      results.set(period, calculateEMA(candles, { period }));
    }
  }

  return results;
}

/**
 * Calculate MACD using two EMAs.
 * MACD = EMA(12) - EMA(26)
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26
): Array<{ timestamp: number; macd: number }> {
  const required = Math.max(fastPeriod, slowPeriod);
  validateCandleCount("MACD", candles, required);

  const fastEMA = calculateEMA(candles, { period: fastPeriod });
  const slowEMA = calculateEMA(candles, { period: slowPeriod });

  const results: Array<{ timestamp: number; macd: number }> = [];

  // MACD starts when both EMAs have values
  // slowEMA starts at index (slowPeriod - fastPeriod) relative to fastEMA
  const offset = slowPeriod - fastPeriod;

  for (let i = 0; i < slowEMA.length; i++) {
    const fastIdx = i + offset;
    if (fastIdx < fastEMA.length) {
      results.push({
        timestamp: slowEMA[i].timestamp,
        macd: fastEMA[fastIdx].ma - slowEMA[i].ma,
      });
    }
  }

  return results;
}

/**
 * EMA Calculator implementation.
 */
export const emaCalculator: IndicatorCalculator<MAParams, MAResult> = {
  calculate: calculateEMA,
  requiredPeriods: emaRequiredPeriods,
};

export default emaCalculator;
