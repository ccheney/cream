/**
 * Calmar Ratio calculations
 *
 * Developed by Terry Young (1991).
 * Addresses maximum loss exposure directly.
 * Best for understanding worst-case scenarios.
 *
 * Target: >1.0 acceptable, >2.0 elite, >3.0 exceptional
 */

import { calculateMaxDrawdown } from "./drawdown.js";
import { cumulativeReturn } from "./returns.js";
import { DEFAULT_METRICS_CONFIG, type MetricsConfig } from "./types.js";

/**
 * Calculate Calmar Ratio
 *
 * Formula: Annual Return / Max Drawdown
 *
 * @param returns Array of period returns (decimal)
 * @param equity Array of equity values (for drawdown calculation)
 * @param config Metrics configuration
 * @returns Calmar ratio, or null if insufficient data or no drawdown
 */
export function calculateCalmar(
  returns: number[],
  equity: number[],
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): number | null {
  if (returns.length < 2 || equity.length < 2) {
    return null;
  }

  const maxDD = calculateMaxDrawdown(equity);
  if (maxDD === 0) {
    return null; // No drawdown case (all gains)
  }

  // Calculate annualized return
  const totalReturn = cumulativeReturn(returns);
  const periods = returns.length;
  const years = periods / config.periodsPerYear;

  // Annualized return (CAGR formula)
  const annualizedReturn = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : totalReturn;

  // Calmar ratio
  return annualizedReturn / maxDD;
}
