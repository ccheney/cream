/**
 * Turnover Ratio Calculator
 *
 * Turnover ratio measures the trading activity of a security relative to its
 * shares outstanding (or average volume). High turnover indicates active trading.
 *
 * Formulas:
 * - Daily Turnover = Volume / Shares Outstanding
 * - Volume Ratio = Current Volume / Average Volume (simpler proxy)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

export interface TurnoverResult {
  /** Volume ratio (current / average) */
  volumeRatio: number;
  /** Average volume over lookback period */
  avgVolume: number;
  /** Current volume */
  currentVolume: number;
  /** Timestamp of calculation */
  timestamp: number;
}

/**
 * Calculate volume ratio (turnover proxy)
 *
 * Volume ratio = Current Volume / Average Volume
 * - Ratio > 1: Above average trading activity
 * - Ratio < 1: Below average trading activity
 * - Ratio > 2: Significantly elevated volume (potential catalyst)
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period for average (default: 20)
 * @returns Turnover metrics or null if insufficient data
 *
 * @example
 * ```typescript
 * const bars = [...]; // 20+ bars
 * const result = calculateTurnover(bars, 20);
 * // result.volumeRatio = 1.5 (50% above average)
 * ```
 */
export function calculateTurnover(bars: OHLCVBar[], period = 20): TurnoverResult | null {
  if (bars.length < period) {
    return null;
  }

  // Get lookback bars for average (excluding current)
  const lookbackBars = bars.slice(-period - 1, -1);
  const currentBar = bars[bars.length - 1];

  if (!currentBar || lookbackBars.length === 0) {
    return null;
  }

  // Calculate average volume
  const validVolumes = lookbackBars.filter((b) => b.volume > 0).map((b) => b.volume);
  if (validVolumes.length === 0) {
    return null;
  }

  const avgVolume = validVolumes.reduce((sum, v) => sum + v, 0) / validVolumes.length;
  const currentVolume = currentBar.volume;

  if (avgVolume <= 0) {
    return null;
  }

  const volumeRatio = currentVolume / avgVolume;

  return {
    volumeRatio,
    avgVolume,
    currentVolume,
    timestamp: currentBar.timestamp,
  };
}

/**
 * Classify volume activity level
 */
export type VolumeActivity = "very_low" | "low" | "normal" | "high" | "very_high";

export function classifyVolumeActivity(volumeRatio: number): VolumeActivity {
  if (volumeRatio < 0.5) return "very_low";
  if (volumeRatio < 0.8) return "low";
  if (volumeRatio < 1.5) return "normal";
  if (volumeRatio < 2.5) return "high";
  return "very_high";
}

/**
 * Calculate true turnover ratio with shares outstanding
 *
 * @param volume - Trading volume
 * @param sharesOutstanding - Total shares outstanding
 * @returns Turnover ratio (0-1 range typically)
 */
export function calculateTrueTurnover(volume: number, sharesOutstanding: number): number {
  if (sharesOutstanding <= 0) return 0;
  return volume / sharesOutstanding;
}
