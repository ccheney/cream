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

export const VOLATILITY_SCALE_DEFAULTS: VolatilityScaleParams = {
  volatilityPeriod: 20,
  targetVolatility: 0.15,
  minVolatility: 0.01,
  maxScaleFactor: 3.0,
};

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

export function calculateRollingVolatility(returns: number[], period: number): number[] {
  const results: number[] = [];

  for (let i = period - 1; i < returns.length; i++) {
    const window = returns.slice(i - period + 1, i + 1);
    const vol = calculateStdDev(window);
    results.push(vol);
  }

  return results;
}

export function calculateScaleFactor(
  currentVolatility: number,
  targetVolatility: number,
  minVolatility = 0.01,
  maxScaleFactor = 3.0
): number {
  const adjustedVol = Math.max(currentVolatility, minVolatility);
  const scaleFactor = targetVolatility / adjustedVol;
  return Math.min(scaleFactor, maxScaleFactor);
}

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

  const volatilities = calculateRollingVolatility(returns, volatilityPeriod);

  // First volatility value aligns with index (volatilityPeriod - 1) in the input arrays
  const offset = volatilityPeriod - 1;

  for (let i = 0; i < volatilities.length; i++) {
    const valueIndex = offset + i;

    if (valueIndex >= values.length) {
      break;
    }

    const volatility = volatilities[i]!;
    const scaleFactor = calculateScaleFactor(
      volatility,
      targetVolatility,
      minVolatility,
      maxScaleFactor
    );

    results.push({
      timestamp: timestamps[valueIndex]!,
      scaledValue: values[valueIndex]! * scaleFactor,
      originalValue: values[valueIndex]!,
      scaleFactor,
      volatility,
    });
  }

  return results;
}

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

export function volatilityScaleRequiredPeriods(
  params: VolatilityScaleParams = VOLATILITY_SCALE_DEFAULTS
): number {
  return params.volatilityPeriod;
}

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

export function generateVolatilityScaleOutputName(inputName: string, suffix = "volscale"): string {
  return `${inputName}_${suffix}`;
}

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
