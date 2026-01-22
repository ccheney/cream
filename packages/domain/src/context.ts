/**
 * ExecutionContext - Dynamic Environment Selection
 *
 * Context replaces ambient CREAM_ENV state with explicit context created at
 * system boundaries (HTTP handlers, worker entrypoints, test setup).
 *
 * Design principles:
 * - Explicit over implicit: Context created at system boundaries
 * - No ambient state: Context passed explicitly to all functions needing environment info
 * - No fallbacks: Caller must provide context—no fallbacks to environment variables
 * - Immutability: Returned context is frozen/readonly
 *
 * @see https://opentelemetry.io/docs/concepts/context-propagation/
 */

import type { CreamEnvironment } from "./env";

/**
 * Source of the execution - identifies where the execution originated.
 *
 * - "test" - Unit/integration tests (bun test)
 * - "dashboard-test" - Manual OODA testing from dashboard UI
 * - "scheduled" - Hourly OODA loop worker
 * - "manual" - Manual CLI invocation
 */
export type ExecutionSource = "test" | "dashboard-test" | "scheduled" | "manual";

/**
 * All valid ExecutionSource values for validation
 */
export const EXECUTION_SOURCES: readonly ExecutionSource[] = [
	"test",
	"dashboard-test",
	"scheduled",
	"manual",
] as const;

/**
 * ExecutionContext carries environment and tracing information through the system.
 *
 * Created at system boundaries and threaded through all operations. Enables:
 * - Dynamic environment selection (PAPER/LIVE) per operation
 * - Request tracing via traceId (W3C TraceContext compatible)
 * - Config version tracking via optional configId
 *
 * @example
 * ```ts
 * // HTTP handler creates context
 * const ctx = createContext("PAPER", "dashboard-test", configId);
 *
 * // Thread through operations
 * const broker = createBrokerClient({ context: ctx });
 * const isLiveEnv = ctx.environment === "LIVE";
 * ```
 */
export interface ExecutionContext {
	/**
	 * Trading environment for this execution.
	 * Determines broker endpoints, safety checks, and data isolation.
	 */
	readonly environment: CreamEnvironment;

	/**
	 * Source of the execution - identifies the entry point.
	 */
	readonly source: ExecutionSource;

	/**
	 * Optional reference to runtime config version.
	 * Used for config promotion workflows and audit trails.
	 */
	readonly configId?: string;

	/**
	 * UUID for request tracing across service boundaries.
	 * Generated using crypto.randomUUID() (UUID v4).
	 *
	 * Can be used as the parent-id in W3C traceparent header:
	 * `00-{trace-id}-{parent-id}-01`
	 */
	readonly traceId: string;
}

/**
 * Creates a new ExecutionContext with a generated traceId.
 *
 * Call at system boundaries:
 * - HTTP route handlers
 * - Worker entrypoints
 * - Test setup functions
 *
 * @param environment - Trading environment (PAPER, LIVE)
 * @param source - Execution source (test, dashboard-test, scheduled, manual)
 * @param configId - Optional runtime config version reference
 * @returns Frozen ExecutionContext object
 *
 * @example
 * ```ts
 * // In HTTP handler
 * const ctx = createContext("PAPER", "dashboard-test", req.body.configVersion);
 *
 * // In test setup
 * const ctx = createContext("PAPER", "test");
 *
 * // In worker
 * const ctx = createContext("LIVE", "scheduled", activeConfig.id);
 * ```
 */
export function createContext(
	environment: CreamEnvironment,
	source: ExecutionSource,
	configId?: string,
): ExecutionContext {
	const context: ExecutionContext = {
		environment,
		source,
		configId,
		traceId: crypto.randomUUID(),
	};

	// Freeze to enforce immutability
	return Object.freeze(context);
}

/**
 * Type guard to check if a value is a valid ExecutionSource
 */
export function isValidExecutionSource(value: unknown): value is ExecutionSource {
	return typeof value === "string" && EXECUTION_SOURCES.includes(value as ExecutionSource);
}
