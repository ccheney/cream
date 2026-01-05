/**
 * Volatility Scale Transform
 *
 * Scale values by recent volatility for risk-adjusted normalization.
 * Useful for position sizing and comparing signals across different volatility regimes.
 *
 * Formula:
 *   Scaled Value = Value * (Target Volatility / Recent Volatility)
 *
 * Use Cases:
 *   - Risk-adjusted position sizing
 *   - Normalizing signals across different volatility environments
 *   - Volatility targeting strategies
 *
 * Benefits:
 *   - Accounts for changing market conditions
 *   - Prevents outsized positions during high volatility
 *   - Increases positions during low volatility
 */

import { calculateStdDev } from "./zscore";

// ============================================
// Parameters
// ============================================

/**
 * Volatility scale transform parameters.
 */
export interface VolatilityScaleParams {
  /** Period for volatility calculation */
  volatilityPeriod: number;
  /** Target volatility for scaling (e.g., 0.15 for 15% annualized) */
  targetVolatility: number;
  /** Minimum volatility floor to prevent extreme scaling */
  minVolatility?: number;
  /** Maximum scale factor to prevent extreme adjustments */
  maxScaleFactor?: number;
}

/**
 * Default volatility scale parameters.
 */
export const VOLATILITY_SCALE_DEFAULTS: VolatilityScaleParams = {
  volatilityPeriod: 20,
  targetVolatility: 0.15,
  minVolatility: 0.01,
  maxScaleFactor: 3.0,
};

// ============================================
// Result Types
// ============================================

/**
 * Volatility scale result.
 */
export interface VolatilityScaleResult {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Scaled value */
  scaledValue: number;
  /** Original value */
  originalValue: number;
  /** Scale factor applied */
  scaleFactor: number;
  /** Recent volatility used */
  volatility: number;
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate rolling volatility (standard deviation of returns).
 *
 * @param returns - Return values (oldest first)
 * @param period - Rolling window period
 * @returns Rolling volatility values
 */
export function calculateRollingVolatility(returns: number[], period: number): number[] {
  const results: number[] = [];

  for (let i = period - 1; i < returns.length; i++) {
    const window = returns.slice(i - period + 1, i + 1);
    const vol = calculateStdDev(window);
    results.push(vol);
  }

  return results;
}

/**
 * Calculate scale factor based on volatility.
 *
 * @param currentVolatility - Current volatility
 * @param targetVolatility - Target volatility
 * @param minVolatility - Minimum volatility floor
 * @param maxScaleFactor - Maximum scale factor
 * @returns Scale factor
 */
export function calculateScaleFactor(
  currentVolatility: number,
  targetVolatility: number,
  minVolatility = 0.01,
  maxScaleFactor = 3.0
): number {
  // Apply minimum volatility floor
  const adjustedVol = Math.max(currentVolatility, minVolatility);

  // Calculate scale factor
  const scaleFactor = targetVolatility / adjustedVol;

  // Cap scale factor
  return Math.min(scaleFactor, maxScaleFactor);
}

/**
 * Calculate volatility-scaled values.
 *
 * @param values - Input values to scale (oldest first)
 * @param returns - Return values for volatility calculation
 * @param timestamps - Corresponding timestamps
 * @param params - Volatility scale parameters
 * @returns Array of volatility scale results
 */
export function calculateVolatilityScale(
  values: number[],
  returns: number[],
  timestamps: number[],
  params: VolatilityScaleParams = VOLATILITY_SCALE_DEFAULTS
): VolatilityScaleResult[] {
  const { volatilityPeriod, targetVolatility, minVolatility = 0.01, maxScaleFactor = 3.0 } = params;

  const results: VolatilityScaleResult[] = [];

  if (returns.length < volatilityPeriod) {
    return results;
  }

  // Calculate rolling volatility
  const volatilities = calculateRollingVolatility(returns, volatilityPeriod);

  // The first volatility corresponds to index (volatilityPeriod - 1) in returns
  // We need to align with values/timestamps
  const offset = volatilityPeriod - 1;

  for (let i = 0; i < volatilities.length; i++) {
    const valueIndex = offset + i;

    if (valueIndex >= values.length) {
      break;
    }

    const volatility = volatilities[i];
    const scaleFactor = calculateScaleFactor(
      volatility,
      targetVolatility,
      minVolatility,
      maxScaleFactor
    );

    results.push({
      timestamp: timestamps[valueIndex],
      scaledValue: values[valueIndex] * scaleFactor,
      originalValue: values[valueIndex],
      scaleFactor,
      volatility,
    });
  }

  return results;
}

/**
 * Calculate volatility-scaled values for multiple inputs.
 *
 * @param inputsMap - Map of input name to values
 * @param returns - Shared returns for volatility calculation
 * @param timestamps - Shared timestamps
 * @param params - Volatility scale parameters
 * @returns Map of input name to volatility scale results
 */
export function calculateMultipleVolatilityScales(
  inputsMap: Map<string, number[]>,
  returns: number[],
  timestamps: number[],
  params: VolatilityScaleParams = VOLATILITY_SCALE_DEFAULTS
): Map<string, VolatilityScaleResult[]> {
  const results = new Map<string, VolatilityScaleResult[]>();

  for (const [name, values] of inputsMap) {
    results.set(name, calculateVolatilityScale(values, returns, timestamps, params));
  }

  return results;
}

/**
 * Get required periods for volatility scale calculation.
 */
export function volatilityScaleRequiredPeriods(
  params: VolatilityScaleParams = VOLATILITY_SCALE_DEFAULTS
): number {
  return params.volatilityPeriod;
}

// ============================================
// Volatility Analysis
// ============================================

/**
 * Get volatility regime based on current vs target.
 *
 * @param currentVolatility - Current volatility
 * @param targetVolatility - Target volatility
 * @returns Volatility regime
 */
export function getVolatilityRegime(
  currentVolatility: number,
  targetVolatility: number
): "very_low" | "low" | "normal" | "high" | "very_high" {
  const ratio = currentVolatility / targetVolatility;

  if (ratio < 0.5) {
    return "very_low";
  }
  if (ratio < 0.8) {
    return "low";
  }
  if (ratio > 2.0) {
    return "very_high";
  }
  if (ratio > 1.25) {
    return "high";
  }
  return "normal";
}

/**
 * Calculate position size multiplier based on volatility.
 *
 * @param currentVolatility - Current volatility
 * @param targetVolatility - Target volatility
 * @param minMultiplier - Minimum position multiplier
 * @param maxMultiplier - Maximum position multiplier
 * @returns Position size multiplier
 */
export function calculatePositionMultiplier(
  currentVolatility: number,
  targetVolatility: number,
  minMultiplier = 0.25,
  maxMultiplier = 2.0
): number {
  if (currentVolatility <= 0) {
    return 1.0;
  }

  const multiplier = targetVolatility / currentVolatility;
  return Math.max(minMultiplier, Math.min(maxMultiplier, multiplier));
}

/**
 * Generate output name for volatility scale.
 *
 * @param inputName - Input feature name
 * @param suffix - Suffix for output name (default: "volscale")
 * @returns Output name
 */
export function generateVolatilityScaleOutputName(inputName: string, suffix = "volscale"): string {
  return `${inputName}_${suffix}`;
}

// ============================================
// Exports
// ============================================

export default {
  calculateVolatilityScale,
  calculateMultipleVolatilityScales,
  calculateRollingVolatility,
  calculateScaleFactor,
  volatilityScaleRequiredPeriods,
  getVolatilityRegime,
  calculatePositionMultiplier,
  generateVolatilityScaleOutputName,
  VOLATILITY_SCALE_DEFAULTS,
};
