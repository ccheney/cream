/**
 * Risk-Adjusted Performance Metrics
 *
 * Implements Sharpe, Sortino, and Calmar ratios for evaluating
 * trading strategy performance.
 *
 * @see docs/plans/11-configuration.md lines 1039-1079, 1301-1313
 */

import { calculateCalmar } from "./calmar.js";
import { calculateRawReturn, calculateReturns } from "./returns.js";
import { calculateSharpe } from "./sharpe.js";
import { calculateSortino } from "./sortino.js";
import {
	DEFAULT_METRICS_CONFIG,
	DEFAULT_WINDOWS,
	type MetricsConfig,
	type MetricsWindow,
	type PerformanceMetrics,
} from "./types.js";

export { calculateCalmar } from "./calmar.js";
// Re-export drawdown calculations
export { calculateCurrentDrawdown, calculateMaxDrawdown } from "./drawdown.js";
// Re-export return calculations
export { calculateRawReturn, calculateReturns, cumulativeReturn } from "./returns.js";
// Re-export rolling metrics
export { rollingMaxDrawdown, rollingSharpE, rollingSortino } from "./rolling.js";
// Re-export risk-adjusted ratios
export { calculateSharpe } from "./sharpe.js";
export { calculateSortino } from "./sortino.js";
// Re-export statistical helpers
export { downsideDeviation, mean, stdDev } from "./statistics.js";
// Re-export types
export type { MetricsConfig, MetricsWindow, PerformanceMetrics } from "./types.js";
export { DEFAULT_METRICS_CONFIG, DEFAULT_WINDOWS } from "./types.js";

// Re-export utility functions
export { gradePerformance, isAcceptablePerformance } from "./utils.js";

/**
 * Calculate all performance metrics for a given window
 *
 * @param equity Full equity curve
 * @param window Window configuration
 * @param config Metrics configuration
 * @returns Performance metrics for the window
 */
export function calculateMetricsForWindow(
	equity: number[],
	window: MetricsWindow,
	config: MetricsConfig = DEFAULT_METRICS_CONFIG
): PerformanceMetrics {
	// Get the last N periods for this window
	const windowEquity =
		equity.length <= window.period ? equity : equity.slice(equity.length - window.period);

	// Calculate returns from equity
	const returns = calculateReturns(windowEquity);

	// Calculate all metrics
	return {
		rawReturn: calculateRawReturn(windowEquity),
		sharpe: calculateSharpe(returns, config),
		sortino: calculateSortino(returns, config),
		calmar: calculateCalmar(returns, windowEquity, config),
		window: window.label,
		timestamp: new Date().toISOString(),
	};
}

/**
 * Calculate metrics for all configured windows
 *
 * @param equity Full equity curve
 * @param windows Array of window configurations
 * @param config Metrics configuration
 * @returns Array of performance metrics for each window
 */
export function calculateAllMetrics(
	equity: number[],
	windows: MetricsWindow[] = DEFAULT_WINDOWS,
	config: MetricsConfig = DEFAULT_METRICS_CONFIG
): PerformanceMetrics[] {
	return windows.map((window) => calculateMetricsForWindow(equity, window, config));
}
