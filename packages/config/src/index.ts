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

// Package Dependency Validation
export {
  type CircularDependency,
  createDependencyValidator,
  type DependencyGraphSummary,
  type DependencyValidationConfig,
  type DependencyValidationResult,
  DependencyValidator,
  type DependencyViolation,
  type PackageInfo,
  parsePackageJson,
  scanPackages,
  validatePackageDependencies,
} from "./dependencyValidation";
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
// Health Checks
export {
  type ComponentHealthConfig,
  createCustomHealthCheck,
  createHealthRegistry,
  createHttpHealthCheck,
  createMemoryHealthCheck,
  type HealthCheckConfig,
  type HealthCheckFn,
  HealthCheckRegistry,
  type HealthCheckResult,
  type HealthStatus,
  type SystemHealth,
} from "./health";
// API Key Rotation
export {
  type ApiKey,
  type ApiService,
  createKeyRotationRegistry,
  type KeyRotationConfig,
  type KeyRotationLogger,
  KeyRotationManager,
  KeyRotationRegistry,
  type KeyStats,
  type RotationStrategy,
} from "./keyRotation";
// Layer Boundary Validation
export {
  type ArchitecturalLayer,
  createLayerConfig,
  createLayerValidator,
  DEFAULT_LAYERS,
  type LayerValidationConfig,
  type LayerValidationResult,
  LayerValidator,
  type LayerViolation,
  parseImports,
} from "./layerValidation";
// Loading utilities
export {
  type ConfigEnvironment,
  loadConfig,
  loadConfigFromFile,
  loadConfigWithEnv,
} from "./loader";
// Runtime config service (DB-only, no YAML fallback)
export {
  type AgentConfigsRepository,
  type ConfigHistoryEntry,
  createRuntimeConfigService,
  type FullRuntimeConfig,
  type RuntimeAgentConfig,
  type RuntimeAgentType,
  RuntimeConfigError,
  RuntimeConfigService,
  type RuntimeEnvironment,
  type RuntimeTradingConfig,
  type RuntimeTradingConfigStatus,
  type RuntimeUniverseConfig,
  type RuntimeUniverseConfigStatus,
  type RuntimeUniverseSource,
  type RuntimeValidationResult,
  type TradingConfigRepository,
  type TradingEnvironment,
  type UniverseConfigsRepository,
  type ValidationError as RuntimeValidationError,
} from "./runtime-config";
// All schemas and types
export * from "./schemas";
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
  type SecretsLogger,
  SecretsManager,
  type SecretsManagerConfig,
  type SecretsProvider,
} from "./secrets";
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
