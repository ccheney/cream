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

// Feature flags runtime
export {
  areFlagsInitialized,
  BUILT_IN_FLAGS,
  type BuiltInFlagId,
  createFlagEvaluator,
  type Environment,
  type FeatureFlag,
  type FeatureFlagsConfig,
  type FlagContext,
  type FlagEvaluator,
  type FlagResult,
  getFlags,
  initializeFlags,
  isCBRMemoryEnabled,
  isDebugLoggingEnabled,
  isHITLEnabled,
  isLiveExecutionEnabled,
  isOptionsEnabled,
  resetFlags,
} from "./flags";
// Loading utilities
export {
  type ConfigEnvironment,
  loadConfig,
  loadConfigFromFile,
  loadConfigWithEnv,
} from "./loader";
// All schemas and types
export * from "./schemas";
// Startup validation utilities
export {
  createAuditLog,
  logStartupAudit,
  runStartupValidation,
  type StartupAuditLog,
  type StartupResult,
  sanitizeConfig,
  sanitizeEnv,
  validateLiveTradingSafety,
  validateStartup,
  validateStartupNoExit,
} from "./startup";
// Validation utilities
export {
  type CreamConfig,
  CreamConfigSchema,
  type ValidationResult,
  validateAtStartup,
  validateConfig,
  validateConfigOrThrow,
  validatePartialConfig,
} from "./validate";
// API Key Rotation
export {
  type ApiKey,
  type ApiService,
  createKeyRotationRegistry,
  KeyRotationManager,
  KeyRotationRegistry,
  type KeyRotationConfig,
  type KeyRotationLogger,
  type KeyStats,
  type RotationStrategy,
} from "./keyRotation";
// Secrets Management
export {
  createEnvSecretsManager,
  createSecretsManager,
  EncryptedFileSecretsProvider,
  EnvSecretsProvider,
  type FileEncryptionConfig,
  MemorySecretsProvider,
  type Secret,
  type SecretAuditEvent,
  SecretsManager,
  type SecretsManagerConfig,
  type SecretsLogger,
  type SecretsProvider,
} from "./secrets";
