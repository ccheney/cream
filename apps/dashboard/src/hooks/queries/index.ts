/**
 * Query Hooks Index
 *
 * Re-exports all TanStack Query hooks.
 *
 * @example
 * ```tsx
 * import { useSystemStatus, useDecisions, usePortfolioSummary } from "@/hooks/queries";
 * ```
 */

// Re-export query keys and cache config for convenience
export { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
// Agents
export {
  useAgentConfig,
  useAgentOutputs,
  useAgentStatuses,
  useUpdateAgentConfig,
} from "./useAgents";
// Alerts
export {
  useAcknowledgeAlert,
  useAcknowledgeAllAlerts,
  useAlertSettings,
  useAlerts,
  useDismissAlert,
  useUnacknowledgedAlertCount,
  useUpdateAlertSettings,
} from "./useAlerts";
// Backtest
export {
  useBacktest,
  useBacktestEquity,
  useBacktests,
  useBacktestTrades,
  useCreateBacktest,
  useDeleteBacktest,
} from "./useBacktest";
// Config
export {
  useConfig,
  useConfigHistory,
  useConstraintsConfig,
  useResetConfig,
  useUniverseConfig,
  useUpdateConfig,
  useUpdateConstraintsConfig,
  useUpdateUniverseConfig,
} from "./useConfig";
// Decisions
export {
  useApproveDecision,
  useDecisionDetail,
  useDecisions,
  useRecentDecisions,
  useRejectDecision,
} from "./useDecisions";

// Market
export {
  useCandles,
  useIndicators,
  useIndices,
  useNews,
  useQuote,
  useQuotes,
  useRegime,
} from "./useMarket";
// Portfolio
export {
  useClosePosition,
  useEquityCurve,
  useModifyStop,
  useModifyTarget,
  usePerformanceMetrics,
  usePortfolioSummary,
  usePositionDetail,
  usePositions,
} from "./usePortfolio";
// Risk
export {
  useCorrelation,
  useExposure,
  useGreeks,
  useLimits,
  useVaR,
} from "./useRisk";
// System
export {
  useChangeEnvironment,
  usePauseSystem,
  useStartSystem,
  useStopSystem,
  useSystemHealth,
  useSystemStatus,
} from "./useSystem";
// Theses
export {
  useCreateThesis,
  useDeleteThesis,
  useInvalidateThesis,
  useRealizeThesis,
  useTheses,
  useThesis,
  useThesisHistory,
  useUpdateThesis,
} from "./useTheses";
