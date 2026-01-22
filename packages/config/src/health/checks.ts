/**
 * Built-in Health Check Implementations
 *
 * Factory functions for creating common health check types.
 */

import type { HealthCheckDefinition, HealthCheckResult, HealthStatus } from "./types.js";

/**
 * Create a simple HTTP health check.
 */
export function createHttpHealthCheck(
	name: string,
	url: string,
	options: { expectedStatus?: number; timeout?: number } = {},
): HealthCheckDefinition {
	const { expectedStatus = 200, timeout = 5000 } = options;

	return {
		name,
		check: async (): Promise<HealthCheckResult> => {
			const startTime = Date.now();
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				const response = await fetch(url, {
					method: "GET",
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				const responseTimeMs = Date.now() - startTime;

				if (response.status === expectedStatus) {
					return {
						component: name,
						status: "HEALTHY",
						message: `HTTP ${response.status}`,
						responseTimeMs,
						timestamp: new Date().toISOString(),
						details: { url, statusCode: response.status },
					};
				}

				return {
					component: name,
					status: "UNHEALTHY",
					message: `Expected ${expectedStatus}, got ${response.status}`,
					responseTimeMs,
					timestamp: new Date().toISOString(),
					details: { url, statusCode: response.status },
				};
			} catch (error) {
				return {
					component: name,
					status: "UNHEALTHY",
					message: error instanceof Error ? error.message : "HTTP check failed",
					responseTimeMs: Date.now() - startTime,
					timestamp: new Date().toISOString(),
					details: { url },
				};
			}
		},
	};
}

/**
 * Create a memory usage health check.
 */
export function createMemoryHealthCheck(
	name: string,
	options: { warningThresholdMB?: number; criticalThresholdMB?: number } = {},
): HealthCheckDefinition {
	const { warningThresholdMB = 500, criticalThresholdMB = 1000 } = options;

	return {
		name,
		check: async (): Promise<HealthCheckResult> => {
			const startTime = Date.now();
			const memUsage = process.memoryUsage();
			const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
			const responseTimeMs = Date.now() - startTime;

			let status: HealthStatus = "HEALTHY";
			let message = `Heap: ${heapUsedMB.toFixed(1)}MB`;

			if (heapUsedMB >= criticalThresholdMB) {
				status = "UNHEALTHY";
				message = `Critical: ${heapUsedMB.toFixed(1)}MB >= ${criticalThresholdMB}MB`;
			} else if (heapUsedMB >= warningThresholdMB) {
				status = "DEGRADED";
				message = `Warning: ${heapUsedMB.toFixed(1)}MB >= ${warningThresholdMB}MB`;
			}

			return {
				component: name,
				status,
				message,
				responseTimeMs,
				timestamp: new Date().toISOString(),
				details: {
					heapUsedMB: heapUsedMB.toFixed(1),
					heapTotalMB: (memUsage.heapTotal / (1024 * 1024)).toFixed(1),
					rssMB: (memUsage.rss / (1024 * 1024)).toFixed(1),
				},
			};
		},
	};
}

/**
 * Create a custom health check.
 */
export function createCustomHealthCheck(
	name: string,
	checkFn: () => Promise<{ healthy: boolean; message?: string; details?: Record<string, unknown> }>,
): HealthCheckDefinition {
	return {
		name,
		check: async (): Promise<HealthCheckResult> => {
			const startTime = Date.now();
			try {
				const result = await checkFn();
				return {
					component: name,
					status: result.healthy ? "HEALTHY" : "UNHEALTHY",
					message: result.message ?? (result.healthy ? "OK" : "Failed"),
					responseTimeMs: Date.now() - startTime,
					timestamp: new Date().toISOString(),
					details: result.details,
				};
			} catch (error) {
				return {
					component: name,
					status: "UNHEALTHY",
					message: error instanceof Error ? error.message : "Check failed",
					responseTimeMs: Date.now() - startTime,
					timestamp: new Date().toISOString(),
				};
			}
		},
	};
}
