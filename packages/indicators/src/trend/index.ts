/**
 * Trend Indicators
 *
 * Indicators measuring price direction and momentum.
 */

export {
  calculateEMA,
  calculateMACD,
  calculateMultipleEMAs,
  calculateMultiplier,
  EMA_DEFAULTS,
  EMA_PERIODS,
  emaCalculator,
  emaRequiredPeriods,
} from "./ema";
export {
  calculateMultipleSMAs,
  calculateSMA,
  isDeathCross,
  isGoldenCross,
  SMA_DEFAULTS,
  SMA_PERIODS,
  smaCalculator,
  smaRequiredPeriods,
} from "./sma";
