/**
 * Health Status Aggregation
 *
 * Logic for aggregating individual component health checks into system-wide status.
 */

import type { ComponentState, HealthCheckResult, HealthStatus, SystemHealth } from "./types.js";

/**
 * Calculate effective health status based on consecutive success/failure thresholds.
 */
export function calculateEffectiveStatus(state: ComponentState): HealthStatus {
	if (state.consecutiveFailures >= state.config.failureThreshold) {
		return "UNHEALTHY";
	}
	if (state.consecutiveSuccesses >= state.config.successThreshold) {
		return "HEALTHY";
	}
	if (state.consecutiveFailures > 0) {
		return "DEGRADED";
	}
	return state.status;
}

/**
 * Count health statuses from a list of results.
 */
export function countHealthStatuses(results: HealthCheckResult[]): {
	healthyCount: number;
	degradedCount: number;
	unhealthyCount: number;
} {
	let healthyCount = 0;
	let degradedCount = 0;
	let unhealthyCount = 0;

	for (const result of results) {
		switch (result.status) {
			case "HEALTHY":
				healthyCount++;
				break;
			case "DEGRADED":
				degradedCount++;
				break;
			case "UNHEALTHY":
				unhealthyCount++;
				break;
		}
	}

	return { healthyCount, degradedCount, unhealthyCount };
}

/**
 * Determine overall system health status.
 */
export function determineOverallStatus(
	counts: { healthyCount: number; degradedCount: number; unhealthyCount: number },
	hasCriticalFailure: boolean,
): HealthStatus {
	const { healthyCount, degradedCount, unhealthyCount } = counts;

	if (unhealthyCount > 0 && hasCriticalFailure) {
		return "UNHEALTHY";
	}
	if (unhealthyCount > 0 || degradedCount > 0) {
		return "DEGRADED";
	}
	if (healthyCount > 0) {
		return "HEALTHY";
	}
	return "UNKNOWN";
}

/**
 * Aggregate health check results into a SystemHealth summary.
 */
export function aggregateHealthResults(
	results: HealthCheckResult[],
	hasCriticalFailure: boolean,
	startTime: number,
): SystemHealth {
	const counts = countHealthStatuses(results);
	const status = determineOverallStatus(counts, hasCriticalFailure);

	return {
		status,
		components: results,
		healthyCount: counts.healthyCount,
		degradedCount: counts.degradedCount,
		unhealthyCount: counts.unhealthyCount,
		timestamp: new Date().toISOString(),
		uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
	};
}
