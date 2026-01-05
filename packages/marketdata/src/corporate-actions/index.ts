/**
 * Corporate Actions Module
 *
 * Handles adjustments for stock splits and dividends.
 *
 * @see docs/plans/02-data-layer.md
 */

// Split adjustments
export {
  type SplitAdjustment,
  type AdjustedCandle,
  type CandleWithTimestamp,
  calculateSplitRatio,
  toSplitAdjustment,
  adjustPrice,
  adjustVolume,
  calculateCumulativeAdjustmentFactor,
  getApplicableSplits,
  adjustCandleForSplits,
  adjustCandlesForSplits,
  unadjustPrice,
} from "./splits";

// Dividend adjustments
export {
  type DividendInfo,
  type DividendAdjustedReturn,
  toDividendInfo,
  calculateDividendYield,
  calculateAnnualizedYield,
  getDividendsFromDate,
  getDividendsInRange,
  sumDividends,
  calculateDividendAdjustedReturn,
  adjustPriceForDividend,
  calculateDRIPShares,
  isSpecialDividend,
  getRegularDividends,
  getSpecialDividends,
  getUpcomingDividends,
  getDividendsGoingExWithin,
} from "./dividends";
