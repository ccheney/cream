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
