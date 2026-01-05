/**
 * Bollinger Bands Indicator
 *
 * Developed by John Bollinger (1980s)
 * Volatility bands placed above and below a moving average.
 *
 * Formula:
 *   Middle Band = SMA(period)
 *   Upper Band = Middle Band + (stdDev * σ)
 *   Lower Band = Middle Band - (stdDev * σ)
 *   σ = Standard Deviation of closing prices over period
 *
 * Additional metrics:
 *   Bandwidth = (Upper - Lower) / Middle * 100
 *   %B = (Price - Lower) / (Upper - Lower)
 *
 * Interpretation:
 *   - Price touching upper band: Potentially overbought
 *   - Price touching lower band: Potentially oversold
 *   - Narrowing bands: Low volatility (squeeze)
 *   - Expanding bands: High volatility (breakout potential)
 *
 * @see https://www.investopedia.com/terms/b/bollingerbands.asp
 */

import {
  type Candle,
  type BollingerBandsParams,
  type BollingerBandsResult,
  type IndicatorCalculator,
  validateCandleCount,
} from "../types";

/**
 * Default Bollinger Bands parameters (John Bollinger's standard).
 */
export const BOLLINGER_DEFAULTS: BollingerBandsParams = {
  period: 20,
  stdDev: 2.0,
};

/**
 * Calculate standard deviation of an array of numbers.
 */
function calculateStdDev(values: number[], mean: number): number {
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate Bollinger Bands for a series of candles.
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - Bollinger Bands parameters
 * @returns Array of Bollinger Bands results
 */
export function calculateBollingerBands(
  candles: Candle[],
  params: BollingerBandsParams = BOLLINGER_DEFAULTS
): BollingerBandsResult[] {
  const { period, stdDev } = params;

  validateCandleCount("BollingerBands", candles, period);

  const results: BollingerBandsResult[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    // Get closing prices for the window
    const windowStart = i - period + 1;
    const closes = candles.slice(windowStart, i + 1).map((c) => c.close);

    // Calculate SMA (middle band)
    const middle = closes.reduce((a, b) => a + b, 0) / period;

    // Calculate standard deviation
    const sigma = calculateStdDev(closes, middle);

    // Calculate bands
    const upper = middle + stdDev * sigma;
    const lower = middle - stdDev * sigma;

    // Calculate bandwidth (as percentage of middle)
    const bandwidth = ((upper - lower) / middle) * 100;

    // Calculate %B (position within bands)
    const range = upper - lower;
    const percentB = range === 0 ? 0.5 : (candles[i].close - lower) / range;

    results.push({
      timestamp: candles[i].timestamp,
      upper,
      middle,
      lower,
      bandwidth,
      percentB,
    });
  }

  return results;
}

/**
 * Get the minimum number of candles required for Bollinger Bands calculation.
 */
export function bollingerRequiredPeriods(
  params: BollingerBandsParams = BOLLINGER_DEFAULTS
): number {
  return params.period;
}

/**
 * Check if price is touching or above upper band.
 */
export function isTouchingUpperBand(
  price: number,
  upperBand: number,
  tolerance = 0
): boolean {
  return price >= upperBand - tolerance;
}

/**
 * Check if price is touching or below lower band.
 */
export function isTouchingLowerBand(
  price: number,
  lowerBand: number,
  tolerance = 0
): boolean {
  return price <= lowerBand + tolerance;
}

/**
 * Check for Bollinger Band squeeze (low volatility).
 *
 * @param bandwidth - Current bandwidth
 * @param threshold - Bandwidth threshold for squeeze (default: 4%)
 */
export function isBollingerSqueeze(
  bandwidth: number,
  threshold = 4.0
): boolean {
  return bandwidth < threshold;
}

/**
 * Check for Bollinger Band expansion (high volatility).
 *
 * @param bandwidth - Current bandwidth
 * @param threshold - Bandwidth threshold for expansion (default: 10%)
 */
export function isBollingerExpansion(
  bandwidth: number,
  threshold = 10.0
): boolean {
  return bandwidth > threshold;
}

/**
 * Get signal based on %B value.
 *
 * @param percentB - Current %B value
 * @returns 'overbought' | 'oversold' | 'neutral'
 */
export function getBollingerSignal(
  percentB: number
): "overbought" | "oversold" | "neutral" {
  if (percentB > 1) return "overbought";
  if (percentB < 0) return "oversold";
  return "neutral";
}

/**
 * Bollinger Bands Calculator implementation.
 */
export const bollingerCalculator: IndicatorCalculator<
  BollingerBandsParams,
  BollingerBandsResult
> = {
  calculate: calculateBollingerBands,
  requiredPeriods: bollingerRequiredPeriods,
};

export default bollingerCalculator;
