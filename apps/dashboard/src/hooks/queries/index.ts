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
// Batch Status
export {
  type BatchStatusFilters,
  type BatchStatusResponse,
  type BatchStatusSummary,
  batchStatusKeys,
  type SyncRun,
  type SyncRunStatus,
  type SyncRunType,
  useBatchRunDetail,
  useBatchStatus,
  useTriggerBatchSync,
} from "./useBatchStatus";
// Config
export {
  useActiveConfig,
  useConstraintsConfig,
  useDraftConfig,
  usePromoteDraft,
  useRollbackConfig,
  useRuntimeConfigHistory,
  useSaveDraft,
  useUniverseConfig,
  useUpdateConstraintsConfig,
  useUpdateUniverseConfig,
  useValidateDraft,
} from "./useConfig";
// Decisions
export {
  useApproveDecision,
  useDecisionDetail,
  useDecisions,
  useRecentDecisions,
  useRejectDecision,
} from "./useDecisions";
// Economic Calendar
export {
  type UseEconomicCalendarOptions,
  useEconomicCalendar,
  useEconomicEvent,
  useThisWeekEvents,
  useUpcomingHighImpactEvents,
} from "./useEconomicCalendar";
// Indicator Lab
export {
  type Activity as IndicatorActivity,
  type ICHistoryEntry,
  type IndicatorCategory,
  type IndicatorDetail,
  type IndicatorStatus,
  type IndicatorSummary,
  indicatorLabKeys,
  type PaperTradingIndicator,
  type TriggerConditions,
  type TriggerStatus,
  useForceTriggerCheck,
  useIndicatorActivity,
  useIndicatorDetail,
  useIndicatorICHistory,
  useIndicatorList,
  usePaperTradingIndicators,
  useRetireIndicator,
  useTriggerStatus,
} from "./useIndicatorLab";
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
// Options
export {
  formatOccSymbol,
  parseOccSymbol,
  useOptionQuote,
  useOptionsChain,
  useOptionsExpirations,
} from "./useOptions";
// Portfolio
export {
  useAccount,
  useClosePosition,
  useEquityCurve,
  useModifyStop,
  useModifyTarget,
  usePerformanceMetrics,
  usePortfolioHistory,
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
// Synthesis
export {
  synthesisKeys,
  type TriggerSynthesisInput,
  type TriggerSynthesisResult,
  useSynthesisHistory,
  useSynthesisStatus,
  useTriggerSynthesis,
} from "./useSynthesis";
// System
export {
  useChangeEnvironment,
  useCycleStatus,
  usePauseSystem,
  useStartSystem,
  useStopSystem,
  useSystemHealth,
  useSystemStatus,
  useTriggerCycle,
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
