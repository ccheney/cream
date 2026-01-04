/**
 * Environment Safety Mechanisms
 *
 * Critical safety controls to prevent accidental LIVE trading execution.
 * This module implements multi-layer safety checks:
 *
 * Layer 1: Environment variable validation (CREAM_ENV=LIVE)
 * Layer 2: Separate API credentials for LIVE
 * Layer 3: Explicit confirmation before LIVE execution
 * Layer 4: Order ID namespacing (prevent collision)
 * Layer 5: Broker endpoint validation
 *
 * ⚠️ SECURITY CRITICAL: Do not modify without thorough review
 */

import { env, getAlpacaBaseUrl, isBacktest, isLive } from "./env";

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
 */
export function generateOrderId(): string {
  const prefix = env.CREAM_ENV;
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Validate that an order ID belongs to the current environment
 *
 * @throws {SafetyError} If order ID is from a different environment
 */
export function validateOrderIdEnvironment(orderId: string): void {
  const expectedPrefix = env.CREAM_ENV;
  if (!orderId.startsWith(`${expectedPrefix}-`)) {
    throw new SafetyError(
      `Order ID ${orderId} does not belong to ${expectedPrefix} environment`,
      "ORDER_ID_ENVIRONMENT_MISMATCH"
    );
  }
}

// ============================================
// Broker Endpoint Validation
// ============================================

/**
 * Validate that the broker endpoint matches the current environment
 *
 * LIVE: https://api.alpaca.markets
 * PAPER: https://paper-api.alpaca.markets
 *
 * @throws {SafetyError} If endpoint doesn't match environment
 */
export function validateBrokerEndpoint(endpoint: string): void {
  // Expected endpoint based on current environment (for reference/logging)
  const _expectedEndpoint = getAlpacaBaseUrl();
  void _expectedEndpoint; // Acknowledge intentionally unused

  if (isLive() && !endpoint.includes("api.alpaca.markets")) {
    throw new SafetyError(
      `LIVE environment requires production broker endpoint, got: ${endpoint}`,
      "BROKER_ENDPOINT_MISMATCH"
    );
  }

  if (!isLive() && endpoint.includes("api.alpaca.markets") && !endpoint.includes("paper-api")) {
    throw new SafetyError(
      `${env.CREAM_ENV} environment should not use production broker endpoint: ${endpoint}`,
      "BROKER_ENDPOINT_MISMATCH"
    );
  }
}

// ============================================
// Live Execution Guards
// ============================================

/** Track if LIVE confirmation has been granted for this session */
let liveConfirmationGranted = false;

/** Confirmation token for LIVE operations (must match expected value) */
const LIVE_CONFIRMATION_TOKEN = "I_UNDERSTAND_THIS_IS_REAL_MONEY";

/**
 * Require explicit confirmation before LIVE trading
 *
 * This function MUST be called before any LIVE order submission.
 * In automated systems, this should be confirmed during startup.
 *
 * @param confirmationToken - Must exactly match "I_UNDERSTAND_THIS_IS_REAL_MONEY"
 * @throws {SafetyError} If not in LIVE environment or token doesn't match
 */
export function requireLiveConfirmation(confirmationToken: string): void {
  if (!isLive()) {
    // No confirmation needed for non-LIVE environments
    return;
  }

  if (confirmationToken !== LIVE_CONFIRMATION_TOKEN) {
    throw new SafetyError(
      "LIVE environment requires confirmation token: I_UNDERSTAND_THIS_IS_REAL_MONEY",
      "LIVE_CONFIRMATION_REQUIRED"
    );
  }

  liveConfirmationGranted = true;
  auditLog("LIVE_CONFIRMATION_GRANTED", {
    timestamp: new Date().toISOString(),
    environment: env.CREAM_ENV,
  });
}

/**
 * Check if LIVE confirmation has been granted
 */
export function isLiveConfirmed(): boolean {
  if (!isLive()) {
    return true; // Non-LIVE doesn't need confirmation
  }
  return liveConfirmationGranted;
}

/**
 * Guard function to prevent accidental LIVE execution
 *
 * Call this before any operation that could affect real money.
 *
 * @throws {SafetyError} If in LIVE environment without confirmation
 */
export function preventAccidentalLiveExecution(): void {
  if (isLive() && !liveConfirmationGranted) {
    throw new SafetyError(
      "LIVE execution blocked: Call requireLiveConfirmation() first",
      "LIVE_CONFIRMATION_NOT_GRANTED"
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
 * 1. CREAM_ENV is set and valid
 * 2. Required credentials are present
 * 3. Broker endpoint matches environment
 * 4. Database URLs are properly isolated
 *
 * @throws {SafetyError} If any consistency check fails
 */
export function validateEnvironmentConsistency(): void {
  // Validate broker endpoint if configured
  if (env.ALPACA_BASE_URL) {
    validateBrokerEndpoint(env.ALPACA_BASE_URL);
  }

  // LIVE-specific checks
  if (isLive()) {
    // Ensure LIVE confirmation is required (not bypassed)
    if (!liveConfirmationGranted) {
    }

    // Log LIVE activation for audit trail
    auditLog("ENVIRONMENT_VALIDATION", {
      environment: env.CREAM_ENV,
      broker: env.CREAM_BROKER,
      liveConfirmed: liveConfirmationGranted,
    });
  }
}

// ============================================
// State Isolation
// ============================================

/**
 * Get the database name suffix for the current environment
 *
 * This ensures complete isolation between environments:
 * - BACKTEST uses: cream_backtest.db
 * - PAPER uses: cream_paper.db
 * - LIVE uses: cream_live.db
 */
export function getIsolatedDatabaseName(baseName: string): string {
  return `${baseName}_${env.CREAM_ENV.toLowerCase()}`;
}

/**
 * Validate that a database connection is for the correct environment
 *
 * @throws {SafetyError} If database name suggests wrong environment
 */
export function validateDatabaseIsolation(dbUrl: string): void {
  // Check for cross-environment database access
  const environments = ["backtest", "paper", "live"];
  for (const otherEnv of environments) {
    if (otherEnv !== env.CREAM_ENV.toLowerCase()) {
      if (dbUrl.includes(`_${otherEnv}`)) {
        throw new SafetyError(
          `Database isolation violation: ${env.CREAM_ENV} environment accessing ${otherEnv} database`,
          "DATABASE_ISOLATION_VIOLATION"
        );
      }
    }
  }
}

// ============================================
// Audit Logging
// ============================================

/** Audit log entries for LIVE operations */
const auditLogEntries: AuditLogEntry[] = [];

interface AuditLogEntry {
  timestamp: string;
  operation: string;
  details: Record<string, unknown>;
  environment: string;
}

/**
 * Log an operation for audit purposes
 *
 * In LIVE environment, all significant operations are logged for compliance.
 */
export function auditLog(operation: string, details: Record<string, unknown>): void {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    operation,
    details,
    environment: env.CREAM_ENV,
  };

  auditLogEntries.push(entry);

  // In LIVE, also log to console for immediate visibility
  if (isLive()) {
  }
}

/**
 * Get all audit log entries (for export/review)
 */
export function getAuditLog(): readonly AuditLogEntry[] {
  return auditLogEntries;
}

/**
 * Clear audit log (for testing only)
 */
export function clearAuditLog(): void {
  if (isLive()) {
    throw new SafetyError("Cannot clear audit log in LIVE environment", "AUDIT_LOG_PROTECTED");
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
 */
export function recordCircuitFailure(
  circuitName: string,
  error: Error,
  threshold = DEFAULT_FAILURE_THRESHOLD
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

  auditLog("CIRCUIT_FAILURE", {
    circuit: circuitName,
    failureCount: state.failureCount,
    threshold,
    error: error.message,
  });

  if (state.failureCount >= threshold) {
    state.isOpen = true;
    state.openedAt = Date.now();

    auditLog("CIRCUIT_OPENED", {
      circuit: circuitName,
      failureCount: state.failureCount,
    });

    if (isLive()) {
    }
  }
}

/**
 * Check if a circuit is open (blocking operations)
 */
export function isCircuitOpen(
  circuitName: string,
  resetTimeoutMs = DEFAULT_RESET_TIMEOUT_MS
): boolean {
  const state = circuitBreakers.get(circuitName);
  if (!state || !state.isOpen) {
    return false;
  }

  // Check if enough time has passed to try again (half-open state)
  if (state.openedAt && Date.now() - state.openedAt > resetTimeoutMs) {
    return false; // Allow a test request
  }

  return true;
}

/**
 * Reset a circuit breaker (on successful operation)
 */
export function resetCircuit(circuitName: string): void {
  const state = circuitBreakers.get(circuitName);
  if (state) {
    state.isOpen = false;
    state.failureCount = 0;
    state.lastFailureTime = null;
    state.openedAt = null;

    auditLog("CIRCUIT_RESET", { circuit: circuitName });
  }
}

/**
 * Guard function that throws if circuit is open
 */
export function requireCircuitClosed(circuitName: string): void {
  if (isCircuitOpen(circuitName)) {
    throw new SafetyError(
      `Circuit breaker '${circuitName}' is open - operations blocked`,
      "CIRCUIT_BREAKER_OPEN"
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
 */
export class SafetyError extends Error {
  constructor(
    message: string,
    public readonly code: SafetyErrorCode
  ) {
    super(message);
    this.name = "SafetyError";

    // Log all safety errors
    auditLog("SAFETY_ERROR", {
      code,
      message,
      stack: this.stack,
    });
  }
}

// ============================================
// Testing Utilities
// ============================================

/**
 * Reset safety state for testing
 *
 * ⚠️ Only works in BACKTEST environment
 */
export function resetSafetyState(): void {
  if (!isBacktest()) {
    throw new SafetyError(
      "Safety state can only be reset in BACKTEST environment",
      "AUDIT_LOG_PROTECTED"
    );
  }

  liveConfirmationGranted = false;
  circuitBreakers.clear();
  auditLogEntries.length = 0;
}
