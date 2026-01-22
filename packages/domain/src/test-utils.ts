/**
 * Test Utilities for ExecutionContext
 *
 * Helper functions for tests to easily create ExecutionContext instances,
 * reducing boilerplate in test files.
 *
 * @example
 * ```ts
 * import { createTestContext } from "@cream/domain";
 *
 * // Default: PAPER environment, test source
 * const ctx = createTestContext();
 *
 * // Override environment for specific tests
 * const liveCtx = createTestContext("LIVE");
 * ```
 */

import { createContext, type ExecutionContext } from "./context";
import type { CreamEnvironment } from "./env";

/**
 * Creates an ExecutionContext suitable for tests.
 *
 * - Defaults to "PAPER" environment
 * - Source is always "test" to identify test-originated contexts
 * - Each call generates a unique traceId
 *
 * @param environment - Override environment for testing LIVE behavior
 * @returns Frozen ExecutionContext with source="test"
 *
 * @example
 * ```ts
 * // Most tests use PAPER (default)
 * const ctx = createTestContext();
 * expect(ctx.environment).toBe("PAPER");
 * expect(ctx.source).toBe("test");
 *
 * // Test environment-specific behavior
 * const liveCtx = createTestContext("LIVE");
 * ```
 */
export function createTestContext(environment: CreamEnvironment = "PAPER"): ExecutionContext {
	return createContext(environment, "test");
}

/**
 * Creates an ExecutionContext suitable for tests with a specific configId.
 *
 * Useful for tests that need to verify config-aware behavior.
 *
 * @param environment - Trading environment (defaults to PAPER)
 * @param configId - Config version identifier
 * @returns Frozen ExecutionContext with source="test" and configId set
 *
 * @example
 * ```ts
 * const ctx = createTestContextWithConfig("PAPER", "config-v1.2.3");
 * expect(ctx.configId).toBe("config-v1.2.3");
 * ```
 */
export function createTestContextWithConfig(
	environment: CreamEnvironment = "PAPER",
	configId: string,
): ExecutionContext {
	return createContext(environment, "test", configId);
}
