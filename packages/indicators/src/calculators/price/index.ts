/**
 * Price-based Indicator Calculators
 *
 * Includes:
 * - Trend: SMA, EMA
 * - Momentum: RSI, MACD, Stochastic, Momentum
 * - Volatility: ATR, Bollinger Bands, Realized Volatility, Parkinson Volatility
 * - Volume: VWAP
 */

export { type ATRResult, calculateATR, calculateATRSeries, calculateTrueRange } from "./atr";
export {
  type BandwidthLevel,
  type BollingerBandsResult,
  type BollingerPosition,
  calculateBollingerBands,
  calculateBollingerBandsSeries,
  classifyBandwidth,
  classifyBollingerPosition,
  detectBandWalking,
  detectBollingerSqueeze,
} from "./bollinger";
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
  calculateMACD,
  calculateMACDSeries,
  classifyMACDMomentum,
  detectMACDCrossover,
  detectZeroLineCrossover,
  type MACDMomentum,
  type MACDResult,
  type MACDSettings,
} from "./macd";
export {
  calculateCustomMomentumPeriods,
  calculateMomentum,
  calculateMomentumAcceleration,
  calculateMomentumScore,
  calculateMomentumSeries,
  calculateMultiPeriodMomentum,
  classifyMomentum,
  detectMomentumTrend,
  type MomentumResult,
  type MomentumStrength,
  type MultiPeriodMomentum,
} from "./momentum";
export {
  calculateRSI,
  calculateRSISeries,
  classifyRSI,
  detectRSIDivergence,
  type RSILevel,
  type RSIResult,
} from "./rsi";
export { calculateSMA, calculateSMASeries, type SMAResult } from "./sma";
export {
  calculateSlowStochastic,
  calculateStochastic,
  calculateStochasticSeries,
  classifyStochastic,
  detectStochasticCrossover,
  detectStochasticHook,
  type SlowStochasticResult,
  type StochasticLevel,
  type StochasticResult,
  type StochasticSettings,
} from "./stochastic";

export {
  calculateCloseToCloseVolatility,
  calculateGarmanKlassVolatility,
  calculateParkinsonVolatility,
  calculateVolatilityComparison,
  calculateVolatilityPercentile,
  calculateVolatilitySeries,
  classifyVolatility,
  detectVolatilityRegimeChange,
  type VolatilityComparison,
  type VolatilityLevel,
  type VolatilityMethod,
  type VolatilityResult,
} from "./volatility";

export {
  calculateVolumeSMA,
  calculateVolumeSMASeries,
  type VolumeSMAResult,
} from "./volume-sma";
