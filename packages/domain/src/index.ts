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

// Clock synchronization and timestamp validation
export {
  alignToDailyCandle,
  alignToHourlyCandle,
  type ClockCheckResult,
  type ClockSkewThresholds,
  calculateDatabentoLatency,
  checkClockSkew,
  type DatabentoTimestamps,
  DEFAULT_CLOCK_THRESHOLDS,
  getClockMonitorState,
  isHourlyAligned,
  periodicClockCheck,
  resetClockMonitorState,
  selectDatabentoTimestamp,
  type TimestampValidationResult,
  validateCandleSequence,
  validateTimestamp,
  validateTimestampConsistency,
} from "./clock";
// Decision contracts
export {
  // Enums
  Action,
  type Decision,
  type DecisionPlan,
  DecisionPlanSchema,
  DecisionSchema,
  Direction,
  // Validation functions
  getDecisionDirection,
  type Instrument,
  InstrumentSchema,
  InstrumentType,
  MarketStatus,
  // Types
  type OptionContract,
  // Schemas
  OptionContractSchema,
  OptionType,
  type OrderPlan,
  OrderPlanSchema,
  OrderType,
  type References,
  ReferencesSchema,
  Regime,
  RiskDenomination,
  type RiskLevels,
  RiskLevelsSchema,
  type RiskValidationResult,
  type Size,
  SizeSchema,
  SizeUnit,
  StrategyFamily,
  TimeInForce,
  validateDecisionPlan,
  validateRiskLevels,
} from "./decision";
// Environment configuration
export {
  CreamBroker,
  CreamEnvironment,
  type EnvConfig,
  env,
  envSchema,
  getAlpacaBaseUrl,
  getEnvDatabaseSuffix,
  isBacktest,
  isLive,
  isPaper,
} from "./env";
// Execution errors and gRPC mapping
export {
  // Error details types
  type ConstraintViolationDetails,
  // Specific error classes
  ConstraintViolationError,
  calculateRetryDelay,
  DEFAULT_RETRY_OPTIONS,
  DeadlineExceededError,
  type ErrorDetails,
  // Base error class
  ExecutionError,
  GRPC_STATUS_NAMES,
  type GrpcError,
  // gRPC status codes
  GrpcStatusCode,
  InsufficientFundsError,
  InternalError,
  InvalidArgumentError,
  isConstraintViolation,
  // Type guards
  isExecutionError,
  isInsufficientFunds,
  isRetryableError,
  // Error mapping
  mapGrpcError,
  NotFoundError,
  PermissionDeniedError,
  ResourceExhaustedError,
  // Retry logic
  type RetryOptions,
  ServiceUnavailableError,
  withRetry,
} from "./errors";
// Execution schemas
export {
  type AccountState,
  // Account state
  AccountStateSchema,
  // Action mapping
  ActionMappingError,
  type BrokerOrderMapping,
  type CheckConstraintsRequest,
  CheckConstraintsRequestSchema,
  type CheckConstraintsResponse,
  CheckConstraintsResponseSchema,
  type ConstraintCheck,
  // Constraint check
  ConstraintCheckSchema,
  // Enums
  ConstraintResult,
  deriveActionFromPositions,
  type ExecutionAck,
  ExecutionAckSchema,
  type GetAccountStateRequest,
  GetAccountStateRequestSchema,
  type GetAccountStateResponse,
  GetAccountStateResponseSchema,
  type GetPositionsRequest,
  GetPositionsRequestSchema,
  type GetPositionsResponse,
  GetPositionsResponseSchema,
  mapActionToBrokerOrder,
  OrderSide,
  OrderStatus,
  type Position,
  // Positions
  PositionSchema,
  type StreamExecutionsRequest,
  // Service types
  StreamExecutionsRequestSchema,
  type StreamExecutionsResponse,
  StreamExecutionsResponseSchema,
  type SubmitOrderRequest,
  // Order execution
  SubmitOrderRequestSchema,
  type SubmitOrderResponse,
  SubmitOrderResponseSchema,
} from "./execution";
// LLM parsing with retry logic
export {
  type AgentType,
  allowsSkipOnFailure,
  cleanLLMOutput,
  defaultLogger,
  type FormattedZodError,
  formatJsonParseError,
  formatZodErrorString,
  formatZodErrors,
  generateRetryPrompt,
  generateSchemaExample,
  type ParseAttempt,
  type ParseLogger,
  type ParseOptions,
  type ParseResult,
  parseOnce,
  parseWithRetry,
  redactSensitiveData,
  requiresRejectionOnFailure,
  schemaToDescription,
} from "./llm-parsing";
// Market snapshot schemas
export {
  type Bar,
  BarSchema,
  // Bar
  BarTimeframe,
  type GetOptionChainRequest,
  GetOptionChainRequestSchema,
  type GetOptionChainResponse,
  GetOptionChainResponseSchema,
  type GetSnapshotRequest,
  GetSnapshotRequestSchema,
  type GetSnapshotResponse,
  GetSnapshotResponseSchema,
  type MarketSnapshot,
  // Market snapshot
  MarketSnapshotSchema,
  type OptionChain,
  OptionChainSchema,
  type OptionQuote,
  // Option chain
  OptionQuoteSchema,
  type Quote,
  // Quote
  QuoteSchema,
  type SubscribeMarketDataRequest,
  // Service types
  SubscribeMarketDataRequestSchema,
  type SubscribeMarketDataResponse,
  SubscribeMarketDataResponseSchema,
  type SymbolSnapshot,
  // Symbol snapshot
  SymbolSnapshotSchema,
} from "./marketSnapshot";
// Position sizing calculators
export {
  calculateAdaptiveAdjustment,
  calculateDeltaAdjustedSize,
  calculateFixedFractional,
  calculateFractionalKelly,
  calculateLiquidityLimit,
  calculateVolatilityTargeted,
  DEFAULT_RISK_LIMITS,
  type KellySizingInput,
  type MarketConditions,
  type OptionsSizingInput,
  type SizingInput,
  type SizingResult,
  type VolatilitySizingInput,
} from "./position-sizing";
// Number precision utilities
export {
  BASIS_POINTS_PER_PERCENT,
  type BasisPoints,
  BasisPointsSchema,
  // Position utilities
  calculateQtyChange,
  // Clamping
  clampToSint32,
  clampToUint32,
  // Money formatting
  formatMoney,
  formatPrice,
  fromBasisPoints,
  getPositionDirection,
  isInSint32Range,
  isInUint32Range,
  isSafeInteger,
  type NonNegativePrice,
  NonNegativePriceSchema,
  type PositivePrice,
  PositivePriceSchema,
  parseMoney,
  type Quantity,
  QuantitySchema,
  SINT32_MAX,
  // Constants
  SINT32_MIN,
  type Sint32,
  // Zod schemas
  Sint32Schema,
  // Basis points conversion
  toBasisPoints,
  UINT32_MAX,
  type Uint32,
  Uint32Schema,
  // Validation functions
  validateSint32,
  validateUint32,
} from "./numbers";
// Retention policies and storage tier management
export {
  ALL_RETENTION_POLICIES,
  BACKTEST_RETENTION_POLICIES,
  DURATIONS,
  getCompliancePolicies,
  getPoliciesForEnvironment,
  // Lookup functions
  getRetentionPolicy,
  getTargetTier,
  getTransitionDecision,
  // Compliance helpers
  isSECCompliant,
  // Policy collections
  LIVE_RETENTION_POLICIES,
  // Transition logic
  type NodeAgeInfo,
  PAPER_RETENTION_POLICIES,
  // Duration constants
  PERMANENT,
  RetentionEnvironment,
  RetentionNodeType,
  type RetentionPeriod,
  RetentionPeriodSchema,
  type RetentionPolicy,
  RetentionPolicySchema,
  STORAGE_TIER_SPECS,
  // Schemas
  StorageTier,
  // Storage tier specs
  type StorageTierCharacteristics,
  type TierTransitionResult,
  validateCompliancePolicies,
} from "./retention";
// Safety mechanisms
export {
  // Audit logging
  auditLog,
  clearAuditLog,
  // Order ID
  generateOrderId,
  getAuditLog,
  // State isolation
  getIsolatedDatabaseName,
  isCircuitOpen,
  isLiveConfirmed,
  preventAccidentalLiveExecution,
  // Circuit breaker
  recordCircuitFailure,
  requireCircuitClosed,
  // Live execution guards
  requireLiveConfirmation,
  resetCircuit,
  // Testing
  resetSafetyState,
  // Error
  SafetyError,
  type SafetyErrorCode,
  // Broker validation
  validateBrokerEndpoint,
  validateDatabaseIsolation,
  // Environment validation
  validateEnvironmentConsistency,
  validateOrderIdEnvironment,
} from "./safety";
// Time utilities
export {
  addDays,
  addHours,
  // Arithmetic functions
  addMilliseconds,
  addMinutes,
  addSeconds,
  // Comparison functions
  compareIso8601,
  type DateOnly,
  DateOnlySchema,
  daysToExpiration,
  diffMilliseconds,
  fromDateOnly,
  fromIso8601,
  getOptionExpirationTime,
  getTradingDay,
  type Iso8601,
  // Zod schemas
  Iso8601Schema,
  type Iso8601Utc,
  Iso8601UtcSchema,
  isAfter,
  isBefore,
  isBetween,
  isOptionExpired,
  isSameTradingDay,
  isValidDateOnly,
  // Validation functions
  isValidIso8601,
  nowIso8601,
  startOfDay,
  // Trading-specific utilities
  startOfHour,
  toDateOnly,
  // Conversion functions
  toIso8601,
} from "./time";
// WebSocket schemas
export * from "./websocket/index.js";
