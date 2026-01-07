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

// Momentum Indicators
export * from "./momentum/index";
// Indicator Pipeline
export {
  calculateHistoricalIndicators,
  calculateIndicators,
  calculateMultiTimeframeIndicators,
  DEFAULT_PIPELINE_CONFIG,
  getRequiredWarmupPeriod,
  type IndicatorPipelineConfig,
} from "./pipeline";
// Synthesis (Dynamic Indicator Generation)
export * from "./synthesis/index";
// Normalization Transforms
export * from "./transforms/index";
// Trend Indicators
export * from "./trend/index";
// Types
export * from "./types";
// Volatility Indicators
export * from "./volatility/index";
// Volume Indicators
export * from "./volume/index";
// Storage Integration
export {
  persistHistoricalIndicators,
  persistIndicators,
  persistMultipleIndicators,
  type PersistIndicatorsOptions,
  type PersistResult,
} from "./storage";
