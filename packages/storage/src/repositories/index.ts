/**
 * Repository Index
 *
 * Exports all repositories and base utilities.
 */

export {
  type AgentOutput,
  AgentOutputsRepository,
  type AgentVote,
  type CreateAgentOutputInput,
} from "./agent-outputs.js";
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
export {
  type SourceType,
  SourceTypeSchema,
  type UniverseCache,
  type UniverseCacheInsert,
  UniverseCacheRepository,
} from "./universe-cache.js";
