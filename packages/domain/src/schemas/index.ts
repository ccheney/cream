/**
 * Data Validation Schemas
 *
 * Comprehensive Zod schemas for validating data at application boundaries.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

// ============================================
// Turso Database Schemas
// ============================================

export {
  type AgentOutputInsert,
  AgentOutputInsertSchema,
  // Agent
  AgentTypeEnum,
  type AlertInsert,
  AlertInsertSchema,
  // Alert
  AlertSeverityType,
  type AlertUpdate,
  AlertUpdateSchema,
  type CandleInsert,
  CandleInsertSchema,
  ConfidenceSchema,
  type CycleLogInsert,
  CycleLogInsertSchema,
  type CycleLogUpdate,
  CycleLogUpdateSchema,
  // Cycle
  CyclePhase,
  DatetimeSchema,
  DecimalPercentSchema,
  type DecisionInsert,
  DecisionInsertSchema,
  // Decision
  DecisionStatus,
  type DecisionUpdate,
  DecisionUpdateSchema,
  Environment,
  EquityTickerSchema,
  // Indicator
  type IndicatorInsert,
  IndicatorInsertSchema,
  // Regime
  MarketRegime,
  // Market
  type MarketSnapshotInsert,
  MarketSnapshotInsertSchema,
  MoneySchema,
  type OptionChainInsert,
  OptionChainInsertSchema,
  // Option
  OptionTypeEnum,
  type OrderInsert,
  OrderInsertSchema,
  // Order
  OrderSideType,
  OrderStatusType,
  OrderTypeType,
  type OrderUpdate,
  OrderUpdateSchema,
  PercentageSchema,
  // Portfolio
  type PortfolioSnapshotInsert,
  PortfolioSnapshotInsertSchema,
  PositionDirection,
  // Position
  type PositionInsert,
  PositionInsertSchema,
  type PositionUpdate,
  PositionUpdateSchema,
  type RegimeInsert,
  RegimeInsertSchema,
  SizeUnitType,
  TickerSymbolSchema,
  // Candle
  Timeframe,
  TradingAction,
  // Common validators
  UuidSchema,
} from "./turso.js";

// ============================================
// HelixDB Schemas
// ============================================

export {
  type CitationNode,
  CitationNodeSchema,
  CitationSource,
  // Edge schemas
  type CitesEdge,
  CitesEdgeSchema,
  type DecisionNode,
  DecisionNodeSchema,
  // Constants
  EMBEDDING_DIMENSION,
  // Common schemas
  EmbeddingSchema,
  type InvalidatesEdge,
  InvalidatesEdgeSchema,
  type MarketContextNode,
  MarketContextNodeSchema,
  // Node schemas
  type MemoryNode,
  type MemoryNodeCreate,
  MemoryNodeCreateSchema,
  MemoryNodeSchema,
  type OccurredInEdge,
  OccurredInEdgeSchema,
  type ReferencesEdge,
  ReferencesEdgeSchema,
  type SupportsEdge,
  SupportsEdgeSchema,
  type ThesisNode,
  ThesisNodeSchema,
  ThesisState,
  type ThesisUpdate,
  ThesisUpdateSchema,
  type TransitionsEdge,
  TransitionsEdgeSchema,
  // Vector search
  type VectorSearchQuery,
  VectorSearchQuerySchema,
  type VectorSearchResult,
  VectorSearchResultSchema,
  // Utilities
  validateEmbedding,
  validateThesisTransition,
} from "./helix.js";

// ============================================
// Validation Utilities
// ============================================

export {
  // Batch validation
  type BatchValidationResult,
  coerceBool,
  coerceDate,
  // Coercion
  coerceInt,
  // SQL injection prevention
  containsSqlInjection,
  // Type guards
  createTypeGuard,
  // Error formatting
  formatValidationError,
  formatZodIssue,
  getErrorMessages,
  // Safe parsing
  type ParseResult,
  parseWithDefaults,
  // Schema composition
  partialExcept,
  safeParse,
  safeString,
  safeTickerSymbol,
  sanitizeString,
  type ValidationError,
  // Error types
  type ValidationFieldError,
  validateBatch,
  // Validation decorators
  validated,
  validatedSafe,
  withSoftDelete,
  withTimestamps,
} from "./validation.js";

// ============================================
// DecisionPlan Schemas (Protobuf mirrors)
// ============================================

export {
  // Enums
  type Action,
  ActionSchema,
  // Messages
  type Decision,
  type DecisionPlan,
  DecisionPlanSchema,
  type DecisionPlanValidationResult,
  DecisionPlanValidationResultSchema,
  DecisionSchema,
  type Direction,
  DirectionSchema,
  type Environment as DecisionEnvironment,
  EnvironmentSchema as DecisionEnvironmentSchema,
  type ExecutionParams,
  ExecutionParamsSchema,
  type ExecutionTactic,
  ExecutionTacticSchema,
  type Instrument,
  InstrumentSchema,
  type InstrumentType,
  InstrumentTypeSchema,
  type ISO8601Timestamp,
  ISO8601TimestampSchema,
  type OptionContract,
  OptionContractSchema,
  type OptionType as DecisionOptionType,
  OptionTypeSchema as DecisionOptionTypeSchema,
  type OrderPlan,
  OrderPlanSchema,
  type OrderType as DecisionOrderType,
  OrderTypeSchema as DecisionOrderTypeSchema,
  type References,
  ReferencesSchema,
  type Regime,
  RegimeSchema,
  type RiskDenomination,
  RiskDenominationSchema,
  type RiskLevels,
  RiskLevelsSchema,
  type RiskValidationResult,
  RiskValidationResultSchema,
  type Size,
  SizeSchema,
  type SizeUnit,
  SizeUnitSchema,
  type StrategyFamily,
  StrategyFamilySchema,
  type TimeInForce,
  TimeInForceSchema,
  // Utilities
  validateDecisionPlan,
  validateRiskReward,
} from "./decision-plan.js";

// ============================================
// Expiration Handling Schemas
// ============================================

export {
  // Enums
  ExpirationAction,
  ExpirationCheckpoint,
  ExpirationReason,
  Moneyness,
  PositionTypeForDTE,
  // Schemas
  type ExpirationEvaluation,
  ExpirationEvaluationSchema,
  type ExpirationPolicyConfig,
  ExpirationPolicyConfig as ExpirationPolicyConfigSchema,
  type ExpiringPosition,
  ExpiringPositionSchema,
  type MinimumDTEConfig,
  MinimumDTEConfig as MinimumDTEConfigSchema,
  type PinRiskConfig,
  PinRiskConfig as PinRiskConfigSchema,
  // Constants
  DEFAULT_EXPIRATION_POLICY,
  EXPIRATION_CHECKPOINT_TIMES,
  // Utilities
  checkPinRisk,
  classifyMoneyness,
  getCurrentCheckpoint,
  getMinimumDTE,
  getPinRiskThreshold,
  isPastCheckpoint,
  parseETTimeToMinutes,
  shouldLetExpireWorthless,
} from "./expiration.js";
