/**
 * Z-Score Transform
 *
 * Standardize values by subtracting mean and dividing by standard deviation.
 * Produces values with mean=0 and std=1 within the lookback window.
 *
 * Formula:
 *   Z = (X - μ) / σ
 *   where μ = rolling mean, σ = rolling standard deviation
 *
 * Use Cases:
 *   - Mean reversion strategies (|Z| > 2 is significant at 95% confidence)
 *   - ML preprocessing (standardizes features to same scale)
 *   - Cross-feature comparison
 *
 * Assumptions:
 *   - Assumes approximately normal distribution
 *   - May be affected by outliers
 *   - Use percentile rank for non-normal distributions
 *
 * @see https://en.wikipedia.org/wiki/Standard_score
 */

// ============================================
// Parameters
// ============================================

/**
 * Z-score transform parameters.
 */
export interface ZScoreParams {
  /** Rolling window lookback period */
  lookback: number;
  /** Minimum samples required for valid calculation */
  minSamples?: number;
}

/**
 * Default z-score parameters.
 */
export const ZSCORE_DEFAULTS: ZScoreParams = {
  lookback: 20,
  minSamples: 5,
};

// ============================================
// Result Types
// ============================================

/**
 * Z-score result.
 */
export interface ZScoreResult {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Z-score value */
  zscore: number;
  /** Rolling mean used */
  mean: number;
  /** Rolling standard deviation used */
  std: number;
}

// ============================================
// Statistical Functions
// ============================================

/**
 * Calculate mean of an array.
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate standard deviation of an array.
 *
 * @param values - Array of values
 * @param mean - Pre-calculated mean (optional)
 * @returns Standard deviation
 */
export function calculateStdDev(values: number[], mean?: number): number {
  if (values.length < 2) return 0;

  const m = mean ?? calculateMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - m, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(variance);
}

// ============================================
// Z-Score Calculation
// ============================================

/**
 * Calculate z-scores for a time series.
 *
 * @param values - Input values (oldest first)
 * @param timestamps - Corresponding timestamps
 * @param params - Z-score parameters
 * @returns Array of z-score results
 */
export function calculateZScore(
  values: number[],
  timestamps: number[],
  params: ZScoreParams = ZSCORE_DEFAULTS
): ZScoreResult[] {
  const { lookback, minSamples = 5 } = params;
  const results: ZScoreResult[] = [];

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

    const mean = calculateMean(window);
    const std = calculateStdDev(window, mean);

    // Avoid division by zero
    const zscore = std === 0 ? 0 : (values[i] - mean) / std;

    results.push({
      timestamp: timestamps[i],
      zscore,
      mean,
      std,
    });
  }

  return results;
}

/**
 * Calculate z-scores for multiple input series.
 *
 * @param inputsMap - Map of input name to values
 * @param timestamps - Shared timestamps
 * @param params - Z-score parameters
 * @returns Map of input name to z-score results
 */
export function calculateMultipleZScores(
  inputsMap: Map<string, number[]>,
  timestamps: number[],
  params: ZScoreParams = ZSCORE_DEFAULTS
): Map<string, ZScoreResult[]> {
  const results = new Map<string, ZScoreResult[]>();

  for (const [name, values] of inputsMap) {
    results.set(name, calculateZScore(values, timestamps, params));
  }

  return results;
}

/**
 * Get required periods for z-score calculation.
 */
export function zscoreRequiredPeriods(params: ZScoreParams = ZSCORE_DEFAULTS): number {
  return params.minSamples ?? 5;
}

// ============================================
// Z-Score Interpretation
// ============================================

/**
 * Check if z-score indicates significant deviation.
 *
 * @param zscore - Z-score value
 * @param threshold - Significance threshold (default: 2.0 for 95% confidence)
 * @returns true if significant
 */
export function isSignificant(zscore: number, threshold = 2.0): boolean {
  return Math.abs(zscore) >= threshold;
}

/**
 * Get z-score signal.
 *
 * @param zscore - Z-score value
 * @param threshold - Significance threshold
 * @returns Signal interpretation
 */
export function getZScoreSignal(
  zscore: number,
  threshold = 2.0
): "extremely_high" | "high" | "neutral" | "low" | "extremely_low" {
  if (zscore >= threshold * 1.5) return "extremely_high";
  if (zscore >= threshold) return "high";
  if (zscore <= -threshold * 1.5) return "extremely_low";
  if (zscore <= -threshold) return "low";
  return "neutral";
}

/**
 * Check if z-score suggests mean reversion opportunity.
 *
 * @param zscore - Z-score value
 * @param entryThreshold - Z-score threshold to enter (default: 2.0)
 * @returns Direction to trade for mean reversion (or null)
 */
export function meanReversionSignal(
  zscore: number,
  entryThreshold = 2.0
): "long" | "short" | null {
  if (zscore <= -entryThreshold) return "long"; // Price far below mean, expect reversion up
  if (zscore >= entryThreshold) return "short"; // Price far above mean, expect reversion down
  return null;
}

/**
 * Generate output name for z-score.
 *
 * @param inputName - Input feature name
 * @param suffix - Suffix for output name (default: "zscore")
 * @returns Output name
 */
export function generateZScoreOutputName(
  inputName: string,
  suffix = "zscore"
): string {
  return `${inputName}_${suffix}`;
}

// ============================================
// Exports
// ============================================

export default {
  calculateZScore,
  calculateMultipleZScores,
  zscoreRequiredPeriods,
  isSignificant,
  getZScoreSignal,
  meanReversionSignal,
  generateZScoreOutputName,
  calculateMean,
  calculateStdDev,
  ZSCORE_DEFAULTS,
};
