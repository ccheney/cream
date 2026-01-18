/**
 * Dashboard API Types
 *
 * Barrel export for all API type modules.
 * Import from here to ensure type consistency across both apps.
 */

// Account types
export {
	type Account,
	AccountSchema,
	type AccountStatus,
	AccountStatusSchema,
	type AccountSummary,
	AccountSummarySchema,
	type PortfolioHistory,
	type PortfolioHistoryPeriod,
	PortfolioHistoryPeriodSchema,
	type PortfolioHistoryPoint,
	PortfolioHistoryPointSchema,
	PortfolioHistorySchema,
	type PortfolioHistoryTimeframe,
	PortfolioHistoryTimeframeSchema,
} from "./account.js";
// Agent types
export {
	type AgentConfig,
	AgentConfigSchema,
	type AgentStatus,
	AgentStatusSchema,
	type AgentType,
	AgentTypeSchema,
} from "./agents.js";
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
// Economic calendar types
export {
	type EconomicCalendarEvent,
	EconomicCalendarEventSchema,
	type EconomicCalendarResponse,
	EconomicCalendarResponseSchema,
	type EconomicEventCategory,
	EconomicEventCategorySchema,
	type EconomicEventImpact,
	EconomicEventImpactSchema,
	type FOMCMeeting,
	FOMCMeetingSchema,
	type UpcomingEventsResponse,
	UpcomingEventsResponseSchema,
} from "./economic-calendar.js";
// Market data types
export {
	type Candle,
	CandleSchema,
	type CorporateIndicators,
	type DataQuality,
	type EarningsQuality,
	type IndicatorSnapshot,
	IndicatorSnapshotSchema,
	type Indicators,
	IndicatorsSchema,
	type LiquidityIndicators,
	type MarketContext,
	type NewsItem,
	NewsItemSchema,
	type OptionsIndicators,
	type PriceIndicators,
	type QualityIndicators,
	type Quote,
	QuoteSchema,
	type Regime,
	RegimeSchema,
	type SentimentClassification,
	type SentimentIndicators,
	type ShortInterestIndicators,
	type SnapshotMetadata,
	type ValueIndicators,
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
