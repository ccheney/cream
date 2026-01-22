/**
 * Environment Safety Mechanisms
 *
 * Critical safety controls to prevent accidental LIVE trading execution.
 * This module implements multi-layer safety checks:
 *
 * Layer 1: ExecutionContext validation (explicit environment)
 * Layer 2: Separate API credentials for LIVE
 * Layer 3: Explicit confirmation before LIVE execution
 * Layer 4: Order ID namespacing (prevent collision)
 * Layer 5: Broker endpoint validation
 *
 * SECURITY CRITICAL: Do not modify without thorough review
 *
 * All functions require ExecutionContext - no ambient state is used.
 */

import type { ExecutionContext } from "./context";
import { env, isLive, isTest } from "./env";

// ============================================
// Order ID Namespacing
// ============================================

/**
 * Generate a namespaced order ID to prevent collisions across environments
 *
 * Format: {environment_prefix}-{timestamp_hex}-{random_hex}
 * Example: LIVE-018e4f2a-7b3c9d1e
 *
 * This ensures:
 * 1. Orders are clearly identifiable by environment
 * 2. No accidental confusion between PAPER and LIVE orders
 * 3. Unique across all systems and restarts
 *
 * @param ctx - ExecutionContext containing environment info
 */
export function generateOrderId(ctx: ExecutionContext): string {
	const prefix = ctx.environment;
	const timestamp = Date.now().toString(16);
	const random = Math.random().toString(16).slice(2, 10);
	return `${prefix}-${timestamp}-${random}`;
}

/**
 * Validate that an order ID belongs to the given execution context's environment
 *
 * @param orderId - Order ID to validate
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If order ID is from a different environment
 */
export function validateOrderIdEnvironment(orderId: string, ctx: ExecutionContext): void {
	const expectedPrefix = ctx.environment;
	if (!orderId.startsWith(`${expectedPrefix}-`)) {
		throw new SafetyError(
			`Order ID ${orderId} does not belong to ${expectedPrefix} environment`,
			"ORDER_ID_ENVIRONMENT_MISMATCH",
			ctx.traceId,
		);
	}
}

// ============================================
// Broker Endpoint Validation
// ============================================

/**
 * Validate that the broker endpoint matches the execution context's environment
 *
 * LIVE: https://api.alpaca.markets
 * PAPER: https://paper-api.alpaca.markets
 *
 * @param endpoint - Broker API endpoint to validate
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If endpoint doesn't match environment
 */
export function validateBrokerEndpoint(endpoint: string, ctx: ExecutionContext): void {
	if (isLive(ctx) && !endpoint.includes("api.alpaca.markets")) {
		throw new SafetyError(
			`LIVE environment requires production broker endpoint, got: ${endpoint}`,
			"BROKER_ENDPOINT_MISMATCH",
			ctx.traceId,
		);
	}

	if (!isLive(ctx) && endpoint.includes("api.alpaca.markets") && !endpoint.includes("paper-api")) {
		throw new SafetyError(
			`${ctx.environment} environment should not use production broker endpoint: ${endpoint}`,
			"BROKER_ENDPOINT_MISMATCH",
			ctx.traceId,
		);
	}
}

// ============================================
// Live Execution Guards
// ============================================

let liveConfirmationGranted = false;
const LIVE_CONFIRMATION_TOKEN = "I_UNDERSTAND_THIS_IS_REAL_MONEY";

/**
 * Require explicit confirmation before LIVE trading
 *
 * This function MUST be called before any LIVE order submission.
 * In automated systems, this should be confirmed during startup.
 *
 * @param confirmationToken - Must exactly match "I_UNDERSTAND_THIS_IS_REAL_MONEY"
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If not in LIVE environment or token doesn't match
 */
export function requireLiveConfirmation(confirmationToken: string, ctx: ExecutionContext): void {
	if (!isLive(ctx)) {
		return;
	}

	if (confirmationToken !== LIVE_CONFIRMATION_TOKEN) {
		throw new SafetyError(
			"LIVE environment requires confirmation token: I_UNDERSTAND_THIS_IS_REAL_MONEY",
			"LIVE_CONFIRMATION_REQUIRED",
			ctx.traceId,
		);
	}

	liveConfirmationGranted = true;
	auditLog(
		"LIVE_CONFIRMATION_GRANTED",
		{
			timestamp: new Date().toISOString(),
			environment: ctx.environment,
			traceId: ctx.traceId,
		},
		ctx,
	);
}

/**
 * Check if LIVE confirmation has been granted
 *
 * @param ctx - ExecutionContext containing environment info
 */
export function isLiveConfirmed(ctx: ExecutionContext): boolean {
	if (!isLive(ctx)) {
		return true;
	}
	return liveConfirmationGranted;
}

/**
 * Guard function to prevent accidental LIVE execution
 *
 * Call this before any operation that could affect real money.
 *
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If in LIVE environment without confirmation
 */
export function preventAccidentalLiveExecution(ctx: ExecutionContext): void {
	if (isLive(ctx) && !liveConfirmationGranted) {
		throw new SafetyError(
			"LIVE execution blocked: Call requireLiveConfirmation() first",
			"LIVE_CONFIRMATION_NOT_GRANTED",
			ctx.traceId,
		);
	}
}

// ============================================
// Environment Consistency Validation
// ============================================

/**
 * Comprehensive environment consistency check
 *
 * Validates:
 * 1. Broker endpoint matches environment (if configured)
 * 2. LIVE confirmation state is logged for audit
 *
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If any consistency check fails
 */
export function validateEnvironmentConsistency(ctx: ExecutionContext): void {
	if (env.ALPACA_BASE_URL) {
		validateBrokerEndpoint(env.ALPACA_BASE_URL, ctx);
	}

	if (isLive(ctx)) {
		auditLog(
			"ENVIRONMENT_VALIDATION",
			{
				environment: ctx.environment,
				source: ctx.source,
				configId: ctx.configId,
				liveConfirmed: liveConfirmationGranted,
			},
			ctx,
		);
	}
}

// ============================================
// State Isolation
// ============================================

/**
 * Get the database name suffix for the given execution context's environment
 *
 * This ensures complete isolation between environments:
 * - PAPER uses: cream_paper.db
 * - LIVE uses: cream_live.db
 *
 * @param baseName - Base database name
 * @param ctx - ExecutionContext containing environment info
 */
export function getIsolatedDatabaseName(baseName: string, ctx: ExecutionContext): string {
	return `${baseName}_${ctx.environment.toLowerCase()}`;
}

/**
 * Validate that a database connection is for the correct environment
 *
 * @param dbUrl - Database URL to validate
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If database name suggests wrong environment
 */
export function validateDatabaseIsolation(dbUrl: string, ctx: ExecutionContext): void {
	// Check for cross-environment database access
	const environments = ["paper", "live"];
	for (const otherEnv of environments) {
		if (otherEnv !== ctx.environment.toLowerCase()) {
			if (dbUrl.includes(`_${otherEnv}`)) {
				throw new SafetyError(
					`Database isolation violation: ${ctx.environment} environment accessing ${otherEnv} database`,
					"DATABASE_ISOLATION_VIOLATION",
					ctx.traceId,
				);
			}
		}
	}
}

// ============================================
// Audit Logging
// ============================================

const auditLogEntries: AuditLogEntry[] = [];

interface AuditLogEntry {
	timestamp: string;
	operation: string;
	details: Record<string, unknown>;
	environment: string;
	traceId: string;
}

/**
 * Log an operation for audit purposes
 *
 * In LIVE environment, all significant operations are logged for compliance.
 *
 * @param operation - Operation name
 * @param details - Operation details
 * @param ctx - ExecutionContext containing environment info
 */
export function auditLog(
	operation: string,
	details: Record<string, unknown>,
	ctx: ExecutionContext,
): void {
	const entry: AuditLogEntry = {
		timestamp: new Date().toISOString(),
		operation,
		details,
		environment: ctx.environment,
		traceId: ctx.traceId,
	};

	auditLogEntries.push(entry);
}

/**
 * Get all audit log entries (for export/review)
 */
export function getAuditLog(): readonly AuditLogEntry[] {
	return auditLogEntries;
}

/**
 * Clear audit log (for testing only)
 *
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If called in LIVE environment
 */
export function clearAuditLog(ctx: ExecutionContext): void {
	if (isLive(ctx)) {
		throw new SafetyError(
			"Cannot clear audit log in LIVE environment",
			"AUDIT_LOG_PROTECTED",
			ctx.traceId,
		);
	}
	auditLogEntries.length = 0;
}

// ============================================
// Circuit Breaker
// ============================================

interface CircuitBreakerState {
	isOpen: boolean;
	failureCount: number;
	lastFailureTime: number | null;
	openedAt: number | null;
}

const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 60000; // 1 minute

/**
 * Record a failure for the circuit breaker
 *
 * After threshold failures, the circuit opens and blocks operations.
 *
 * @param circuitName - Name of the circuit
 * @param error - Error that caused the failure
 * @param ctx - ExecutionContext containing environment info
 * @param threshold - Number of failures before opening circuit
 */
export function recordCircuitFailure(
	circuitName: string,
	error: Error,
	ctx: ExecutionContext,
	threshold = DEFAULT_FAILURE_THRESHOLD,
): void {
	let state = circuitBreakers.get(circuitName);
	if (!state) {
		state = {
			isOpen: false,
			failureCount: 0,
			lastFailureTime: null,
			openedAt: null,
		};
		circuitBreakers.set(circuitName, state);
	}

	state.failureCount++;
	state.lastFailureTime = Date.now();

	auditLog(
		"CIRCUIT_FAILURE",
		{
			circuit: circuitName,
			failureCount: state.failureCount,
			threshold,
			error: error.message,
		},
		ctx,
	);

	if (state.failureCount >= threshold) {
		state.isOpen = true;
		state.openedAt = Date.now();

		auditLog(
			"CIRCUIT_OPENED",
			{
				circuit: circuitName,
				failureCount: state.failureCount,
			},
			ctx,
		);
	}
}

/**
 * Check if a circuit is open (blocking operations)
 *
 * @param circuitName - Name of the circuit
 * @param resetTimeoutMs - Time after which to try again (half-open state)
 */
export function isCircuitOpen(
	circuitName: string,
	resetTimeoutMs = DEFAULT_RESET_TIMEOUT_MS,
): boolean {
	const state = circuitBreakers.get(circuitName);
	if (!state || !state.isOpen) {
		return false;
	}

	if (state.openedAt && Date.now() - state.openedAt > resetTimeoutMs) {
		return false;
	}

	return true;
}

/**
 * Reset a circuit breaker (on successful operation)
 *
 * @param circuitName - Name of the circuit
 * @param ctx - ExecutionContext containing environment info
 */
export function resetCircuit(circuitName: string, ctx: ExecutionContext): void {
	const state = circuitBreakers.get(circuitName);
	if (state) {
		state.isOpen = false;
		state.failureCount = 0;
		state.lastFailureTime = null;
		state.openedAt = null;

		auditLog("CIRCUIT_RESET", { circuit: circuitName }, ctx);
	}
}

/**
 * Guard function that throws if circuit is open
 *
 * @param circuitName - Name of the circuit
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If circuit is open
 */
export function requireCircuitClosed(circuitName: string, ctx: ExecutionContext): void {
	if (isCircuitOpen(circuitName)) {
		throw new SafetyError(
			`Circuit breaker '${circuitName}' is open - operations blocked`,
			"CIRCUIT_BREAKER_OPEN",
			ctx.traceId,
		);
	}
}

// ============================================
// Safety Error
// ============================================

export type SafetyErrorCode =
	| "ORDER_ID_ENVIRONMENT_MISMATCH"
	| "BROKER_ENDPOINT_MISMATCH"
	| "LIVE_CONFIRMATION_REQUIRED"
	| "LIVE_CONFIRMATION_NOT_GRANTED"
	| "DATABASE_ISOLATION_VIOLATION"
	| "AUDIT_LOG_PROTECTED"
	| "CIRCUIT_BREAKER_OPEN";

/**
 * Custom error for safety-related failures
 *
 * Includes traceId from ExecutionContext for debugging.
 */
export class SafetyError extends Error {
	constructor(
		message: string,
		public readonly code: SafetyErrorCode,
		public readonly traceId?: string,
	) {
		super(message);
		this.name = "SafetyError";
	}
}

// ============================================
// Testing Utilities
// ============================================

/**
 * Reset safety state for testing
 *
 * Only works in test mode (source="test")
 *
 * @param ctx - ExecutionContext containing environment info
 * @throws {SafetyError} If not in test mode
 */
export function resetSafetyState(ctx: ExecutionContext): void {
	if (!isTest(ctx)) {
		throw new SafetyError(
			"Safety state can only be reset in test mode",
			"AUDIT_LOG_PROTECTED",
			ctx.traceId,
		);
	}

	liveConfirmationGranted = false;
	circuitBreakers.clear();
	auditLogEntries.length = 0;
}
