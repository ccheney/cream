/**
 * Corporate Actions Module
 *
 * Handles adjustments for stock splits and dividends.
 *
 * @see docs/plans/02-data-layer.md
 */

// Dividend adjustments
export {
	adjustPriceForDividend,
	calculateAnnualizedYield,
	calculateDividendAdjustedReturn,
	calculateDividendYield,
	calculateDRIPShares,
	type DividendAdjustedReturn,
	type DividendInfo,
	getDividendsFromDate,
	getDividendsGoingExWithin,
	getDividendsInRange,
	getRegularDividends,
	getSpecialDividends,
	getUpcomingDividends,
	isSpecialDividend,
	sumDividends,
	toDividendInfo,
} from "./dividends";
// Split adjustments
export {
	type AdjustedCandle,
	adjustCandleForSplits,
	adjustCandlesForSplits,
	adjustPrice,
	adjustVolume,
	type CandleWithTimestamp,
	calculateCumulativeAdjustmentFactor,
	calculateSplitRatio,
	getApplicableSplits,
	type SplitAdjustment,
	toSplitAdjustment,
	unadjustPrice,
} from "./splits";
