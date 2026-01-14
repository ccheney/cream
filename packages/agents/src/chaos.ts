/**
 * Chaos Testing Framework
 *
 * Provides utilities for simulating failures and edge cases to validate
 * system resilience. Implements principles from Chaos Engineering.
 *
 * Key features:
 * - Configurable failure injection
 * - Network fault simulation (latency, timeouts, errors)
 * - Rate limit simulation
 * - Data corruption simulation
 * - Random failure patterns
 *
 * Usage:
 *   const chaos = new ChaosEngine({ failureRate: 0.2 });
 *   const result = await chaos.wrap(apiCall, 'api-call');
 */

// ============================================
// Types
// ============================================

/**
 * Types of chaos failures to inject.
 */
export type ChaosFailureType =
	| "timeout"
	| "network_error"
	| "rate_limit"
	| "server_error"
	| "corrupt_response"
	| "slow_response"
	| "connection_reset";

/**
 * Chaos configuration.
 */
export interface ChaosConfig {
	/** Whether chaos injection is enabled */
	enabled: boolean;

	/** Base failure rate (0-1) */
	failureRate: number;

	/** Which failure types to inject */
	enabledFailures: ChaosFailureType[];

	/** Minimum latency to add (ms) */
	minLatencyMs: number;

	/** Maximum latency to add (ms) */
	maxLatencyMs: number;

	/** Timeout threshold (ms) */
	timeoutMs: number;

	/** Rate limit retry-after value */
	rateLimitRetryAfterMs: number;

	/** Whether to log chaos events */
	logEvents: boolean;

	/** Logger */
	logger?: ChaosLogger;
}

/**
 * Chaos event for logging.
 */
export interface ChaosEvent {
	/** Type of failure injected */
	type: ChaosFailureType;

	/** Operation name */
	operation: string;

	/** Timestamp */
	timestamp: string;

	/** Additional details */
	details?: Record<string, unknown>;
}

/**
 * Logger interface.
 */
export interface ChaosLogger {
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_LOGGER: ChaosLogger = {
	info: (_msg, _data) => {},
	warn: (_msg, _data) => {},
	error: (_msg, _data) => {},
};

const DEFAULT_CONFIG: ChaosConfig = {
	enabled: false,
	failureRate: 0.1,
	enabledFailures: ["timeout", "network_error", "rate_limit", "server_error", "slow_response"],
	minLatencyMs: 100,
	maxLatencyMs: 2000,
	timeoutMs: 30000,
	rateLimitRetryAfterMs: 60000,
	logEvents: true,
};

// ============================================
// Chaos Errors
// ============================================

/**
 * Base class for chaos-injected errors.
 */
export class ChaosError extends Error {
	readonly chaosType: ChaosFailureType;
	readonly operation: string;

	constructor(type: ChaosFailureType, operation: string, message: string) {
		super(message);
		this.name = "ChaosError";
		this.chaosType = type;
		this.operation = operation;
	}
}

/**
 * Network timeout error.
 */
export class ChaosTimeoutError extends ChaosError {
	constructor(operation: string, timeoutMs: number) {
		super("timeout", operation, `Operation timed out after ${timeoutMs}ms`);
		this.name = "ChaosTimeoutError";
	}
}

/**
 * Network error.
 */
export class ChaosNetworkError extends ChaosError {
	constructor(operation: string) {
		super("network_error", operation, "Network error: Unable to connect");
		this.name = "ChaosNetworkError";
	}
}

/**
 * Rate limit error.
 */
export class ChaosRateLimitError extends ChaosError {
	readonly retryAfterMs: number;

	constructor(operation: string, retryAfterMs: number) {
		super("rate_limit", operation, `Rate limited. Retry after ${retryAfterMs}ms`);
		this.name = "ChaosRateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * Server error.
 */
export class ChaosServerError extends ChaosError {
	readonly statusCode: number;

	constructor(operation: string, statusCode = 500) {
		super("server_error", operation, `Server error: HTTP ${statusCode}`);
		this.name = "ChaosServerError";
		this.statusCode = statusCode;
	}
}

/**
 * Connection reset error.
 */
export class ChaosConnectionResetError extends ChaosError {
	constructor(operation: string) {
		super("connection_reset", operation, "Connection reset by peer");
		this.name = "ChaosConnectionResetError";
	}
}

// ============================================
// Chaos Engine
// ============================================

/**
 * Main chaos testing engine.
 */
export class ChaosEngine {
	private readonly config: ChaosConfig;
	private readonly logger: ChaosLogger;
	private readonly events: ChaosEvent[] = [];

	constructor(config: Partial<ChaosConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.logger = config.logger ?? DEFAULT_LOGGER;
	}

	/**
	 * Enable chaos injection.
	 */
	enable(): void {
		this.config.enabled = true;
	}

	/**
	 * Disable chaos injection.
	 */
	disable(): void {
		this.config.enabled = false;
	}

	/**
	 * Check if chaos is enabled.
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Set failure rate.
	 */
	setFailureRate(rate: number): void {
		if (rate < 0 || rate > 1) {
			throw new Error("Failure rate must be between 0 and 1");
		}
		this.config.failureRate = rate;
	}

	/**
	 * Get failure rate.
	 */
	getFailureRate(): number {
		return this.config.failureRate;
	}

	/**
	 * Get all chaos events.
	 */
	getEvents(): ChaosEvent[] {
		return [...this.events];
	}

	/**
	 * Clear chaos events.
	 */
	clearEvents(): void {
		this.events.length = 0;
	}

	/**
	 * Wrap an async function with chaos injection.
	 */
	async wrap<T>(fn: () => Promise<T>, operation: string, overrideRate?: number): Promise<T> {
		if (!this.config.enabled) {
			return fn();
		}

		const rate = overrideRate ?? this.config.failureRate;

		// Decide if we should inject a failure
		if (Math.random() < rate) {
			const failure = this.selectFailure();
			await this.injectFailure(failure, operation);
		}

		// Add latency if slow_response is not selected as failure
		if (this.config.enabledFailures.includes("slow_response")) {
			const slowChance = rate * 0.5; // Half the failure rate for slow responses
			if (Math.random() < slowChance) {
				await this.injectLatency(operation);
			}
		}

		return fn();
	}

	/**
	 * Maybe inject a failure (for fine-grained control).
	 */
	async maybeInject(operation: string): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		if (Math.random() < this.config.failureRate) {
			const failure = this.selectFailure();
			await this.injectFailure(failure, operation);
		}
	}

	/**
	 * Force inject a specific failure type.
	 */
	async forceInject(type: ChaosFailureType, operation: string): Promise<void> {
		await this.injectFailure(type, operation);
	}

	/**
	 * Corrupt data by modifying random fields.
	 */
	corruptData<T extends Record<string, unknown>>(data: T, operation: string): T {
		if (!this.config.enabled) {
			return data;
		}

		if (!this.config.enabledFailures.includes("corrupt_response")) {
			return data;
		}

		if (Math.random() >= this.config.failureRate) {
			return data;
		}

		this.logEvent("corrupt_response", operation);

		// Clone and corrupt - use Record type for mutation
		const corrupted = { ...data } as Record<string, unknown>;
		const keys = Object.keys(corrupted);

		if (keys.length > 0) {
			const keyIndex = Math.floor(Math.random() * keys.length);
			const keyToCorrupt = keys[keyIndex];
			if (keyToCorrupt) {
				const value = corrupted[keyToCorrupt];
				if (typeof value === "number") {
					corrupted[keyToCorrupt] = value * -1 || NaN; // Corrupt numbers
				} else if (typeof value === "string") {
					corrupted[keyToCorrupt] = ""; // Empty strings
				} else if (typeof value === "boolean") {
					corrupted[keyToCorrupt] = !value; // Flip booleans
				} else if (value === null || value === undefined) {
					corrupted[keyToCorrupt] = "corrupted";
				}
			}
		}

		return corrupted as T;
	}

	// ============================================
	// Private Methods
	// ============================================

	private selectFailure(): ChaosFailureType {
		const failures = this.config.enabledFailures.filter(
			(f) => f !== "slow_response" && f !== "corrupt_response"
		);

		if (failures.length === 0) {
			return "network_error";
		}

		const index = Math.floor(Math.random() * failures.length);
		return failures[index] ?? "network_error";
	}

	private async injectFailure(type: ChaosFailureType, operation: string): Promise<never> {
		this.logEvent(type, operation);

		switch (type) {
			case "timeout":
				await sleep(this.config.timeoutMs);
				throw new ChaosTimeoutError(operation, this.config.timeoutMs);

			case "network_error":
				throw new ChaosNetworkError(operation);

			case "rate_limit":
				throw new ChaosRateLimitError(operation, this.config.rateLimitRetryAfterMs);

			case "server_error": {
				const codes = [500, 502, 503, 504];
				const code = codes[Math.floor(Math.random() * codes.length)] ?? 500;
				throw new ChaosServerError(operation, code);
			}

			case "connection_reset":
				throw new ChaosConnectionResetError(operation);

			case "slow_response":
				await this.injectLatency(operation);
				throw new Error("slow_response should not be thrown");

			case "corrupt_response":
				throw new Error("corrupt_response should use corruptData method");

			default:
				throw new ChaosNetworkError(operation);
		}
	}

	private async injectLatency(operation: string): Promise<void> {
		const { minLatencyMs, maxLatencyMs } = this.config;
		const latency = minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs);

		this.logEvent("slow_response", operation, { latencyMs: latency });

		await sleep(latency);
	}

	private logEvent(
		type: ChaosFailureType,
		operation: string,
		details?: Record<string, unknown>
	): void {
		const event: ChaosEvent = {
			type,
			operation,
			timestamp: new Date().toISOString(),
			details,
		};

		this.events.push(event);

		if (this.config.logEvents) {
			this.logger.warn(`Injecting ${type}`, { operation, ...details });
		}
	}
}

// ============================================
// Chaos Middleware
// ============================================

/**
 * Create a chaos middleware for wrapping API calls.
 */
export function createChaosMiddleware(
	engine: ChaosEngine
): <T>(fn: () => Promise<T>, operation: string) => Promise<T> {
	return <T>(fn: () => Promise<T>, operation: string): Promise<T> => {
		return engine.wrap(fn, operation);
	};
}

// ============================================
// Test Helpers
// ============================================

/**
 * Run a function multiple times with chaos injection.
 * Returns success rate and failure distribution.
 */
export async function runWithChaos<T>(
	engine: ChaosEngine,
	fn: () => Promise<T>,
	operation: string,
	iterations: number
): Promise<ChaosTestResult> {
	const results: Array<{ success: boolean; error?: string; type?: ChaosFailureType }> = [];

	for (let i = 0; i < iterations; i++) {
		try {
			await engine.wrap(fn, operation);
			results.push({ success: true });
		} catch (error) {
			if (error instanceof ChaosError) {
				results.push({ success: false, error: error.message, type: error.chaosType });
			} else {
				results.push({
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	const successCount = results.filter((r) => r.success).length;
	const failuresByType = new Map<ChaosFailureType, number>();

	for (const result of results) {
		if (!result.success && result.type) {
			const count = failuresByType.get(result.type) ?? 0;
			failuresByType.set(result.type, count + 1);
		}
	}

	return {
		iterations,
		successCount,
		failureCount: iterations - successCount,
		successRate: successCount / iterations,
		failuresByType: Object.fromEntries(failuresByType),
	};
}

/**
 * Result of running with chaos.
 */
export interface ChaosTestResult {
	iterations: number;
	successCount: number;
	failureCount: number;
	successRate: number;
	failuresByType: Record<string, number>;
}

// ============================================
// Preset Configurations
// ============================================

/**
 * Preset chaos configurations.
 */
export const ChaosPresets = {
	/**
	 * Light chaos - occasional failures.
	 */
	light: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.05,
		enabledFailures: ["timeout", "slow_response"],
		minLatencyMs: 100,
		maxLatencyMs: 500,
	}),

	/**
	 * Moderate chaos - regular failures.
	 */
	moderate: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.15,
		enabledFailures: ["timeout", "network_error", "rate_limit", "slow_response"],
		minLatencyMs: 200,
		maxLatencyMs: 1000,
	}),

	/**
	 * Heavy chaos - frequent failures.
	 */
	heavy: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.3,
		enabledFailures: [
			"timeout",
			"network_error",
			"rate_limit",
			"server_error",
			"slow_response",
			"connection_reset",
		],
		minLatencyMs: 500,
		maxLatencyMs: 3000,
	}),

	/**
	 * Network issues - focus on connectivity.
	 */
	networkIssues: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.25,
		enabledFailures: ["timeout", "network_error", "connection_reset"],
		minLatencyMs: 1000,
		maxLatencyMs: 5000,
		timeoutMs: 10000,
	}),

	/**
	 * Rate limiting - focus on API limits.
	 */
	rateLimiting: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.2,
		enabledFailures: ["rate_limit"],
		rateLimitRetryAfterMs: 30000,
	}),

	/**
	 * Data corruption - focus on invalid responses.
	 */
	dataCorruption: (): Partial<ChaosConfig> => ({
		enabled: true,
		failureRate: 0.1,
		enabledFailures: ["corrupt_response"],
	}),
};

// ============================================
// Utilities
// ============================================

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Exports
// ============================================

export default {
	ChaosEngine,
	ChaosError,
	ChaosTimeoutError,
	ChaosNetworkError,
	ChaosRateLimitError,
	ChaosServerError,
	ChaosConnectionResetError,
	createChaosMiddleware,
	runWithChaos,
	ChaosPresets,
};
