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
  calculateAverageBidAskSpread,
  calculateBidAskSpread,
  classifySpreadQuality,
  type BidAskSpreadResult,
  type SpreadQuality,
} from "./bid-ask-spread";

export {
  calculateAmihud,
  classifyAmihudLiquidity,
  type AmihudResult,
  type LiquidityClass,
} from "./amihud";

export {
  calculateTurnover,
  calculateTrueTurnover,
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
