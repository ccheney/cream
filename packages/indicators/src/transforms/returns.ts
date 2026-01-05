/**
 * Returns Transform
 *
 * Calculate percentage change (returns) over configurable periods.
 * Fundamental momentum feature for trading systems.
 *
 * Formula:
 *   Simple Return = (Price_t - Price_{t-n}) / Price_{t-n}
 *   Log Return = ln(Price_t / Price_{t-n})
 *
 * Common periods:
 *   - 1 period: Short-term momentum
 *   - 5 periods: Weekly momentum
 *   - 20 periods: Monthly momentum
 *
 * Interpretation:
 *   - Positive return: Price increased
 *   - Negative return: Price decreased
 *   - Magnitude indicates strength of move
 */

import type { Candle } from "../types";

// ============================================
// Parameters
// ============================================

/**
 * Returns transform parameters.
 */
export interface ReturnsParams {
  /** Periods to calculate returns for */
  periods: number[];
  /** Use log returns instead of simple returns */
  logReturns?: boolean;
}

/**
 * Default returns parameters.
 */
export const RETURNS_DEFAULTS: ReturnsParams = {
  periods: [1, 5, 20],
  logReturns: false,
};

// ============================================
// Result Types
// ============================================

/**
 * Single return result.
 */
export interface ReturnResult {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Return value (decimal, e.g., 0.05 for 5%) */
  return: number;
  /** Period used for calculation */
  period: number;
}

/**
 * Multi-period return results.
 */
export interface MultiPeriodReturnResult {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Returns keyed by period */
  returns: Record<number, number | null>;
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate simple return between two prices.
 */
export function simpleReturn(currentPrice: number, previousPrice: number): number {
  if (previousPrice === 0) {
    return 0;
  }
  return (currentPrice - previousPrice) / previousPrice;
}

/**
 * Calculate log return between two prices.
 */
export function logReturn(currentPrice: number, previousPrice: number): number {
  if (previousPrice <= 0 || currentPrice <= 0) {
    return 0;
  }
  return Math.log(currentPrice / previousPrice);
}

/**
 * Calculate returns for a single period.
 *
 * @param values - Price values (oldest first)
 * @param timestamps - Corresponding timestamps
 * @param period - Lookback period
 * @param useLogReturns - Use log returns instead of simple returns
 * @returns Array of return results
 */
export function calculateReturns(
  values: number[],
  timestamps: number[],
  period: number,
  useLogReturns = false
): ReturnResult[] {
  const results: ReturnResult[] = [];

  for (let i = period; i < values.length; i++) {
    const currentPrice = values[i];
    const previousPrice = values[i - period];

    const returnValue = useLogReturns
      ? logReturn(currentPrice, previousPrice)
      : simpleReturn(currentPrice, previousPrice);

    results.push({
      timestamp: timestamps[i],
      return: returnValue,
      period,
    });
  }

  return results;
}

/**
 * Calculate returns for multiple periods at once.
 *
 * @param values - Price values (oldest first)
 * @param timestamps - Corresponding timestamps
 * @param params - Returns parameters
 * @returns Array of multi-period return results
 */
export function calculateMultiPeriodReturns(
  values: number[],
  timestamps: number[],
  params: ReturnsParams = RETURNS_DEFAULTS
): MultiPeriodReturnResult[] {
  const { periods, logReturns = false } = params;
  const maxPeriod = Math.max(...periods);

  if (values.length <= maxPeriod) {
    return [];
  }

  const results: MultiPeriodReturnResult[] = [];

  for (let i = maxPeriod; i < values.length; i++) {
    const returns: Record<number, number | null> = {};

    for (const period of periods) {
      if (i >= period) {
        const currentPrice = values[i];
        const previousPrice = values[i - period];

        returns[period] = logReturns
          ? logReturn(currentPrice, previousPrice)
          : simpleReturn(currentPrice, previousPrice);
      } else {
        returns[period] = null;
      }
    }

    results.push({
      timestamp: timestamps[i],
      returns,
    });
  }

  return results;
}

/**
 * Calculate returns from candle data.
 *
 * @param candles - OHLCV candle data (oldest first)
 * @param params - Returns parameters
 * @returns Array of multi-period return results
 */
export function calculateReturnsFromCandles(
  candles: Candle[],
  params: ReturnsParams = RETURNS_DEFAULTS
): MultiPeriodReturnResult[] {
  const values = candles.map((c) => c.close);
  const timestamps = candles.map((c) => c.timestamp);

  return calculateMultiPeriodReturns(values, timestamps, params);
}

/**
 * Get required periods for returns calculation.
 */
export function returnsRequiredPeriods(params: ReturnsParams = RETURNS_DEFAULTS): number {
  return Math.max(...params.periods) + 1;
}

/**
 * Generate output names for returns.
 *
 * @param periods - Periods to generate names for
 * @param prefix - Prefix for output names (e.g., "return")
 * @param timeframe - Timeframe suffix (e.g., "1h")
 * @returns Map of period to output name
 */
export function generateReturnOutputNames(
  periods: number[],
  prefix = "return",
  timeframe = ""
): Map<number, string> {
  const names = new Map<number, string>();

  for (const period of periods) {
    const name = timeframe ? `${prefix}_${period}_${timeframe}` : `${prefix}_${period}`;
    names.set(period, name);
  }

  return names;
}

// ============================================
// Exports
// ============================================

export default {
  calculateReturns,
  calculateMultiPeriodReturns,
  calculateReturnsFromCandles,
  returnsRequiredPeriods,
  generateReturnOutputNames,
  simpleReturn,
  logReturn,
  RETURNS_DEFAULTS,
};
