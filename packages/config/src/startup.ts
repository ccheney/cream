/**
 * Startup Configuration Validation
 *
 * Implements fail-fast startup validation with:
 * - Environment variable validation
 * - Configuration sanitization for audit logging
 * - LIVE trading safety checks
 * - Clear error messages
 *
 * @see docs/plans/11-configuration.md
 */

import { type EnvConfig, env, isLive } from "@cream/domain/env";
import { z } from "zod";
import { type CreamConfig, loadConfigWithEnv } from "./index";
import { validateAtStartup } from "./validate";

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
    "CREAM_ENV",
    "CREAM_BROKER",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "HELIX_URL",
    "DATABENTO_KEY",
    "POLYGON_KEY",
    "FMP_KEY",
    "ALPHAVANTAGE_KEY",
    "ALPACA_KEY",
    "ALPACA_SECRET",
    "ALPACA_BASE_URL",
    "GOOGLE_API_KEY",
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
 * Startup validation result
 */
export interface StartupResult {
  success: boolean;
  env: EnvConfig;
  config?: CreamConfig | undefined;
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
 * Validate startup configuration
 *
 * Performs comprehensive validation:
 * 1. Environment variables are valid
 * 2. Configuration files are valid
 * 3. LIVE trading safety checks (if applicable)
 *
 * @param configDir - Directory containing config files
 * @returns Validation result with config and diagnostics
 */
export async function validateStartup(configDir = "configs"): Promise<StartupResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Environment variables are already validated at import
  // If we got here, env is valid (parseEnv() would have thrown)

  // Step 2: Load and validate configuration
  let config: CreamConfig | undefined;
  try {
    config = await loadConfigWithEnv(configDir);

    // Run startup-specific validation
    const startupValidation = validateAtStartup(config);
    if (!startupValidation.success) {
      errors.push(...startupValidation.errors);
    }
    warnings.push(...startupValidation.warnings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.issues.map((i) => `config.${i.path.join(".")}: ${i.message}`));
    } else {
      errors.push(
        `Configuration loading failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Step 3: LIVE trading safety checks
  if (isLive()) {
    const liveCheck = validateLiveTradingSafety();
    if (!liveCheck.approved) {
      errors.push(...liveCheck.errors);
    }
  }

  // Step 4: Environment consistency check
  if (config && config.core.environment !== env.CREAM_ENV) {
    errors.push(
      `Environment mismatch: CREAM_ENV=${env.CREAM_ENV} but config.core.environment=${config.core.environment}`
    );
  }

  return {
    success: errors.length === 0,
    env,
    config,
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
  configHash?: string;
  env: Record<string, string>;
  config?: unknown;
  errors: string[];
  warnings: string[];
}

/**
 * Create a startup audit log entry
 *
 * @param service - Name of the service starting up
 * @param result - Startup validation result
 * @returns Audit log entry (sanitized)
 */
export function createAuditLog(service: string, result: StartupResult): StartupAuditLog {
  return {
    timestamp: new Date().toISOString(),
    service,
    environment: result.env.CREAM_ENV,
    env: sanitizeEnv(result.env),
    config: result.config ? sanitizeConfig(result.config) : undefined,
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
 * - Logs sanitized configuration audit trail
 * - Returns validated env and config
 *
 * @param service - Name of the service (for audit logging)
 * @param configDir - Directory containing config files
 * @returns Validated env and config
 *
 * @example
 * ```ts
 * // apps/api/src/main.ts
 * import { runStartupValidation } from "@cream/config/startup";
 *
 * async function main() {
 *   const { env, config } = await runStartupValidation("api-server");
 *
 *   // Now safe to start services
 *   await startServer(config);
 * }
 *
 * main();
 * ```
 */
export async function runStartupValidation(
  service: string,
  configDir = "configs"
): Promise<{ env: EnvConfig; config: CreamConfig }> {
  const result = await validateStartup(configDir);

  // Create and log audit entry
  const audit = createAuditLog(service, result);

  if (!result.success) {
    for (const _error of result.errors) {
    }
    if (result.warnings.length > 0) {
      for (const _warning of result.warnings) {
      }
    }
    logStartupAudit(audit);
    process.exit(1);
  }

  // Log warnings even on success
  if (result.warnings.length > 0) {
    for (const _warning of result.warnings) {
    }
  }
  logStartupAudit(audit);

  // TypeScript knows config is defined because result.success is true
  return { env: result.env, config: result.config! };
}

/**
 * Validate startup without exiting (for testing)
 *
 * Same as runStartupValidation but returns result instead of exiting.
 */
export async function validateStartupNoExit(
  service: string,
  configDir = "configs"
): Promise<StartupResult & { audit: StartupAuditLog }> {
  const result = await validateStartup(configDir);
  const audit = createAuditLog(service, result);
  return { ...result, audit };
}
