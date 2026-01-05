/**
 * SMA (Simple Moving Average) Indicator
 *
 * Equal-weighted average of closing prices over a period.
 * The most basic trend indicator.
 *
 * Formula:
 *   SMA = (P1 + P2 + ... + Pn) / n
 *
 * Common periods:
 *   - 20: Short-term trend
 *   - 50: Medium-term trend
 *   - 200: Long-term trend (institutional benchmark)
 *
 * Interpretation:
 *   - Price above SMA: Bullish
 *   - Price below SMA: Bearish
 *   - SMA crossovers: Golden cross (bullish), Death cross (bearish)
 *
 * @see https://www.investopedia.com/terms/s/sma.asp
 */

import {
  type Candle,
  type MAParams,
  type MAResult,
  type IndicatorCalculator,
  validateCandleCount,
} from "../types.js";

/**
 * Common SMA periods.
 */
export const SMA_PERIODS = {
  SHORT: 20,
  MEDIUM: 50,
  LONG: 200,
} as const;

/**
 * Default SMA parameters.
 */
export const SMA_DEFAULTS: MAParams = {
  period: SMA_PERIODS.SHORT,
};

/**
 * Calculate SMA for a series of candles.
 *
 * Uses sliding window for efficient calculation.
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - SMA parameters
 * @returns Array of SMA results
 */
export function calculateSMA(
  candles: Candle[],
  params: MAParams = SMA_DEFAULTS
): MAResult[] {
  const { period } = params;

  validateCandleCount("SMA", candles, period);

  const results: MAResult[] = [];

  // Calculate initial sum for first window
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }

  // First SMA value
  results.push({
    timestamp: candles[period - 1].timestamp,
    ma: sum / period,
  });

  // Calculate remaining SMA values using sliding window
  for (let i = period; i < candles.length; i++) {
    // Remove oldest, add newest
    sum = sum - candles[i - period].close + candles[i].close;

    results.push({
      timestamp: candles[i].timestamp,
      ma: sum / period,
    });
  }

  return results;
}

/**
 * Get the minimum number of candles required for SMA calculation.
 */
export function smaRequiredPeriods(params: MAParams = SMA_DEFAULTS): number {
  return params.period;
}

/**
 * Calculate multiple SMAs at once (e.g., 20, 50, 200).
 */
export function calculateMultipleSMAs(
  candles: Candle[],
  periods: number[]
): Map<number, MAResult[]> {
  const results = new Map<number, MAResult[]>();

  for (const period of periods) {
    if (candles.length >= period) {
      results.set(period, calculateSMA(candles, { period }));
    }
  }

  return results;
}

/**
 * Check for golden cross (short SMA crosses above long SMA).
 */
export function isGoldenCross(
  prevShort: number,
  prevLong: number,
  currShort: number,
  currLong: number
): boolean {
  return prevShort <= prevLong && currShort > currLong;
}

/**
 * Check for death cross (short SMA crosses below long SMA).
 */
export function isDeathCross(
  prevShort: number,
  prevLong: number,
  currShort: number,
  currLong: number
): boolean {
  return prevShort >= prevLong && currShort < currLong;
}

/**
 * SMA Calculator implementation.
 */
export const smaCalculator: IndicatorCalculator<MAParams, MAResult> = {
  calculate: calculateSMA,
  requiredPeriods: smaRequiredPeriods,
};

export default smaCalculator;
