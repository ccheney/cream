/**
 * Dashboard API Types
 *
 * Barrel export for all API type modules.
 * Import from here to ensure type consistency across both apps.
 */

// Agent types
export {
  type AgentConfig,
  AgentConfigSchema,
  type AgentStatus,
  AgentStatusSchema,
  type AgentType,
  AgentTypeSchema,
} from "./agents.js";
// Backtest types
export {
  type BacktestDetail,
  BacktestDetailSchema,
  type BacktestEquityPoint,
  BacktestEquityPointSchema,
  type BacktestMetrics,
  BacktestMetricsSchema,
  type BacktestStatus,
  BacktestStatusSchema,
  type BacktestSummary,
  BacktestSummarySchema,
  type BacktestTrade,
  type BacktestTradeAction,
  BacktestTradeActionSchema,
  BacktestTradeSchema,
} from "./backtest.js";
// Common/System types
export {
  type Alert,
  AlertSchema,
  type AlertSeverity,
  AlertSeveritySchema,
  type SystemStatus,
  SystemStatusSchema,
} from "./common.js";
// Configuration types
export {
  type Config,
  type ConfigHistoryEntry,
  ConfigHistoryEntrySchema,
  ConfigSchema,
  type ConstraintsConfig,
  ConstraintsConfigSchema,
  type Environment,
  EnvironmentSchema,
} from "./config.js";
// Decision types
export {
  type AgentOutput,
  AgentOutputSchema,
  type Citation,
  CitationSchema,
  type Decision,
  type DecisionAction,
  DecisionActionSchema,
  type DecisionDetail,
  DecisionDetailSchema,
  type DecisionDirection,
  DecisionDirectionSchema,
  DecisionSchema,
  type DecisionStatus,
  DecisionStatusSchema,
  type ExecutionDetail,
  ExecutionDetailSchema,
  type PaginatedDecisions,
  PaginatedDecisionsSchema,
  type SizeUnit,
  SizeUnitSchema,
} from "./decisions.js";

// Market data types
export {
  type Candle,
  CandleSchema,
  type Indicators,
  IndicatorsSchema,
  type NewsItem,
  NewsItemSchema,
  type Quote,
  QuoteSchema,
  type Regime,
  RegimeSchema,
} from "./market.js";
// Portfolio types
export {
  type EquityPoint,
  EquityPointSchema,
  type PerformanceMetrics,
  PerformanceMetricsSchema,
  type PeriodMetrics,
  PeriodMetricsSchema,
  type PortfolioSummary,
  PortfolioSummarySchema,
  type Position,
  PositionSchema,
  type PositionSide,
  PositionSideSchema,
} from "./portfolio.js";
// Risk types
export {
  type CorrelationMatrix,
  CorrelationMatrixSchema,
  type ExposureMetrics,
  ExposureMetricsSchema,
  type GreeksSummary,
  GreeksSummarySchema,
  type LimitCategory,
  LimitCategorySchema,
  type LimitStatus,
  LimitStatusSchema,
  type LimitStatusValue,
  LimitStatusValueSchema,
  type PositionGreeks,
  PositionGreeksSchema,
  type VaRMethod,
  VaRMethodSchema,
  type VaRMetrics,
  VaRMetricsSchema,
} from "./risk.js";

// Thesis types
export {
  type Thesis,
  type ThesisDirection,
  ThesisDirectionSchema,
  type ThesisHistoryEntry,
  ThesisHistoryEntrySchema,
  ThesisSchema,
  type ThesisStatus,
  ThesisStatusSchema,
} from "./theses.js";
