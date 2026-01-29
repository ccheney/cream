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
// Admin
export {
	adminKeys,
	type QueryStat,
	type QueryStatsFilters,
	type QueryStatsResponse,
	type QueryStatsSummary,
	useQueryStats,
	useResetQueryStats,
} from "./useAdmin";
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
// Cycle Analytics
export {
	type CycleAnalyticsFilters,
	useConfidenceCalibration,
	useCycleAnalyticsSummary,
	useDecisionAnalytics,
	useStrategyBreakdown,
} from "./useCycleAnalytics";
// Cycle History
export {
	type CycleListFilters,
	type CycleListItem,
	type CycleListResponse,
	type FullCycleResponse,
	type ReconstructedAgentState,
	type ReconstructedToolCall,
	useCycleHistory,
	useFullCycle,
} from "./useCycleHistory";
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
	useEventHistory,
	useThisWeekEvents,
	useUpcomingHighImpactEvents,
} from "./useEconomicCalendar";
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
	useClosedTrades,
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
// Search
export {
	type SearchResponse,
	type SearchResult,
	type SearchResultType,
	searchKeys,
	useGlobalSearch,
} from "./useSearch";
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
// Worker Services
export {
	type IndicatorEntry,
	type LastRun,
	type MacroWatchEntry,
	type NewspaperData,
	type PredictionMarketSignal,
	type RunDetailsData,
	type RunDetailsResponse,
	type RunStatus,
	type ServiceStatus,
	type TriggerResponse,
	type TriggerServicePayload,
	useTriggerWorkerService,
	useWorkerRun,
	useWorkerRunDetails,
	useWorkerRuns,
	useWorkerServicesStatus,
	type WorkerRun,
	type WorkerRunsFilters,
	type WorkerRunsResponse,
	type WorkerService,
	type WorkerStatusResponse,
	workerServicesKeys,
} from "./useWorkerServices";
