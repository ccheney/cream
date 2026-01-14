/**
 * @cream/metrics - Performance and Risk Metrics
 *
 * This package provides risk-adjusted performance metrics
 * for evaluating trading strategy performance.
 */

export const PACKAGE_NAME = "@cream/metrics";
export const VERSION = "0.0.1";

// ============================================
// Risk-Adjusted Metrics
// ============================================

export {
	calculateAllMetrics,
	calculateCalmar,
	calculateCurrentDrawdown,
	calculateMaxDrawdown,
	calculateMetricsForWindow,
	calculateRawReturn,
	calculateReturns,
	calculateSharpe,
	calculateSortino,
	cumulativeReturn,
	DEFAULT_METRICS_CONFIG,
	DEFAULT_WINDOWS,
	downsideDeviation,
	gradePerformance,
	isAcceptablePerformance,
	type MetricsConfig,
	type MetricsWindow,
	mean,
	type PerformanceMetrics,
	rollingMaxDrawdown,
	rollingSharpE,
	rollingSortino,
	stdDev,
} from "./risk-adjusted/index.js";
