/**
 * Repository Index
 *
 * Exports all repositories and base utilities.
 */

// Agent configs (migration 011) - per-agent model/temperature overrides
export {
  AGENT_TYPES,
  type AgentConfig,
  AgentConfigsRepository,
  type AgentEnvironment,
  type AgentType,
  type CreateAgentConfigInput,
  type UpdateAgentConfigInput,
} from "./agent-configs.js";
export {
  type AgentOutput,
  AgentOutputsRepository,
  type AgentVote,
  type CreateAgentOutputInput,
} from "./agent-outputs.js";
// Alert settings (migration 013) - per-user notification preferences
export {
  type AlertSettings,
  AlertSettingsRepository,
  type CreateAlertSettingsInput,
  type QuietHours,
  type UpdateAlertSettingsInput,
} from "./alert-settings.js";
export {
  type Alert,
  type AlertFilters,
  type AlertSeverity,
  AlertsRepository,
  type AlertType,
  type CreateAlertInput,
} from "./alerts.js";
export {
  type Backtest,
  type BacktestEquityPoint,
  type BacktestStatus,
  BacktestsRepository,
  type BacktestTrade,
  type CreateBacktestInput,
} from "./backtests.js";
// Base utilities
export {
  type Filter,
  type FilterOperator,
  fromBoolean,
  mapRow,
  mapRows,
  type Order,
  type OrderDirection,
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  QueryBuilder,
  query,
  RepositoryError,
  type RepositoryErrorCode,
  toBoolean,
  toJson,
  withTransaction,
} from "./base.js";
// Market data repositories (migration 003)
export {
  type Candle,
  type CandleInsert,
  CandlesRepository,
  type Timeframe,
  TimeframeSchema,
} from "./candles.js";
export {
  type ConfigVersion,
  ConfigVersionsRepository,
  type CreateConfigVersionInput,
} from "./config-versions.js";
export {
  type ActionType,
  ActionTypeSchema,
  type CorporateAction,
  type CorporateActionInsert,
  CorporateActionsRepository,
} from "./corporate-actions.js";
// Repositories
export {
  type CreateDecisionInput,
  type Decision,
  type DecisionAction,
  type DecisionDirection,
  type DecisionFilters,
  type DecisionStatus,
  DecisionsRepository,
} from "./decisions.js";
// External events (migration 007)
export {
  type ContentSourceType,
  type CreateExternalEventInput,
  type DataPoint,
  type EventType,
  type ExternalEvent,
  type ExternalEventFilters,
  ExternalEventsRepository,
  type ExtractedEntity,
  type Sentiment,
} from "./external-events.js";
// Factor Zoo (migration 009) - Alpha factor lifecycle management
export { FactorZooRepository } from "./factor-zoo.js";
export {
  type Feature,
  type FeatureInsert,
  FeaturesRepository,
} from "./features.js";
// Historical universe (migration 005) - point-in-time survivorship bias prevention
export {
  type ChangeType,
  ChangeTypeSchema,
  type IndexConstituent,
  IndexConstituentSchema,
  IndexConstituentsRepository,
  type IndexId as HistoricalIndexId,
  IndexIdSchema as HistoricalIndexIdSchema,
  type TickerChange,
  TickerChangeSchema,
  TickerChangesRepository,
  type UniverseSnapshot,
  UniverseSnapshotSchema,
  UniverseSnapshotsRepository,
} from "./historical-universe.js";
// Indicator synthesis (migration 008)
export {
  type CreateIndicatorICHistoryInput,
  type CreateIndicatorInput,
  type CreateIndicatorTrialInput,
  type ICHistoryFilters,
  type Indicator,
  type IndicatorCategory,
  type IndicatorFilters,
  type IndicatorICHistory,
  type IndicatorStatus,
  IndicatorsRepository,
  type IndicatorTrial,
  type PaperTradingReport,
  type TrialFilters,
  type TrialParameters,
  type ValidationReport,
  type WalkForwardPeriod,
} from "./indicators.js";
export {
  type CreateOrderInput,
  type Order as OrderEntity,
  type OrderFilters,
  type OrderSide,
  type OrderStatus,
  OrdersRepository,
  type OrderType,
  type TimeInForce,
} from "./orders.js";
export {
  type CreatePortfolioSnapshotInput,
  type PortfolioSnapshot,
  type PortfolioSnapshotFilters,
  PortfolioSnapshotsRepository,
} from "./portfolio-snapshots.js";
export {
  type CreatePositionInput,
  type Position,
  type PositionFilters,
  type PositionSide,
  type PositionStatus,
  PositionsRepository,
} from "./positions.js";
// Prediction markets (migration 006)
export {
  type ArbitrageAlert,
  type ComputedSignal,
  type CreateArbitrageInput,
  type CreateSignalInput,
  type CreateSnapshotInput,
  type MarketSnapshot,
  type MarketSnapshotData,
  PredictionMarketsRepository,
  type PredictionMarketType as StoragePredictionMarketType,
  type PredictionPlatform as StoragePredictionPlatform,
  type SignalFilters,
  type SignalInputs,
  type SignalType,
  type SnapshotFilters,
} from "./prediction-markets.js";
export {
  MARKET_SYMBOL,
  type RegimeLabel,
  type RegimeLabelInsert,
  RegimeLabelsRepository,
  type RegimeTimeframe,
  RegimeTimeframeSchema,
  type RegimeType,
  RegimeTypeSchema,
} from "./regime-labels.js";
// Thesis state management (migration 004)
export {
  type CloseReason,
  type CreateThesisInput,
  isValidTransition,
  type StateTransitionInput,
  type Thesis,
  type ThesisContext,
  type ThesisFilters,
  type ThesisState,
  type ThesisStateHistoryEntry,
  ThesisStateRepository,
} from "./thesis-state.js";
// Trading config (migration 011) - runtime configuration
export {
  type CreateTradingConfigInput,
  type TradingConfig,
  TradingConfigRepository,
  type TradingConfigStatus,
  type TradingEnvironment,
  type UpdateTradingConfigInput,
} from "./trading-config.js";
export {
  type SourceType,
  SourceTypeSchema,
  type UniverseCache,
  type UniverseCacheInsert,
  UniverseCacheRepository,
} from "./universe-cache.js";
// Universe configs (migration 011) - trading universe configuration
export {
  type CreateUniverseConfigInput,
  type UniverseConfig,
  type UniverseConfigStatus,
  UniverseConfigsRepository,
  type UniverseEnvironment,
  type UniverseSource,
  type UpdateUniverseConfigInput,
} from "./universe-configs.js";
// User preferences (migration 014) - dashboard user preferences
export {
  type ChartTimeframe,
  type CreateUserPreferencesInput,
  type DateFormat,
  type NotificationSettings,
  type PortfolioView,
  type Theme,
  type TimeFormat,
  type UpdateUserPreferencesInput,
  type UserPreferences,
  UserPreferencesRepository,
} from "./user-preferences.js";
