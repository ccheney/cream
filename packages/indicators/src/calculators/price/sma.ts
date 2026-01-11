/**
 * Simple Moving Average (SMA) Calculator
 *
 * The SMA is calculated by summing the closing prices over a period
 * and dividing by the number of periods.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OHLCVBar } from "../../types";

export interface SMAResult {
  value: number | null;
  timestamp: number;
}

/**
 * Calculate Simple Moving Average for a series of bars
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period
 * @returns SMA value for the most recent bar, or null if insufficient data
 */
export function calculateSMA(bars: OHLCVBar[], period: number): number | null {
  if (bars.length < period) {
    return null;
  }

  const recentBars = bars.slice(-period);
  const sum = recentBars.reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate SMA for each bar in a series (returns array)
 *
 * @param bars - OHLCV bars (oldest first)
 * @param period - Lookback period
 * @returns Array of SMA values (null for bars with insufficient history)
 */
export function calculateSMASeries(bars: OHLCVBar[], period: number): SMAResult[] {
  return bars.map((bar, index) => {
    if (index < period - 1) {
      return { value: null, timestamp: bar.timestamp };
    }

    const windowBars = bars.slice(index - period + 1, index + 1);
    const sum = windowBars.reduce((acc, b) => acc + b.close, 0);
    return { value: sum / period, timestamp: bar.timestamp };
  });
}
