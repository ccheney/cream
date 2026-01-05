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
  // Common validators
  UuidSchema,
  DatetimeSchema,
  TickerSymbolSchema,
  EquityTickerSchema,
  MoneySchema,
  PercentageSchema,
  DecimalPercentSchema,
  ConfidenceSchema,
  // Decision
  DecisionStatus,
  TradingAction,
  PositionDirection,
  SizeUnitType,
  type DecisionInsert,
  DecisionInsertSchema,
  type DecisionUpdate,
  DecisionUpdateSchema,
  // Order
  OrderSideType,
  OrderTypeType,
  OrderStatusType,
  type OrderInsert,
  OrderInsertSchema,
  type OrderUpdate,
  OrderUpdateSchema,
  // Alert
  AlertSeverityType,
  type AlertInsert,
  AlertInsertSchema,
  type AlertUpdate,
  AlertUpdateSchema,
  // Portfolio
  type PortfolioSnapshotInsert,
  PortfolioSnapshotInsertSchema,
  // Position
  type PositionInsert,
  PositionInsertSchema,
  type PositionUpdate,
  PositionUpdateSchema,
  // Candle
  Timeframe,
  type CandleInsert,
  CandleInsertSchema,
  // Indicator
  type IndicatorInsert,
  IndicatorInsertSchema,
  // Cycle
  CyclePhase,
  Environment,
  type CycleLogInsert,
  CycleLogInsertSchema,
  type CycleLogUpdate,
  CycleLogUpdateSchema,
  // Agent
  AgentTypeEnum,
  type AgentOutputInsert,
  AgentOutputInsertSchema,
  // Market
  type MarketSnapshotInsert,
  MarketSnapshotInsertSchema,
  // Option
  OptionTypeEnum,
  type OptionChainInsert,
  OptionChainInsertSchema,
  // Regime
  MarketRegime,
  type RegimeInsert,
  RegimeInsertSchema,
} from "./turso.js";

// ============================================
// HelixDB Schemas
// ============================================

export {
  // Constants
  EMBEDDING_DIMENSION,
  // Common schemas
  EmbeddingSchema,
  // Node schemas
  type MemoryNode,
  MemoryNodeSchema,
  type MemoryNodeCreate,
  MemoryNodeCreateSchema,
  type CitationNode,
  CitationNodeSchema,
  CitationSource,
  type ThesisNode,
  ThesisNodeSchema,
  ThesisState,
  type ThesisUpdate,
  ThesisUpdateSchema,
  type MarketContextNode,
  MarketContextNodeSchema,
  type DecisionNode,
  DecisionNodeSchema,
  // Edge schemas
  type CitesEdge,
  CitesEdgeSchema,
  type SupportsEdge,
  SupportsEdgeSchema,
  type InvalidatesEdge,
  InvalidatesEdgeSchema,
  type TransitionsEdge,
  TransitionsEdgeSchema,
  type OccurredInEdge,
  OccurredInEdgeSchema,
  type ReferencesEdge,
  ReferencesEdgeSchema,
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
  // Error types
  type ValidationFieldError,
  type ValidationError,
  // Error formatting
  formatValidationError,
  formatZodIssue,
  getErrorMessages,
  // Safe parsing
  type ParseResult,
  safeParse,
  parseWithDefaults,
  // SQL injection prevention
  containsSqlInjection,
  safeString,
  safeTickerSymbol,
  sanitizeString,
  // Validation decorators
  validated,
  validatedSafe,
  // Batch validation
  type BatchValidationResult,
  validateBatch,
  // Type guards
  createTypeGuard,
  // Coercion
  coerceInt,
  coerceBool,
  coerceDate,
  // Schema composition
  partialExcept,
  withTimestamps,
  withSoftDelete,
} from "./validation.js";
