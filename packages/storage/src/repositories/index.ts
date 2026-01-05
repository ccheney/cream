/**
 * Repository Index
 *
 * Exports all repositories and base utilities.
 */

// Base utilities
export {
  RepositoryError,
  type RepositoryErrorCode,
  withTransaction,
  QueryBuilder,
  query,
  paginate,
  mapRow,
  mapRows,
  toBoolean,
  fromBoolean,
  parseJson,
  toJson,
  type Filter,
  type FilterOperator,
  type Order,
  type OrderDirection,
  type PaginationOptions,
  type PaginatedResult,
} from "./base.js";

// Repositories
export {
  DecisionsRepository,
  type Decision,
  type CreateDecisionInput,
  type DecisionFilters,
  type DecisionStatus,
  type DecisionAction,
  type DecisionDirection,
} from "./decisions.js";

export {
  AlertsRepository,
  type Alert,
  type CreateAlertInput,
  type AlertFilters,
  type AlertSeverity,
  type AlertType,
} from "./alerts.js";

export {
  OrdersRepository,
  type Order as OrderEntity,
  type CreateOrderInput,
  type OrderFilters,
  type OrderSide,
  type OrderType,
  type OrderStatus,
  type TimeInForce,
} from "./orders.js";

export {
  PositionsRepository,
  type Position,
  type CreatePositionInput,
  type PositionFilters,
  type PositionSide,
  type PositionStatus,
} from "./positions.js";

export {
  AgentOutputsRepository,
  type AgentOutput,
  type CreateAgentOutputInput,
  type AgentVote,
} from "./agent-outputs.js";

export {
  PortfolioSnapshotsRepository,
  type PortfolioSnapshot,
  type CreatePortfolioSnapshotInput,
  type PortfolioSnapshotFilters,
} from "./portfolio-snapshots.js";

export {
  BacktestsRepository,
  type Backtest,
  type CreateBacktestInput,
  type BacktestStatus,
  type BacktestTrade,
  type BacktestEquityPoint,
} from "./backtests.js";

export {
  ConfigVersionsRepository,
  type ConfigVersion,
  type CreateConfigVersionInput,
} from "./config-versions.js";
