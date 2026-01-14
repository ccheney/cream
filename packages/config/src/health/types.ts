/**
 * Health Check System Type Definitions
 *
 * Core types and interfaces for the component health monitoring system.
 */

/**
 * Health status levels.
 */
export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

/**
 * Individual health check result.
 */
export interface HealthCheckResult {
	/** Component name */
	component: string;

	/** Current status */
	status: HealthStatus;

	/** Status message */
	message: string;

	/** Response time in milliseconds */
	responseTimeMs: number;

	/** Timestamp of check */
	timestamp: string;

	/** Optional details */
	details?: Record<string, unknown>;
}

/**
 * Health check function signature.
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Component health configuration.
 */
export interface ComponentHealthConfig {
	/** Component name */
	name: string;

	/** Health check function */
	check: HealthCheckFn;

	/** Check interval in milliseconds */
	intervalMs: number;

	/** Timeout for health check */
	timeoutMs: number;

	/** Number of failures before marking unhealthy */
	failureThreshold: number;

	/** Number of successes before marking healthy */
	successThreshold: number;

	/** Whether this component is critical */
	critical: boolean;
}

/**
 * Aggregated system health status.
 */
export interface SystemHealth {
	/** Overall system status */
	status: HealthStatus;

	/** Individual component statuses */
	components: HealthCheckResult[];

	/** Number of healthy components */
	healthyCount: number;

	/** Number of degraded components */
	degradedCount: number;

	/** Number of unhealthy components */
	unhealthyCount: number;

	/** Timestamp */
	timestamp: string;

	/** Uptime in seconds */
	uptimeSeconds: number;
}

/**
 * Health check configuration.
 */
export interface HealthCheckConfig {
	/** Default check interval */
	defaultIntervalMs: number;

	/** Default timeout */
	defaultTimeoutMs: number;

	/** Default failure threshold */
	defaultFailureThreshold: number;

	/** Default success threshold */
	defaultSuccessThreshold: number;

	/** History size to retain */
	historySize: number;

	/** Enable automatic checking */
	enableAutoCheck: boolean;
}

/**
 * Internal component state tracking.
 */
export interface ComponentState {
	config: ComponentHealthConfig;
	lastResult: HealthCheckResult | null;
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	status: HealthStatus;
}

/**
 * Health check definition returned by factory functions.
 */
export interface HealthCheckDefinition {
	name: string;
	check: HealthCheckFn;
}
