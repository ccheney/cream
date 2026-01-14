/**
 * Liquidity Indicator Calculators
 *
 * Includes:
 * - Bid-Ask Spread
 * - Turnover Ratio
 * - Amihud Illiquidity Measure
 * - VWAP (Volume Weighted Average Price)
 */

export {
	type AmihudResult,
	calculateAmihud,
	classifyAmihudLiquidity,
	type LiquidityClass,
} from "./amihud";
export {
	type BidAskSpreadResult,
	calculateAverageBidAskSpread,
	calculateBidAskSpread,
	classifySpreadQuality,
	type SpreadQuality,
} from "./bid-ask-spread";

export {
	calculateTrueTurnover,
	calculateTurnover,
	classifyVolumeActivity,
	type TurnoverResult,
	type VolumeActivity,
} from "./turnover";

export {
	calculateTypicalPrice,
	calculateVWAP,
	calculateVWAPDeviation,
	calculateVWAPSeries,
	type VWAPResult,
} from "./vwap";
