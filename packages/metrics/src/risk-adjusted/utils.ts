/**
 * Utility functions for performance metrics
 */

import type { PerformanceMetrics } from "./types.js";

/**
 * Check if metrics indicate acceptable performance
 *
 * Based on industry standards:
 * - Sharpe > 1.0 acceptable
 * - Sortino > 1.0 acceptable
 * - Calmar > 1.0 acceptable
 */
export function isAcceptablePerformance(metrics: PerformanceMetrics): boolean {
	const { sharpe, sortino, calmar } = metrics;

	// All metrics must be above 1.0 threshold
	const sharpeOk = sharpe === null || sharpe >= 1.0;
	const sortinoOk = sortino === null || sortino >= 1.0;
	const calmarOk = calmar === null || calmar >= 1.0;

	return sharpeOk && sortinoOk && calmarOk;
}

/**
 * Grade performance based on metrics
 *
 * @returns "exceptional" (>3.0), "elite" (>2.0), "acceptable" (>1.0), or "poor"
 */
export function gradePerformance(
	metrics: PerformanceMetrics,
): "exceptional" | "elite" | "acceptable" | "poor" {
	const { sharpe, sortino, calmar } = metrics;

	// Get minimum non-null metric
	const values = [sharpe, sortino, calmar].filter((v) => v !== null) as number[];
	if (values.length === 0) {
		return "poor";
	}

	const minMetric = Math.min(...values);

	if (minMetric >= 3.0) {
		return "exceptional";
	}
	if (minMetric >= 2.0) {
		return "elite";
	}
	if (minMetric >= 1.0) {
		return "acceptable";
	}
	return "poor";
}
