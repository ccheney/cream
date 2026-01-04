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
  Regime,
  MarketStatus,
  OptionType,
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

// Time utilities
export {
  // Zod schemas
  Iso8601Schema,
  Iso8601UtcSchema,
  DateOnlySchema,
  type Iso8601,
  type Iso8601Utc,
  type DateOnly,
  // Conversion functions
  toIso8601,
  fromIso8601,
  nowIso8601,
  toDateOnly,
  fromDateOnly,
  // Validation functions
  isValidIso8601,
  isValidDateOnly,
  // Comparison functions
  compareIso8601,
  isBefore,
  isAfter,
  isBetween,
  // Arithmetic functions
  addMilliseconds,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  diffMilliseconds,
  // Trading-specific utilities
  startOfHour,
  startOfDay,
  isSameTradingDay,
  getTradingDay,
  getOptionExpirationTime,
  isOptionExpired,
  daysToExpiration,
} from "./time";

// Market snapshot schemas
export {
  // Quote
  QuoteSchema,
  type Quote,
  // Bar
  BarTimeframe,
  BarSchema,
  type Bar,
  // Symbol snapshot
  SymbolSnapshotSchema,
  type SymbolSnapshot,
  // Market snapshot
  MarketSnapshotSchema,
  type MarketSnapshot,
  // Option chain
  OptionQuoteSchema,
  type OptionQuote,
  OptionChainSchema,
  type OptionChain,
  // Service types
  SubscribeMarketDataRequestSchema,
  type SubscribeMarketDataRequest,
  SubscribeMarketDataResponseSchema,
  type SubscribeMarketDataResponse,
  GetSnapshotRequestSchema,
  type GetSnapshotRequest,
  GetSnapshotResponseSchema,
  type GetSnapshotResponse,
  GetOptionChainRequestSchema,
  type GetOptionChainRequest,
  GetOptionChainResponseSchema,
  type GetOptionChainResponse,
} from "./marketSnapshot";

// Execution schemas
export {
  // Enums
  ConstraintResult,
  OrderStatus,
  OrderSide,
  // Account state
  AccountStateSchema,
  type AccountState,
  // Positions
  PositionSchema,
  type Position,
  // Constraint check
  ConstraintCheckSchema,
  type ConstraintCheck,
  CheckConstraintsRequestSchema,
  type CheckConstraintsRequest,
  CheckConstraintsResponseSchema,
  type CheckConstraintsResponse,
  // Order execution
  SubmitOrderRequestSchema,
  type SubmitOrderRequest,
  SubmitOrderResponseSchema,
  type SubmitOrderResponse,
  ExecutionAckSchema,
  type ExecutionAck,
  // Service types
  StreamExecutionsRequestSchema,
  type StreamExecutionsRequest,
  StreamExecutionsResponseSchema,
  type StreamExecutionsResponse,
  GetAccountStateRequestSchema,
  type GetAccountStateRequest,
  GetAccountStateResponseSchema,
  type GetAccountStateResponse,
  GetPositionsRequestSchema,
  type GetPositionsRequest,
  GetPositionsResponseSchema,
  type GetPositionsResponse,
} from "./execution";

// Number precision utilities
export {
  // Constants
  SINT32_MIN,
  SINT32_MAX,
  UINT32_MAX,
  BASIS_POINTS_PER_PERCENT,
  // Zod schemas
  Sint32Schema,
  type Sint32,
  Uint32Schema,
  type Uint32,
  PositivePriceSchema,
  type PositivePrice,
  NonNegativePriceSchema,
  type NonNegativePrice,
  BasisPointsSchema,
  type BasisPoints,
  QuantitySchema,
  type Quantity,
  // Validation functions
  validateSint32,
  validateUint32,
  isSafeInteger,
  isInSint32Range,
  isInUint32Range,
  // Basis points conversion
  toBasisPoints,
  fromBasisPoints,
  // Money formatting
  formatMoney,
  parseMoney,
  formatPrice,
  // Clamping
  clampToSint32,
  clampToUint32,
  // Position utilities
  calculateQtyChange,
  getPositionDirection,
} from "./numbers";

// WebSocket schemas
export * from "./websocket/index.js";
