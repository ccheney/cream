/**
 * ATR (Average True Range) Indicator
 *
 * Developed by J. Welles Wilder (1978)
 * Measures market volatility (non-directional).
 *
 * Formula:
 *   True Range = max(
 *     High - Low,
 *     |High - Previous Close|,
 *     |Low - Previous Close|
 *   )
 *   ATR = Wilder's Smoothed Average of True Range
 *
 * Interpretation:
 *   - Higher ATR = Higher volatility
 *   - Used for stop-loss placement (e.g., 2x ATR)
 *   - Position sizing (smaller positions in high ATR)
 *
 * @see https://www.investopedia.com/terms/a/atr.asp
 */

import {
  type ATRParams,
  type ATRResult,
  type Candle,
  type IndicatorCalculator,
  validateCandleCount,
} from "../types";

/**
 * Default ATR parameters (Wilder's standard).
 */
export const ATR_DEFAULTS: ATRParams = {
  period: 14,
};

/**
 * Calculate True Range for a single candle.
 *
 * @param candle - Current candle
 * @param prevClose - Previous candle's close price
 * @returns True Range value
 */
export function calculateTrueRange(candle: Candle, prevClose: number): number {
  const highLow = candle.high - candle.low;
  const highPrevClose = Math.abs(candle.high - prevClose);
  const lowPrevClose = Math.abs(candle.low - prevClose);

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate ATR for a series of candles.
 *
 * Uses Wilder's smoothing method (same as RSI).
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - ATR parameters
 * @returns Array of ATR results
 */
export function calculateATR(candles: Candle[], params: ATRParams = ATR_DEFAULTS): ATRResult[] {
  const { period } = params;
  const required = period + 1; // Need period + 1 for first ATR value

  validateCandleCount("ATR", candles, required);

  const results: ATRResult[] = [];

  // Calculate True Range values
  const trueRanges: number[] = [];

  // First TR uses just High - Low (no previous close)
  const firstCandle = candles[0];
  if (firstCandle) {
    trueRanges.push(firstCandle.high - firstCandle.low);
  }

  // Calculate TR for remaining candles
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    if (curr && prev) {
      trueRanges.push(calculateTrueRange(curr, prev.close));
    }
  }

  // Calculate first ATR (simple average of first period TR values)
  let atr = trueRanges.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;

  // First ATR value
  const periodCandle = candles[period];
  if (periodCandle) {
    results.push({
      timestamp: periodCandle.timestamp,
      atr,
    });
  }

  // Calculate subsequent ATR values using Wilder's smoothing
  for (let i = period + 1; i < candles.length; i++) {
    // Wilder's smoothing: ((prevATR * (period - 1)) + currentTR) / period
    atr = (atr * (period - 1) + (trueRanges[i] ?? 0)) / period;

    const candle = candles[i];
    if (candle) {
      results.push({
        timestamp: candle.timestamp,
        atr,
      });
    }
  }

  return results;
}

/**
 * Get the minimum number of candles required for ATR calculation.
 */
export function atrRequiredPeriods(params: ATRParams = ATR_DEFAULTS): number {
  return params.period + 1;
}

/**
 * Calculate stop-loss distance based on ATR.
 *
 * @param atr - Current ATR value
 * @param multiplier - ATR multiplier (e.g., 2.0 for 2x ATR)
 * @returns Stop-loss distance
 */
export function calculateATRStop(atr: number, multiplier = 2.0): number {
  return atr * multiplier;
}

/**
 * Calculate position size based on risk and ATR.
 *
 * @param equity - Account equity
 * @param riskPercent - Risk per trade as decimal (e.g., 0.01 for 1%)
 * @param atr - Current ATR value
 * @param atrMultiplier - ATR multiplier for stop distance
 * @param price - Current price
 * @returns Recommended position size (shares/contracts)
 */
export function calculateATRPositionSize(
  equity: number,
  riskPercent: number,
  atr: number,
  atrMultiplier: number,
  _price: number
): number {
  const riskAmount = equity * riskPercent;
  const stopDistance = atr * atrMultiplier;

  // Position size = Risk Amount / Stop Distance
  return Math.floor(riskAmount / stopDistance);
}

/**
 * ATR Calculator implementation.
 */
export const atrCalculator: IndicatorCalculator<ATRParams, ATRResult> = {
  calculate: calculateATR,
  requiredPeriods: atrRequiredPeriods,
};

export default atrCalculator;
