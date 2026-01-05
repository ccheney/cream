/**
 * RSI (Relative Strength Index) Indicator
 *
 * Developed by J. Welles Wilder (1978)
 * Measures momentum by comparing magnitude of recent gains to recent losses.
 *
 * Formula:
 *   RSI = 100 - (100 / (1 + RS))
 *   RS = Average Gain / Average Loss
 *
 * Interpretation:
 *   - > 70: Overbought (potential reversal down)
 *   - < 30: Oversold (potential reversal up)
 *   - 50: Neutral
 *
 * @see https://www.investopedia.com/terms/r/rsi.asp
 */

import {
  type Candle,
  type RSIParams,
  type RSIResult,
  type IndicatorCalculator,
  validateCandleCount,
} from "../types";

/**
 * Default RSI parameters.
 */
export const RSI_DEFAULTS: RSIParams = {
  period: 14,
};

/**
 * RSI overbought/oversold thresholds.
 */
export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;

/**
 * Calculate RSI for a series of candles.
 *
 * Uses Wilder's smoothing method (exponential moving average).
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - RSI parameters
 * @returns Array of RSI results
 */
export function calculateRSI(
  candles: Candle[],
  params: RSIParams = RSI_DEFAULTS
): RSIResult[] {
  const { period } = params;
  const required = period + 1; // Need period + 1 for first RSI value

  validateCandleCount("RSI", candles, required);

  const results: RSIResult[] = [];

  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  // Separate gains and losses
  const gains: number[] = changes.map((change) => (change > 0 ? change : 0));
  const losses: number[] = changes.map((change) => (change < 0 ? -change : 0));

  // Calculate first average gain and loss (simple average for initial value)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // First RSI value
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const firstRSI = avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRS);

  results.push({
    timestamp: candles[period].timestamp,
    rsi: firstRSI,
  });

  // Calculate subsequent RSI values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    // Wilder's smoothing: (prev * (period - 1) + current) / period
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    results.push({
      timestamp: candles[i + 1].timestamp,
      rsi,
    });
  }

  return results;
}

/**
 * Get the minimum number of candles required for RSI calculation.
 */
export function rsiRequiredPeriods(params: RSIParams = RSI_DEFAULTS): number {
  return params.period + 1;
}

/**
 * Check if RSI indicates overbought condition.
 */
export function isOverbought(rsi: number, threshold = RSI_OVERBOUGHT): boolean {
  return rsi >= threshold;
}

/**
 * Check if RSI indicates oversold condition.
 */
export function isOversold(rsi: number, threshold = RSI_OVERSOLD): boolean {
  return rsi <= threshold;
}

/**
 * RSI Calculator implementation.
 */
export const rsiCalculator: IndicatorCalculator<RSIParams, RSIResult> = {
  calculate: calculateRSI,
  requiredPeriods: rsiRequiredPeriods,
};

export default rsiCalculator;
