/**
 * Health Check Registry
 *
 * Central registry for managing component health checks with automatic
 * checking, threshold tracking, and history management.
 */

import { aggregateHealthResults, calculateEffectiveStatus } from "./aggregation.js";
import type {
	ComponentHealthConfig,
	ComponentState,
	HealthCheckConfig,
	HealthCheckFn,
	HealthCheckResult,
	SystemHealth,
} from "./types.js";

const DEFAULT_CONFIG: HealthCheckConfig = {
	defaultIntervalMs: 30000, // 30 seconds
	defaultTimeoutMs: 5000, // 5 seconds
	defaultFailureThreshold: 3,
	defaultSuccessThreshold: 1,
	historySize: 100,
	enableAutoCheck: false,
};

/**
 * Registry for managing component health checks.
 */
export class HealthCheckRegistry {
	private readonly config: HealthCheckConfig;
	private readonly components: Map<string, ComponentState> = new Map();
	private readonly history: HealthCheckResult[] = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private readonly startTime: number;

	constructor(config: Partial<HealthCheckConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.startTime = Date.now();
	}

	/**
	 * Register a component for health checking.
	 */
	register(
		component: Partial<ComponentHealthConfig> & { name: string; check: HealthCheckFn },
	): void {
		const fullConfig: ComponentHealthConfig = {
			name: component.name,
			check: component.check,
			intervalMs: component.intervalMs ?? this.config.defaultIntervalMs,
			timeoutMs: component.timeoutMs ?? this.config.defaultTimeoutMs,
			failureThreshold: component.failureThreshold ?? this.config.defaultFailureThreshold,
			successThreshold: component.successThreshold ?? this.config.defaultSuccessThreshold,
			critical: component.critical ?? false,
		};

		this.components.set(component.name, {
			config: fullConfig,
			lastResult: null,
			consecutiveFailures: 0,
			consecutiveSuccesses: 0,
			status: "UNKNOWN",
		});
	}

	/**
	 * Unregister a component.
	 */
	unregister(name: string): boolean {
		return this.components.delete(name);
	}

	/**
	 * Check a specific component's health.
	 */
	async checkComponent(name: string): Promise<HealthCheckResult> {
		const state = this.components.get(name);
		if (!state) {
			return {
				component: name,
				status: "UNKNOWN",
				message: "Component not registered",
				responseTimeMs: 0,
				timestamp: new Date().toISOString(),
			};
		}

		const startTime = Date.now();
		let result: HealthCheckResult;

		try {
			result = await Promise.race([
				state.config.check(),
				this.createTimeoutPromise(name, state.config.timeoutMs),
			]);

			if (result.status === "HEALTHY") {
				state.consecutiveSuccesses++;
				state.consecutiveFailures = 0;
			} else {
				state.consecutiveFailures++;
				state.consecutiveSuccesses = 0;
			}
		} catch (error) {
			state.consecutiveFailures++;
			state.consecutiveSuccesses = 0;

			result = {
				component: name,
				status: "UNHEALTHY",
				message: error instanceof Error ? error.message : "Health check failed",
				responseTimeMs: Date.now() - startTime,
				timestamp: new Date().toISOString(),
			};
		}

		state.status = calculateEffectiveStatus(state);
		result.status = state.status;

		state.lastResult = result;
		this.addToHistory(result);

		return result;
	}

	/**
	 * Check all registered components.
	 */
	async checkAll(): Promise<SystemHealth> {
		const results = await Promise.all(
			Array.from(this.components.keys()).map((name) => this.checkComponent(name)),
		);

		return aggregateHealthResults(results, this.hasCriticalFailure(), this.startTime);
	}

	/**
	 * Get the last known result for a component.
	 */
	getLastResult(name: string): HealthCheckResult | null {
		return this.components.get(name)?.lastResult ?? null;
	}

	/**
	 * Get current system health without running new checks.
	 */
	getSystemHealth(): SystemHealth {
		const results: HealthCheckResult[] = [];

		for (const [name, state] of this.components) {
			results.push(
				state.lastResult ?? {
					component: name,
					status: "UNKNOWN",
					message: "Not yet checked",
					responseTimeMs: 0,
					timestamp: new Date().toISOString(),
				},
			);
		}

		return aggregateHealthResults(results, this.hasCriticalFailure(), this.startTime);
	}

	/**
	 * Get health check history.
	 */
	getHistory(component?: string): HealthCheckResult[] {
		if (component) {
			return this.history.filter((r) => r.component === component);
		}
		return [...this.history];
	}

	/**
	 * Start automatic health checking.
	 */
	startAutoCheck(): void {
		if (this.intervalId) {
			return;
		}

		this.intervalId = setInterval(async () => {
			await this.checkAll();
		}, this.config.defaultIntervalMs);
	}

	/**
	 * Stop automatic health checking.
	 */
	stopAutoCheck(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * Check if any critical components are unhealthy.
	 */
	hasCriticalFailure(): boolean {
		for (const state of this.components.values()) {
			if (state.config.critical && state.status === "UNHEALTHY") {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get list of unhealthy components.
	 */
	getUnhealthyComponents(): string[] {
		const unhealthy: string[] = [];
		for (const [name, state] of this.components) {
			if (state.status === "UNHEALTHY") {
				unhealthy.push(name);
			}
		}
		return unhealthy;
	}

	/**
	 * Clear health history.
	 */
	clearHistory(): void {
		this.history.length = 0;
	}

	private createTimeoutPromise(_component: string, timeoutMs: number): Promise<HealthCheckResult> {
		return new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Health check timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});
	}

	private addToHistory(result: HealthCheckResult): void {
		this.history.push(result);

		while (this.history.length > this.config.historySize) {
			this.history.shift();
		}
	}
}
