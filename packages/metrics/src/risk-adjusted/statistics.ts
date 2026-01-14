/**
 * Statistical helper functions for risk metrics calculations
 */

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate sample standard deviation
 */
export function stdDev(values: number[], meanValue?: number): number {
	if (values.length < 2) {
		return 0;
	}

	const avg = meanValue ?? mean(values);
	const squaredDiffs = values.map((v) => (v - avg) ** 2);
	const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
	const result = Math.sqrt(variance);

	// Handle floating point precision - treat very small values as 0
	return result < 1e-10 ? 0 : result;
}

/**
 * Calculate downside deviation (only negative returns)
 *
 * Formula: sqrt(sum((min(return - target, 0))^2) / n)
 */
export function downsideDeviation(returns: number[], targetReturn = 0): number {
	if (returns.length === 0) {
		return 0;
	}

	const downsideReturns = returns.map((r) => Math.min(r - targetReturn, 0));
	const squaredDownside = downsideReturns.map((r) => r ** 2);
	const avgSquared = squaredDownside.reduce((sum, v) => sum + v, 0) / returns.length;

	return Math.sqrt(avgSquared);
}
