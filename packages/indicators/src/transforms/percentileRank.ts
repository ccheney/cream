/**
 * Percentile Rank Transform
 *
 * Map values to their percentile rank (0-100) within a rolling window.
 * Robust alternative to z-score for non-normal distributions.
 *
 * Formula:
 *   Percentile Rank = (count of values <= current value) / total values * 100
 *
 * Use Cases:
 *   - Regime detection (current value vs historical context)
 *   - Non-parametric normalization (no distribution assumptions)
 *   - Robust to outliers
 *
 * Advantages over Z-Score:
 *   - No normal distribution assumption
 *   - Bounded output (0-100)
 *   - Robust to extreme outliers
 *
 * @see https://en.wikipedia.org/wiki/Percentile_rank
 */

// ============================================
// Parameters
// ============================================

/**
 * Percentile rank transform parameters.
 */
export interface PercentileRankParams {
  /** Rolling window lookback period */
  lookback: number;
  /** Minimum samples required for valid calculation */
  minSamples?: number;
}

/**
 * Default percentile rank parameters.
 */
export const PERCENTILE_RANK_DEFAULTS: PercentileRankParams = {
  lookback: 252, // ~1 year of trading days
  minSamples: 10,
};

// ============================================
// Result Types
// ============================================

/**
 * Percentile rank result.
 */
export interface PercentileRankResult {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Percentile rank (0-100) */
  percentile: number;
  /** Number of samples in window */
  sampleCount: number;
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate percentile rank of a value within a sample.
 *
 * @param value - Value to rank
 * @param sample - Sample to rank within
 * @returns Percentile rank (0-100)
 */
export function calculatePercentileOfValue(value: number, sample: number[]): number {
  if (sample.length === 0) {
    return 50; // Default to middle
  }

  // Count values less than or equal to current value
  let count = 0;
  for (const v of sample) {
    if (v <= value) {
      count++;
    }
  }

  // Calculate percentile (excluding current value from denominator for rolling calculation)
  return (count / sample.length) * 100;
}

/**
 * Calculate percentile rank for a time series.
 *
 * @param values - Input values (oldest first)
 * @param timestamps - Corresponding timestamps
 * @param params - Percentile rank parameters
 * @returns Array of percentile rank results
 */
export function calculatePercentileRank(
  values: number[],
  timestamps: number[],
  params: PercentileRankParams = PERCENTILE_RANK_DEFAULTS
): PercentileRankResult[] {
  const { lookback, minSamples = 10 } = params;
  const results: PercentileRankResult[] = [];

  if (values.length < minSamples) {
    return results;
  }

  for (let i = minSamples - 1; i < values.length; i++) {
    // Get window (use all available up to lookback)
    const windowStart = Math.max(0, i - lookback + 1);
    const window = values.slice(windowStart, i + 1);

    if (window.length < minSamples) {
      continue;
    }

    const percentile = calculatePercentileOfValue(values[i], window);

    results.push({
      timestamp: timestamps[i],
      percentile,
      sampleCount: window.length,
    });
  }

  return results;
}

/**
 * Calculate percentile ranks for multiple input series.
 *
 * @param inputsMap - Map of input name to values
 * @param timestamps - Shared timestamps
 * @param params - Percentile rank parameters
 * @returns Map of input name to percentile rank results
 */
export function calculateMultiplePercentileRanks(
  inputsMap: Map<string, number[]>,
  timestamps: number[],
  params: PercentileRankParams = PERCENTILE_RANK_DEFAULTS
): Map<string, PercentileRankResult[]> {
  const results = new Map<string, PercentileRankResult[]>();

  for (const [name, values] of inputsMap) {
    results.set(name, calculatePercentileRank(values, timestamps, params));
  }

  return results;
}

/**
 * Get required periods for percentile rank calculation.
 */
export function percentileRankRequiredPeriods(
  params: PercentileRankParams = PERCENTILE_RANK_DEFAULTS
): number {
  return params.minSamples ?? 10;
}

// ============================================
// Percentile Rank Interpretation
// ============================================

/**
 * Get percentile rank quintile (0-4).
 *
 * @param percentile - Percentile rank (0-100)
 * @returns Quintile (0=bottom 20%, 4=top 20%)
 */
export function getQuintile(percentile: number): 0 | 1 | 2 | 3 | 4 {
  if (percentile < 20) {
    return 0;
  }
  if (percentile < 40) {
    return 1;
  }
  if (percentile < 60) {
    return 2;
  }
  if (percentile < 80) {
    return 3;
  }
  return 4;
}

/**
 * Get percentile rank signal.
 *
 * @param percentile - Percentile rank (0-100)
 * @returns Signal interpretation
 */
export function getPercentileSignal(
  percentile: number
): "extreme_low" | "low" | "neutral" | "high" | "extreme_high" {
  if (percentile <= 10) {
    return "extreme_low";
  }
  if (percentile <= 25) {
    return "low";
  }
  if (percentile >= 90) {
    return "extreme_high";
  }
  if (percentile >= 75) {
    return "high";
  }
  return "neutral";
}

/**
 * Check if percentile indicates extreme value.
 *
 * @param percentile - Percentile rank (0-100)
 * @param threshold - Extreme threshold (default: 10, meaning top/bottom 10%)
 * @returns true if extreme
 */
export function isExtreme(percentile: number, threshold = 10): boolean {
  return percentile <= threshold || percentile >= 100 - threshold;
}

/**
 * Get regime signal based on percentile.
 *
 * Useful for detecting market regimes (e.g., high/low volatility).
 *
 * @param percentile - Percentile rank (0-100)
 * @returns Regime signal
 */
export function getRegimeSignal(
  percentile: number
): "very_low" | "low" | "normal" | "high" | "very_high" {
  if (percentile <= 10) {
    return "very_low";
  }
  if (percentile <= 30) {
    return "low";
  }
  if (percentile >= 90) {
    return "very_high";
  }
  if (percentile >= 70) {
    return "high";
  }
  return "normal";
}

/**
 * Generate output name for percentile rank.
 *
 * @param inputName - Input feature name
 * @param suffix - Suffix for output name (default: "pct")
 * @returns Output name
 */
export function generatePercentileOutputName(inputName: string, suffix = "pct"): string {
  return `${inputName}_${suffix}`;
}

// ============================================
// Exports
// ============================================

export default {
  calculatePercentileRank,
  calculateMultiplePercentileRanks,
  calculatePercentileOfValue,
  percentileRankRequiredPeriods,
  getQuintile,
  getPercentileSignal,
  isExtreme,
  getRegimeSignal,
  generatePercentileOutputName,
  PERCENTILE_RANK_DEFAULTS,
};
