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

// Decision contracts
export {
  // Enums
  Action,
  InstrumentType,
  SizeUnit,
  OrderType,
  TimeInForce,
  RiskDenomination,
  StrategyFamily,
  Direction,
  // Schemas
  OptionContractSchema,
  InstrumentSchema,
  SizeSchema,
  OrderPlanSchema,
  RiskLevelsSchema,
  ReferencesSchema,
  DecisionSchema,
  DecisionPlanSchema,
  // Types
  type OptionContract,
  type Instrument,
  type Size,
  type OrderPlan,
  type RiskLevels,
  type References,
  type Decision,
  type DecisionPlan,
  type RiskValidationResult,
  // Validation functions
  getDecisionDirection,
  validateRiskLevels,
  validateDecisionPlan,
} from "./decision";
