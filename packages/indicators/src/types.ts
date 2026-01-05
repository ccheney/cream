/**
 * Technical Indicator Types
 *
 * Common types and interfaces for technical indicator calculations.
 */

// ============================================
// Candle Data Types
// ============================================

/**
 * OHLCV candle data for indicator calculations.
 */
export interface Candle {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Opening price */
  open: number;
  /** Highest price */
  high: number;
  /** Lowest price */
  low: number;
  /** Closing price */
  close: number;
  /** Volume traded */
  volume: number;
}

/**
 * Timeframe identifier.
 */
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

// ============================================
// Indicator Result Types
// ============================================

/**
 * Base indicator result with timestamp.
 */
export interface IndicatorValue {
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Single-value indicator result (RSI, ATR, etc.).
 */
export interface SingleValueResult extends IndicatorValue {
  /** The calculated value */
  value: number;
}

/**
 * RSI result.
 */
export interface RSIResult extends IndicatorValue {
  /** RSI value (0-100) */
  rsi: number;
}

/**
 * Stochastic result with %K and %D.
 */
export interface StochasticResult extends IndicatorValue {
  /** Fast stochastic (%K) */
  k: number;
  /** Slow stochastic (%D) - smoothed %K */
  d: number;
}

/**
 * Moving average result.
 */
export interface MAResult extends IndicatorValue {
  /** Moving average value */
  ma: number;
}

/**
 * ATR result.
 */
export interface ATRResult extends IndicatorValue {
  /** Average True Range value */
  atr: number;
}

/**
 * Bollinger Bands result.
 */
export interface BollingerBandsResult extends IndicatorValue {
  /** Upper band (SMA + std_dev * σ) */
  upper: number;
  /** Middle band (SMA) */
  middle: number;
  /** Lower band (SMA - std_dev * σ) */
  lower: number;
  /** Band width as percentage of middle */
  bandwidth: number;
  /** %B position within bands (0-1 normal, >1 above upper, <0 below lower) */
  percentB: number;
}

/**
 * Volume SMA result.
 */
export interface VolumeSMAResult extends IndicatorValue {
  /** Volume moving average */
  volumeSma: number;
  /** Current volume as ratio to SMA (>1 = above average) */
  volumeRatio: number;
}

// ============================================
// Named Output Types
// ============================================

/**
 * Named indicator output format.
 *
 * Key format: {indicator}_{param}_{timeframe}
 * Example: "rsi_14_1h", "sma_20_1d"
 */
export type NamedIndicatorOutput = Record<string, number | null>;

/**
 * Multi-indicator snapshot at a single point in time.
 */
export interface IndicatorSnapshot {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Named indicator values */
  values: NamedIndicatorOutput;
}

// ============================================
// Indicator Configuration Types
// ============================================

/**
 * RSI parameters.
 */
export interface RSIParams {
  /** Period for RSI calculation (default: 14) */
  period: number;
}

/**
 * Stochastic parameters.
 */
export interface StochasticParams {
  /** %K period (default: 14) */
  kPeriod: number;
  /** %D period (default: 3) */
  dPeriod: number;
  /** Use slow stochastic (default: true) */
  slow: boolean;
}

/**
 * SMA/EMA parameters.
 */
export interface MAParams {
  /** Period for moving average (e.g., 20, 50, 200) */
  period: number;
}

/**
 * ATR parameters.
 */
export interface ATRParams {
  /** Period for ATR calculation (default: 14) */
  period: number;
}

/**
 * Bollinger Bands parameters.
 */
export interface BollingerBandsParams {
  /** Period for SMA base (default: 20) */
  period: number;
  /** Standard deviation multiplier (default: 2.0) */
  stdDev: number;
}

/**
 * Volume SMA parameters.
 */
export interface VolumeSMAParams {
  /** Period for volume SMA (default: 20) */
  period: number;
}

// ============================================
// Calculator Interface
// ============================================

/**
 * Generic indicator calculator interface.
 */
export interface IndicatorCalculator<TParams, TResult extends IndicatorValue> {
  /**
   * Calculate indicator for a series of candles.
   *
   * @param candles - OHLCV candle data (oldest first)
   * @param params - Indicator-specific parameters
   * @returns Array of indicator results
   */
  calculate(candles: Candle[], params: TParams): TResult[];

  /**
   * Get the minimum number of candles required.
   *
   * @param params - Indicator-specific parameters
   * @returns Minimum candles needed for first valid result
   */
  requiredPeriods(params: TParams): number;
}

// ============================================
// Utility Types
// ============================================

/**
 * Indicator calculation error.
 */
export class IndicatorError extends Error {
  constructor(
    public readonly indicator: string,
    message: string,
    public readonly candles?: number,
    public readonly required?: number
  ) {
    super(`[${indicator}] ${message}`);
    this.name = "IndicatorError";
  }
}

/**
 * Check if we have enough candles for calculation.
 */
export function validateCandleCount(indicator: string, candles: Candle[], required: number): void {
  if (candles.length < required) {
    throw new IndicatorError(
      indicator,
      `Insufficient data: need ${required} candles, got ${candles.length}`,
      candles.length,
      required
    );
  }
}
