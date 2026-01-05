/**
 * Volume SMA (Volume Simple Moving Average) Indicator
 *
 * Simple moving average of trading volume.
 * Used to identify unusual volume activity.
 *
 * Formula:
 *   Volume SMA = (V1 + V2 + ... + Vn) / n
 *   Volume Ratio = Current Volume / Volume SMA
 *
 * Interpretation:
 *   - Volume Ratio > 1.5: High volume (confirm breakouts)
 *   - Volume Ratio < 0.5: Low volume (potential false moves)
 *   - Volume increasing with price: Trend confirmation
 *   - Volume decreasing with price: Potential reversal
 *
 * @see https://www.investopedia.com/terms/v/volume.asp
 */

import {
  type Candle,
  type IndicatorCalculator,
  type VolumeSMAParams,
  type VolumeSMAResult,
  validateCandleCount,
} from "../types";

/**
 * Default Volume SMA parameters.
 */
export const VOLUME_SMA_DEFAULTS: VolumeSMAParams = {
  period: 20,
};

/**
 * Volume significance thresholds.
 */
export const VOLUME_THRESHOLDS = {
  HIGH: 1.5, // Volume 50% above average
  LOW: 0.5, // Volume 50% below average
  VERY_HIGH: 2.0, // Volume 100% above average
  VERY_LOW: 0.25, // Volume 75% below average
} as const;

/**
 * Calculate Volume SMA for a series of candles.
 *
 * Uses sliding window for efficient calculation.
 *
 * @param candles - OHLCV data (oldest first)
 * @param params - Volume SMA parameters
 * @returns Array of Volume SMA results
 */
export function calculateVolumeSMA(
  candles: Candle[],
  params: VolumeSMAParams = VOLUME_SMA_DEFAULTS
): VolumeSMAResult[] {
  const { period } = params;

  validateCandleCount("VolumeSMA", candles, period);

  const results: VolumeSMAResult[] = [];

  // Calculate initial sum for first window
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].volume;
  }

  // First Volume SMA value
  const firstVolumeSma = sum / period;
  results.push({
    timestamp: candles[period - 1].timestamp,
    volumeSma: firstVolumeSma,
    volumeRatio: firstVolumeSma === 0 ? 1 : candles[period - 1].volume / firstVolumeSma,
  });

  // Calculate remaining values using sliding window
  for (let i = period; i < candles.length; i++) {
    // Remove oldest, add newest
    sum = sum - candles[i - period].volume + candles[i].volume;
    const volumeSma = sum / period;

    results.push({
      timestamp: candles[i].timestamp,
      volumeSma,
      volumeRatio: volumeSma === 0 ? 1 : candles[i].volume / volumeSma,
    });
  }

  return results;
}

/**
 * Get the minimum number of candles required for Volume SMA calculation.
 */
export function volumeSmaRequiredPeriods(params: VolumeSMAParams = VOLUME_SMA_DEFAULTS): number {
  return params.period;
}

/**
 * Check if volume is above average.
 */
export function isHighVolume(volumeRatio: number, threshold = VOLUME_THRESHOLDS.HIGH): boolean {
  return volumeRatio >= threshold;
}

/**
 * Check if volume is below average.
 */
export function isLowVolume(volumeRatio: number, threshold = VOLUME_THRESHOLDS.LOW): boolean {
  return volumeRatio <= threshold;
}

/**
 * Check if volume is extremely high (potential climax).
 */
export function isVeryHighVolume(
  volumeRatio: number,
  threshold = VOLUME_THRESHOLDS.VERY_HIGH
): boolean {
  return volumeRatio >= threshold;
}

/**
 * Get volume signal based on ratio.
 *
 * @param volumeRatio - Current volume ratio
 * @returns 'very_high' | 'high' | 'normal' | 'low' | 'very_low'
 */
export function getVolumeSignal(
  volumeRatio: number
): "very_high" | "high" | "normal" | "low" | "very_low" {
  if (volumeRatio >= VOLUME_THRESHOLDS.VERY_HIGH) {
    return "very_high";
  }
  if (volumeRatio >= VOLUME_THRESHOLDS.HIGH) {
    return "high";
  }
  if (volumeRatio <= VOLUME_THRESHOLDS.VERY_LOW) {
    return "very_low";
  }
  if (volumeRatio <= VOLUME_THRESHOLDS.LOW) {
    return "low";
  }
  return "normal";
}

/**
 * Check for volume confirmation of price move.
 *
 * @param priceChange - Price change (positive = up)
 * @param volumeRatio - Current volume ratio
 * @returns true if volume confirms the price move
 */
export function isVolumeConfirmed(
  _priceChange: number,
  volumeRatio: number,
  threshold = VOLUME_THRESHOLDS.HIGH
): boolean {
  // Volume confirmation: big move + high volume
  return volumeRatio >= threshold;
}

/**
 * Check for volume divergence (price moves but volume doesn't confirm).
 *
 * @param priceChange - Price change magnitude (absolute)
 * @param priceThreshold - Minimum price change to consider (e.g., 0.01 for 1%)
 * @param volumeRatio - Current volume ratio
 * @returns true if there's a divergence (price move not confirmed by volume)
 */
export function isVolumeDivergence(
  priceChange: number,
  priceThreshold: number,
  volumeRatio: number
): boolean {
  // Divergence: significant price move with below-average volume
  return Math.abs(priceChange) >= priceThreshold && volumeRatio < 1.0;
}

/**
 * Volume SMA Calculator implementation.
 */
export const volumeSmaCalculator: IndicatorCalculator<VolumeSMAParams, VolumeSMAResult> = {
  calculate: calculateVolumeSMA,
  requiredPeriods: volumeSmaRequiredPeriods,
};

export default volumeSmaCalculator;
