/**
 * Price-based Indicator Calculators
 *
 * Includes:
 * - Trend: SMA, EMA
 * - Momentum: RSI, MACD, Stochastic, Momentum
 * - Volatility: ATR, Bollinger Bands, Realized Volatility, Parkinson Volatility
 * - Volume: VWAP
 */

export { calculateATR, calculateATRSeries, calculateTrueRange, type ATRResult } from "./atr";
export { calculateSMA, calculateSMASeries, type SMAResult } from "./sma";

export {
  calculateRSI,
  calculateRSISeries,
  classifyRSI,
  detectRSIDivergence,
  type RSILevel,
  type RSIResult,
} from "./rsi";

export {
  calculateEMA,
  calculateEMAMultiplier,
  calculateEMASeries,
  calculateMultipleEMAs,
  calculatePriceToEMA,
  detectEMACrossover,
  type EMAResult,
  type MultiEMAResult,
} from "./ema";

export {
  calculateBollingerBands,
  calculateBollingerBandsSeries,
  classifyBandwidth,
  classifyBollingerPosition,
  detectBandWalking,
  detectBollingerSqueeze,
  type BandwidthLevel,
  type BollingerBandsResult,
  type BollingerPosition,
} from "./bollinger";
