/**
 * @cream/config - Configuration schemas and loaders
 *
 * This package contains:
 * - Zod schemas for all configuration sections
 * - Configuration loading and merging logic
 * - Validation utilities
 */

export const PACKAGE_NAME = "@cream/config";
export const VERSION = "0.0.1";

// All schemas and types
export * from "./schemas";

// Validation utilities
export {
  CreamConfigSchema,
  validateConfig,
  validateConfigOrThrow,
  validatePartialConfig,
  validateAtStartup,
  type CreamConfig,
  type ValidationResult,
} from "./validate";

// Loading utilities
export {
  loadConfig,
  loadConfigFromFile,
  loadConfigWithEnv,
  type ConfigEnvironment,
} from "./loader";

// Startup validation utilities
export {
  sanitizeConfig,
  sanitizeEnv,
  validateStartup,
  validateLiveTradingSafety,
  runStartupValidation,
  validateStartupNoExit,
  createAuditLog,
  logStartupAudit,
  type StartupResult,
  type StartupAuditLog,
} from "./startup";
