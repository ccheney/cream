/**
 * @cream/domain - Core domain types and Zod schemas
 *
 * This package contains:
 * - Zod schemas that mirror Protobuf contracts
 * - Environment variable validation
 * - Core type definitions
 */

export const PACKAGE_NAME = "@cream/domain";
export const VERSION = "0.0.1";

// Environment configuration
export {
  env,
  envSchema,
  isBacktest,
  isPaper,
  isLive,
  getAlpacaBaseUrl,
  getEnvDatabaseSuffix,
  CreamEnvironment,
  CreamBroker,
  type EnvConfig,
} from "./env";

// Safety mechanisms
export {
  // Order ID
  generateOrderId,
  validateOrderIdEnvironment,
  // Broker validation
  validateBrokerEndpoint,
  // Live execution guards
  requireLiveConfirmation,
  isLiveConfirmed,
  preventAccidentalLiveExecution,
  // Environment validation
  validateEnvironmentConsistency,
  // State isolation
  getIsolatedDatabaseName,
  validateDatabaseIsolation,
  // Audit logging
  auditLog,
  getAuditLog,
  clearAuditLog,
  // Circuit breaker
  recordCircuitFailure,
  isCircuitOpen,
  resetCircuit,
  requireCircuitClosed,
  // Error
  SafetyError,
  type SafetyErrorCode,
  // Testing
  resetSafetyState,
} from "./safety";
