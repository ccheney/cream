/**
 * Stock Split Adjustment Logic
 *
 * Handles split adjustment calculations for historical price data.
 *
 * Split ratio = split_to / split_from
 * - 4:1 split: split_to=4, split_from=1, ratio=4.0 (price divided by 4)
 * - 1:10 reverse split: split_to=1, split_from=10, ratio=0.1 (price multiplied by 10)
 *
 * @see docs/plans/02-data-layer.md
 */

import type { AlpacaCorporateActionSplit } from "../providers/alpaca";

// ============================================
// Types
// ============================================

export interface SplitAdjustment {
  /** Symbol */
  symbol: string;
  /** Split execution date (YYYY-MM-DD) */
  executionDate: string;
  /** Split ratio (split_to / split_from) */
  ratio: number;
  /** Original split numerator */
  splitTo: number;
  /** Original split denominator */
  splitFrom: number;
  /** True if this is a reverse split (ratio < 1) */
  isReverse: boolean;
}

export interface AdjustedCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Applied split adjustments */
  splitAdjusted: boolean;
  /** Cumulative adjustment factor */
  adjustmentFactor: number;
}

// ============================================
// Split Ratio Calculation
// ============================================

/**
 * Calculate split ratio from split_to and split_from.
 *
 * Examples:
 * - 4:1 split: splitTo=4, splitFrom=1 → ratio=4.0
 * - 2:1 split: splitTo=2, splitFrom=1 → ratio=2.0
 * - 3:2 split: splitTo=3, splitFrom=2 → ratio=1.5
 * - 1:10 reverse split: splitTo=1, splitFrom=10 → ratio=0.1
 */
export function calculateSplitRatio(splitTo: number, splitFrom: number): number {
  if (splitFrom === 0) {
    throw new Error("splitFrom cannot be zero");
  }
  return splitTo / splitFrom;
}

/**
 * Convert Alpaca Corporate Action Split to SplitAdjustment.
 */
export function toSplitAdjustment(split: AlpacaCorporateActionSplit): SplitAdjustment {
  // Alpaca uses newRate:oldRate format (e.g., 4:1 split has newRate=4, oldRate=1)
  const ratio = calculateSplitRatio(split.newRate, split.oldRate);

  return {
    symbol: split.symbol,
    executionDate: split.exDate,
    ratio,
    splitTo: split.newRate,
    splitFrom: split.oldRate,
    isReverse: ratio < 1,
  };
}

// ============================================
// Price Adjustment
// ============================================

/**
 * Apply split adjustment to a price.
 *
 * For forward splits (ratio > 1): price is divided by ratio
 * For reverse splits (ratio < 1): price is multiplied by 1/ratio
 *
 * @param price - Original price
 * @param ratio - Split ratio (split_to / split_from)
 * @returns Adjusted price
 */
export function adjustPrice(price: number, ratio: number): number {
  return price / ratio;
}

/**
 * Apply split adjustment to volume.
 *
 * Volume is adjusted inversely to price:
 * For forward splits: volume is multiplied by ratio
 * For reverse splits: volume is divided by ratio
 *
 * @param volume - Original volume
 * @param ratio - Split ratio
 * @returns Adjusted volume
 */
export function adjustVolume(volume: number, ratio: number): number {
  return volume * ratio;
}

/**
 * Calculate cumulative adjustment factor for multiple splits.
 *
 * @param splits - Array of split adjustments (oldest to newest)
 * @returns Cumulative adjustment factor
 */
export function calculateCumulativeAdjustmentFactor(splits: SplitAdjustment[]): number {
  return splits.reduce((factor, split) => factor * split.ratio, 1);
}

/**
 * Filter splits that apply to candles before a given date.
 *
 * @param splits - All splits for a symbol (oldest first)
 * @param candleDate - Candle date (YYYY-MM-DD or ISO string)
 * @returns Splits that occurred after the candle date
 */
export function getApplicableSplits(
  splits: SplitAdjustment[],
  candleDate: string
): SplitAdjustment[] {
  const candleDateStr = candleDate.split("T")[0] ?? candleDate;
  return splits.filter((split) => split.executionDate > candleDateStr);
}

// ============================================
// Candle Adjustment
// ============================================

export interface CandleWithTimestamp {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: unknown;
}

/**
 * Adjust a single candle for splits.
 *
 * @param candle - Original candle
 * @param splits - Splits to apply (should be filtered for this candle's date)
 * @returns Adjusted candle
 */
export function adjustCandleForSplits<T extends CandleWithTimestamp>(
  candle: T,
  splits: SplitAdjustment[]
): T & { splitAdjusted: boolean; adjustmentFactor: number } {
  if (splits.length === 0) {
    return {
      ...candle,
      splitAdjusted: false,
      adjustmentFactor: 1,
    };
  }

  const factor = calculateCumulativeAdjustmentFactor(splits);

  return {
    ...candle,
    open: adjustPrice(candle.open, factor),
    high: adjustPrice(candle.high, factor),
    low: adjustPrice(candle.low, factor),
    close: adjustPrice(candle.close, factor),
    volume: adjustVolume(candle.volume, factor),
    splitAdjusted: true,
    adjustmentFactor: factor,
  };
}

/**
 * Adjust a series of candles for splits.
 *
 * @param candles - Array of candles (oldest first)
 * @param splits - All splits for the symbol (oldest first by execution date)
 * @returns Array of adjusted candles
 */
export function adjustCandlesForSplits<T extends CandleWithTimestamp>(
  candles: T[],
  splits: SplitAdjustment[]
): Array<T & { splitAdjusted: boolean; adjustmentFactor: number }> {
  if (splits.length === 0) {
    return candles.map((candle) => ({
      ...candle,
      splitAdjusted: false,
      adjustmentFactor: 1,
    }));
  }

  // Sort splits by date (oldest first)
  const sortedSplits = [...splits].sort(
    (a, b) => new Date(a.executionDate).getTime() - new Date(b.executionDate).getTime()
  );

  return candles.map((candle) => {
    // Get splits that occurred AFTER this candle's date
    const applicableSplits = getApplicableSplits(sortedSplits, candle.timestamp);
    return adjustCandleForSplits(candle, applicableSplits);
  });
}

// ============================================
// Reverse Adjustment (for current prices to historical)
// ============================================

/**
 * Reverse split adjustment (convert current price to historical).
 *
 * Useful for comparing current prices to historical data.
 *
 * @param price - Current (already adjusted) price
 * @param ratio - Split ratio
 * @returns Unadjusted price
 */
export function unadjustPrice(price: number, ratio: number): number {
  return price * ratio;
}

export default {
  calculateSplitRatio,
  toSplitAdjustment,
  adjustPrice,
  adjustVolume,
  calculateCumulativeAdjustmentFactor,
  getApplicableSplits,
  adjustCandleForSplits,
  adjustCandlesForSplits,
  unadjustPrice,
};
