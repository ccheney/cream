/**
 * Technical Indicators Package
 *
 * Provides calculation implementations for technical analysis indicators.
 * Supports momentum, trend, volatility, and volume indicators.
 *
 * @example
 * ```ts
 * import {
 *   calculateRSI,
 *   calculateSMA,
 *   calculateIndicators,
 * } from '@cream/indicators';
 *
 * // Calculate single indicator
 * const rsi = calculateRSI(candles, { period: 14 });
 *
 * // Calculate all indicators for a timeframe
 * const snapshot = calculateIndicators(candles, '1h');
 * console.log(snapshot.values['rsi_14_1h']);
 * ```
 *
 * @see docs/plans/11-configuration.md for indicator specifications
 */

// Types
export * from "./types";

// Momentum Indicators
export * from "./momentum/index";

// Trend Indicators
export * from "./trend/index";

// Volatility Indicators
export * from "./volatility/index";

// Volume Indicators
export * from "./volume/index";

// Normalization Transforms
export * from "./transforms/index";

// Indicator Pipeline
export {
  calculateIndicators,
  calculateMultiTimeframeIndicators,
  calculateHistoricalIndicators,
  getRequiredWarmupPeriod,
  DEFAULT_PIPELINE_CONFIG,
  type IndicatorPipelineConfig,
} from "./pipeline";
