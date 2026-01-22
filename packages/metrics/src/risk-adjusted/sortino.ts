/**
 * Sortino Ratio calculations
 *
 * Developed by Frank Sortino.
 * Only penalizes downside volatility (what traders actually fear).
 * Better for asymmetric return distributions.
 *
 * Target: >1.0 acceptable, >2.0 good, >3.0 exceptional
 */

import { downsideDeviation, mean } from "./statistics.js";
import { DEFAULT_METRICS_CONFIG, type MetricsConfig } from "./types.js";

/**
 * Calculate Sortino Ratio
 *
 * Formula: (Return - Target) / Downside Deviation
 * Annualized: Multiply by sqrt(periods per year)
 *
 * @param returns Array of period returns (decimal)
 * @param config Metrics configuration
 * @returns Annualized Sortino ratio, or null if insufficient data
 */
export function calculateSortino(
	returns: number[],
	config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): number | null {
	if (returns.length < 2) {
		return null;
	}

	const meanReturn = mean(returns);
	const downDev = downsideDeviation(returns, config.targetReturn / config.periodsPerYear);

	if (downDev === 0) {
		return null; // No downside volatility case
	}

	// Convert annual target to per-period
	const periodTarget = config.targetReturn / config.periodsPerYear;

	// Excess return over target
	const excessReturn = meanReturn - periodTarget;

	// Sortino ratio (not yet annualized)
	const periodSortino = excessReturn / downDev;

	// Annualize
	return periodSortino * Math.sqrt(config.periodsPerYear);
}
