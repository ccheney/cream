/**
 * Trend Indicators
 *
 * Indicators measuring price direction and momentum.
 */

export {
  calculateSMA,
  smaRequiredPeriods,
  smaCalculator,
  calculateMultipleSMAs,
  isGoldenCross,
  isDeathCross,
  SMA_DEFAULTS,
  SMA_PERIODS,
} from "./sma";

export {
  calculateEMA,
  emaRequiredPeriods,
  emaCalculator,
  calculateMultipleEMAs,
  calculateMACD,
  calculateMultiplier,
  EMA_DEFAULTS,
  EMA_PERIODS,
} from "./ema";
