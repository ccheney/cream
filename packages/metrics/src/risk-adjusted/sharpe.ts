/**
 * Sharpe Ratio calculations
 *
 * Developed by William Sharpe (1966), Nobel Prize winner.
 * Industry standard, penalizes both up/down volatility equally.
 *
 * Target: >1.0 acceptable, >2.0 professional, >3.0 exceptional
 */

import { mean, stdDev } from "./statistics.js";
import { DEFAULT_METRICS_CONFIG, type MetricsConfig } from "./types.js";

/**
 * Calculate Sharpe Ratio
 *
 * Formula: (Return - Risk-Free Rate) / Std Dev
 * Annualized: Multiply by sqrt(periods per year)
 *
 * @param returns Array of period returns (decimal)
 * @param config Metrics configuration
 * @returns Annualized Sharpe ratio, or null if insufficient data
 */
export function calculateSharpe(
  returns: number[],
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): number | null {
  if (returns.length < 2) {
    return null;
  }

  const meanReturn = mean(returns);
  const std = stdDev(returns, meanReturn);

  if (std === 0) {
    return null; // Zero volatility case
  }

  // Convert annual risk-free rate to per-period
  const periodRiskFreeRate = config.riskFreeRate / config.periodsPerYear;

  // Calculate per-period excess return
  const excessReturn = meanReturn - periodRiskFreeRate;

  // Sharpe ratio (not yet annualized)
  const periodSharpe = excessReturn / std;

  // Annualize: multiply by sqrt(periods per year)
  return periodSharpe * Math.sqrt(config.periodsPerYear);
}
