export interface Candle {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export interface IndicatorValue {
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

export interface SingleValueResult extends IndicatorValue {
  value: number;
}

export interface RSIResult extends IndicatorValue {
  /** 0-100 scale */
  rsi: number;
}

export interface StochasticResult extends IndicatorValue {
  /** Fast stochastic */
  k: number;
  /** Slow stochastic (smoothed %K) */
  d: number;
}

export interface MAResult extends IndicatorValue {
  ma: number;
}

export interface ATRResult extends IndicatorValue {
  atr: number;
}

export interface BollingerBandsResult extends IndicatorValue {
  upper: number;
  middle: number;
  lower: number;
  /** Bandwidth as percentage of middle band */
  bandwidth: number;
  /** Position within bands: 0-1 normal, >1 above upper, <0 below lower */
  percentB: number;
}

export interface VolumeSMAResult extends IndicatorValue {
  volumeSma: number;
  /** Ratio to SMA: >1 means above average */
  volumeRatio: number;
}

/**
 * Key format: {indicator}_{param}_{timeframe}
 * Example: "rsi_14_1h", "sma_20_1d"
 */
export type NamedIndicatorOutput = Record<string, number | null>;

export interface IndicatorSnapshot {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  values: NamedIndicatorOutput;
}

export interface RSIParams {
  period: number;
}

export interface StochasticParams {
  kPeriod: number;
  dPeriod: number;
  slow: boolean;
}

export interface MAParams {
  period: number;
}

export interface ATRParams {
  period: number;
}

export interface BollingerBandsParams {
  period: number;
  stdDev: number;
}

export interface VolumeSMAParams {
  period: number;
}

export interface IndicatorCalculator<TParams, TResult extends IndicatorValue> {
  /** Candles must be sorted oldest first */
  calculate(candles: Candle[], params: TParams): TResult[];
  requiredPeriods(params: TParams): number;
}

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
