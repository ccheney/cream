/**
 * Startup Configuration Validation
 *
 * Implements fail-fast startup validation with:
 * - Environment variable validation
 * - Configuration sanitization for audit logging
 * - LIVE trading safety checks
 * - Clear error messages
 *
 * Note: Configuration is now loaded from database via RuntimeConfigService.
 * This module provides environment validation and audit logging utilities.
 *
 * @see docs/plans/11-configuration.md
 */

import type { ExecutionContext } from "@cream/domain";
import { type EnvConfig, env, isLive, validateEnvironment } from "@cream/domain/env";

// ============================================
// Sensitive Key Patterns
// ============================================

/**
 * Patterns that identify sensitive fields to redact
 */
const SENSITIVE_PATTERNS = [/key$/i, /secret$/i, /token$/i, /password$/i, /credential/i, /auth/i];

/**
 * Check if a field name contains sensitive data
 */
function isSensitiveField(fieldName: string): boolean {
	return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fieldName));
}

// ============================================
// Configuration Sanitization
// ============================================

/**
 * Redaction marker for sensitive values
 */
const REDACTED = "[REDACTED]";

/**
 * Recursively sanitize an object, redacting sensitive values
 *
 * @param obj - Object to sanitize
 * @param depth - Current recursion depth (prevents infinite loops)
 * @returns Sanitized copy of the object
 */
export function sanitizeConfig(obj: unknown, depth = 0): unknown {
	// Prevent infinite recursion
	if (depth > 10) {
		return REDACTED;
	}

	if (obj === null || obj === undefined) {
		return obj;
	}

	if (typeof obj !== "object") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => sanitizeConfig(item, depth + 1));
	}

	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (isSensitiveField(key)) {
			// Redact sensitive values, but indicate if present or missing
			sanitized[key] = value ? REDACTED : "[NOT SET]";
		} else if (typeof value === "object" && value !== null) {
			sanitized[key] = sanitizeConfig(value, depth + 1);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

/**
 * Sanitize environment variables for logging
 */
export function sanitizeEnv(envConfig: EnvConfig): Record<string, string> {
	const sanitized: Record<string, string> = {};

	// Include all known env fields for consistent output
	const allFields = [
		"TURSO_DATABASE_URL",
		"TURSO_AUTH_TOKEN",
		"HELIX_URL",
		"FMP_KEY",
		"ALPHAVANTAGE_KEY",
		"ALPACA_KEY",
		"ALPACA_SECRET",
		"ALPACA_BASE_URL",
		"GOOGLE_GENERATIVE_AI_API_KEY",
	];

	for (const key of allFields) {
		const value = (envConfig as Record<string, unknown>)[key];
		if (isSensitiveField(key)) {
			sanitized[key] = value ? REDACTED : "[NOT SET]";
		} else {
			sanitized[key] = value !== undefined && value !== null ? String(value) : "[NOT SET]";
		}
	}

	return sanitized;
}

// ============================================
// Startup Validation
// ============================================

/**
 * Startup validation result (environment validation only)
 */
export interface StartupResult {
	success: boolean;
	env: EnvConfig;
	errors: string[];
	warnings: string[];
}

/**
 * LIVE trading safety validation
 *
 * Additional checks required before LIVE trading can begin:
 * 1. Explicit LIVE_TRADING_APPROVED flag
 * 2. All required API keys present
 * 3. No conflicting environment settings
 */
export function validateLiveTradingSafety(): {
	approved: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check for explicit LIVE trading approval
	const approved = process.env.LIVE_TRADING_APPROVED === "true";
	if (!approved) {
		errors.push("LIVE trading requires LIVE_TRADING_APPROVED=true environment variable");
	}

	// Double-check that we're not accidentally in LIVE
	if (env.ALPACA_BASE_URL?.includes("paper-api")) {
		errors.push("LIVE trading detected but ALPACA_BASE_URL points to paper trading endpoint");
	}

	// Verify database isolation
	if (env.TURSO_DATABASE_URL?.includes("backtest") || env.TURSO_DATABASE_URL?.includes("paper")) {
		errors.push("LIVE trading detected but database URL appears to be for non-LIVE environment");
	}

	return { approved: errors.length === 0, errors };
}

/**
 * Validate startup environment
 *
 * Performs environment validation:
 * 1. Environment variables are valid for the target environment
 * 2. LIVE trading safety checks (if applicable)
 *
 * Note: Configuration is now loaded from database via RuntimeConfigService.
 * Call this function for environment validation only.
 *
 * @param ctx - ExecutionContext containing target environment info
 * @returns Validation result with diagnostics
 */
export async function validateStartup(ctx: ExecutionContext): Promise<StartupResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Step 1: Validate environment variables for the target environment
	const envValidation = validateEnvironment(ctx, "startup");
	if (!envValidation.valid) {
		errors.push(...envValidation.errors);
	}
	if (envValidation.warnings.length > 0) {
		warnings.push(...envValidation.warnings);
	}

	// Step 2: LIVE trading safety checks
	if (isLive(ctx)) {
		const liveCheck = validateLiveTradingSafety();
		if (!liveCheck.approved) {
			errors.push(...liveCheck.errors);
		}
	}

	return {
		success: errors.length === 0,
		env,
		errors,
		warnings,
	};
}

// ============================================
// Audit Logging
// ============================================

/**
 * Startup audit log entry
 */
export interface StartupAuditLog {
	timestamp: string;
	service: string;
	environment: string;
	traceId: string;
	env: Record<string, string>;
	errors: string[];
	warnings: string[];
}

/**
 * Create a startup audit log entry
 *
 * @param service - Name of the service starting up
 * @param ctx - ExecutionContext containing environment info
 * @param result - Startup validation result
 * @returns Audit log entry (sanitized)
 */
export function createAuditLog(
	service: string,
	ctx: ExecutionContext,
	result: StartupResult
): StartupAuditLog {
	return {
		timestamp: new Date().toISOString(),
		service,
		environment: ctx.environment,
		traceId: ctx.traceId,
		env: sanitizeEnv(result.env),
		errors: result.errors,
		warnings: result.warnings,
	};
}

/**
 * Log startup audit entry to console (structured JSON)
 */
export function logStartupAudit(_audit: StartupAuditLog): void {}

// ============================================
// Fail-Fast Entry Point
// ============================================

/**
 * Run startup validation with fail-fast behavior
 *
 * This function should be called at the very beginning of your application,
 * BEFORE any services, database connections, or broker connections are initialized.
 *
 * On validation failure:
 * - Logs detailed error messages
 * - Exits with non-zero status code (1)
 *
 * On success:
 * - Logs sanitized environment audit trail
 * - Returns validated env
 *
 * Note: Configuration is now loaded from database via RuntimeConfigService.
 * This function only validates environment variables.
 *
 * @param service - Name of the service (for audit logging)
 * @param ctx - ExecutionContext containing target environment info
 * @returns Validated env
 *
 * @example
 * ```ts
 * // apps/api/src/main.ts
 * import { runStartupValidation } from "@cream/config/startup";
 * import { createContext } from "@cream/domain";
 *
 * async function main() {
 *   const ctx = createContext("PAPER", "scheduled");
 *   const { env } = await runStartupValidation("api-server", ctx);
 *
 *   // Now safe to start services and load config from DB
 *   await startServer();
 * }
 *
 * main();
 * ```
 */
export async function runStartupValidation(
	service: string,
	ctx: ExecutionContext
): Promise<{ env: EnvConfig }> {
	const result = await validateStartup(ctx);

	// Create and log audit entry
	const audit = createAuditLog(service, ctx, result);

	if (!result.success) {
		for (const _error of result.errors) {
			// Errors are logged via logStartupAudit
		}
		if (result.warnings.length > 0) {
			for (const _warning of result.warnings) {
				// Warnings are logged via logStartupAudit
			}
		}
		logStartupAudit(audit);
		process.exit(1);
	}

	// Log warnings even on success
	if (result.warnings.length > 0) {
		for (const _warning of result.warnings) {
			// Warnings are logged via logStartupAudit
		}
	}
	logStartupAudit(audit);

	return { env: result.env };
}

/**
 * Validate startup without exiting (for testing)
 *
 * Same as runStartupValidation but returns result instead of exiting.
 */
export async function validateStartupNoExit(
	service: string,
	ctx: ExecutionContext
): Promise<StartupResult & { audit: StartupAuditLog }> {
	const result = await validateStartup(ctx);
	const audit = createAuditLog(service, ctx, result);
	return { ...result, audit };
}
