/**
 * Volatility Indicators
 *
 * Indicators measuring price volatility and range.
 */

export {
  calculateATR,
  atrRequiredPeriods,
  atrCalculator,
  calculateTrueRange,
  calculateATRStop,
  calculateATRPositionSize,
  ATR_DEFAULTS,
} from "./atr";

export {
  calculateBollingerBands,
  bollingerRequiredPeriods,
  bollingerCalculator,
  isTouchingUpperBand,
  isTouchingLowerBand,
  isBollingerSqueeze,
  isBollingerExpansion,
  getBollingerSignal,
  BOLLINGER_DEFAULTS,
} from "./bollinger";
