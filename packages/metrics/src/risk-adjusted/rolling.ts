/**
 * Rolling metrics calculations
 */

import { calculateMaxDrawdown } from "./drawdown.js";
import { calculateSharpe } from "./sharpe.js";
import { calculateSortino } from "./sortino.js";
import { DEFAULT_METRICS_CONFIG, type MetricsConfig } from "./types.js";

/**
 * Calculate rolling Sharpe ratio
 *
 * @param returns Array of period returns
 * @param windowSize Rolling window size
 * @param config Metrics configuration
 * @returns Array of rolling Sharpe values (null for insufficient data periods)
 */
export function rollingSharpE(
	returns: number[],
	windowSize: number,
	config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): (number | null)[] {
	const result: (number | null)[] = [];

	for (let i = 0; i < returns.length; i++) {
		if (i < windowSize - 1) {
			result.push(null);
		} else {
			const windowReturns = returns.slice(i - windowSize + 1, i + 1);
			result.push(calculateSharpe(windowReturns, config));
		}
	}

	return result;
}

/**
 * Calculate rolling Sortino ratio
 *
 * @param returns Array of period returns
 * @param windowSize Rolling window size
 * @param config Metrics configuration
 * @returns Array of rolling Sortino values
 */
export function rollingSortino(
	returns: number[],
	windowSize: number,
	config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): (number | null)[] {
	const result: (number | null)[] = [];

	for (let i = 0; i < returns.length; i++) {
		if (i < windowSize - 1) {
			result.push(null);
		} else {
			const windowReturns = returns.slice(i - windowSize + 1, i + 1);
			result.push(calculateSortino(windowReturns, config));
		}
	}

	return result;
}

/**
 * Calculate rolling max drawdown
 *
 * @param equity Array of equity values
 * @param windowSize Rolling window size
 * @returns Array of rolling max drawdown values
 */
export function rollingMaxDrawdown(equity: number[], windowSize: number): number[] {
	const result: number[] = [];

	for (let i = 0; i < equity.length; i++) {
		if (i < windowSize - 1) {
			result.push(0);
		} else {
			const windowEquity = equity.slice(i - windowSize + 1, i + 1);
			result.push(calculateMaxDrawdown(windowEquity));
		}
	}

	return result;
}
