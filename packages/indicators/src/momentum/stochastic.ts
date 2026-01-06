/**
 * Stochastic Oscillator Indicator
 *
 * Developed by George Lane (1950s)
 * Compares closing price to price range over a period.
 *
 * Formula:
 *   %K = 100 * (Close - Lowest Low) / (Highest High - Lowest Low)
 *   %D = SMA of %K over D period
 *
 * Slow Stochastic:
 *   Slow %K = Fast %D (smoothed %K)
 *   Slow %D = SMA of Slow %K
 *
 * Interpretation:
 *   - > 80: Overbought
 *   - < 20: Oversold
 *   - Crossovers: %K crossing %D signals trend changes
 *
 * @see https://www.investopedia.com/terms/s/stochasticoscillator.asp
 */

import {
  type Candle,
  type IndicatorCalculator,
  type StochasticParams,
  type StochasticResult,
  validateCandleCount,
} from "../types";

/**
 * Default Stochastic parameters.
 */
export const STOCHASTIC_DEFAULTS: StochasticParams = {
  kPeriod: 14,
  dPeriod: 3,
  slow: true,
};

/**
 * Stochastic overbought/oversold thresholds.
 */
export const STOCHASTIC_OVERBOUGHT = 80;
export const STOCHASTIC_OVERSOLD = 20;

/**
 * Calculate Simple Moving Average of an array.
 */
function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Calculate Fast Stochastic %K values.
 */
function calculateFastK(candles: Candle[], kPeriod: number): number[] {
  const kValues: number[] = [];

  for (let i = kPeriod - 1; i < candles.length; i++) {
    // Get the window of candles for this period
    const window = candles.slice(i - kPeriod + 1, i + 1);

    // Find highest high and lowest low in the window
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (const candle of window) {
      if (candle.high > highestHigh) {
        highestHigh = candle.high;
      }
      if (candle.low < lowestLow) {
        lowestLow = candle.low;
      }
    }

    // Calculate %K
    const range = highestHigh - lowestLow;
    const currentCandle = candles[i];
    const k =
      range === 0 || !currentCandle ? 50 : ((currentCandle.close - lowestLow) / range) * 100;

    kValues.push(k);
  }

  return kValues;
}

/**
 * Calculate Stochastic oscillator for a series of candles.
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - Stochastic parameters
 * @returns Array of Stochastic results
 */
export function calculateStochastic(
  candles: Candle[],
  params: StochasticParams = STOCHASTIC_DEFAULTS
): StochasticResult[] {
  const { kPeriod, dPeriod, slow } = params;
  const required = stochasticRequiredPeriods(params);

  validateCandleCount("Stochastic", candles, required);

  const results: StochasticResult[] = [];

  // Calculate Fast %K values
  const fastK = calculateFastK(candles, kPeriod);

  if (slow) {
    // Slow Stochastic: Smooth %K first, then calculate %D
    // Slow %K = SMA of Fast %K (this is the same as Fast %D)
    const slowK: number[] = [];

    for (let i = dPeriod - 1; i < fastK.length; i++) {
      const window = fastK.slice(i - dPeriod + 1, i + 1);
      slowK.push(window.reduce((a, b) => a + b, 0) / dPeriod);
    }

    // Slow %D = SMA of Slow %K
    for (let i = dPeriod - 1; i < slowK.length; i++) {
      const k = slowK[i] ?? 0;
      const d = sma(slowK.slice(0, i + 1), dPeriod);

      // Calculate timestamp index in original candles
      // fastK starts at index (kPeriod - 1)
      // slowK starts at index (dPeriod - 1) of fastK
      // slowD starts at index (dPeriod - 1) of slowK
      const candleIndex = kPeriod - 1 + (dPeriod - 1) + (dPeriod - 1) + (i - (dPeriod - 1));

      const candle = candles[candleIndex];
      if (candle) {
        results.push({
          timestamp: candle.timestamp,
          k,
          d,
        });
      }
    }
  } else {
    // Fast Stochastic: Use raw %K and SMA of %K for %D
    for (let i = dPeriod - 1; i < fastK.length; i++) {
      const k = fastK[i] ?? 0;
      const d = sma(fastK.slice(0, i + 1), dPeriod);

      // Calculate timestamp index
      const candleIndex = kPeriod - 1 + i;

      const candle = candles[candleIndex];
      if (candle) {
        results.push({
          timestamp: candle.timestamp,
          k,
          d,
        });
      }
    }
  }

  return results;
}

/**
 * Get the minimum number of candles required for Stochastic calculation.
 */
export function stochasticRequiredPeriods(params: StochasticParams = STOCHASTIC_DEFAULTS): number {
  const { kPeriod, dPeriod, slow } = params;

  if (slow) {
    // Fast %K needs kPeriod candles
    // Slow %K (Fast %D) needs dPeriod Fast %K values
    // Slow %D needs dPeriod Slow %K values
    return kPeriod + dPeriod - 1 + dPeriod - 1;
  }

  // Fast Stochastic: %K needs kPeriod, %D needs dPeriod %K values
  return kPeriod + dPeriod - 1;
}

/**
 * Check if Stochastic indicates overbought condition.
 */
export function isStochasticOverbought(k: number, threshold = STOCHASTIC_OVERBOUGHT): boolean {
  return k >= threshold;
}

/**
 * Check if Stochastic indicates oversold condition.
 */
export function isStochasticOversold(k: number, threshold = STOCHASTIC_OVERSOLD): boolean {
  return k <= threshold;
}

/**
 * Check for bullish crossover (%K crosses above %D).
 */
export function isBullishCrossover(
  prevK: number,
  prevD: number,
  currK: number,
  currD: number
): boolean {
  return prevK <= prevD && currK > currD;
}

/**
 * Check for bearish crossover (%K crosses below %D).
 */
export function isBearishCrossover(
  prevK: number,
  prevD: number,
  currK: number,
  currD: number
): boolean {
  return prevK >= prevD && currK < currD;
}

/**
 * Stochastic Calculator implementation.
 */
export const stochasticCalculator: IndicatorCalculator<StochasticParams, StochasticResult> = {
  calculate: calculateStochastic,
  requiredPeriods: stochasticRequiredPeriods,
};

export default stochasticCalculator;
