/**
 * Retention Module
 *
 * Active forgetting policy based on Ebbinghaus forgetting curve.
 */

export {
  type AccessRecord,
  // Batch processing
  batchGetForgettingDecisions,
  COMPLIANCE_PERIOD_DAYS,
  // Metrics
  calculateForgettingMetrics,
  calculateFrequency,
  calculateImportance,
  // Core forgetting functions
  calculateRecency,
  calculateRetentionScore,
  // Trade cohort summarization
  createTradeCohortSummary,
  // Constants
  DECAY_CONSTANT_DAYS,
  DEFAULT_PRUNING_CONFIG,
  DELETION_THRESHOLD,
  daysSinceLastAccess,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  type EdgeInfo,
  evaluateSubgraphForMerge,
  type ForgettingDecision,
  // Types
  ForgettingEnvironment,
  type ForgettingEnvironment as ForgettingEnvironmentType,
  type ForgettingMetrics,
  ForgettingNodeType,
  type ForgettingNodeType as ForgettingNodeTypeValue,
  FREQUENCY_SCALE_FACTOR,
  filterForDeletion,
  filterForSummarization,
  findHubsTooPrune,
  findIsolatedNodes,
  formatMonthlyPeriod,
  formatQuarterlyPeriod,
  type GraphPruningAction,
  type GraphPruningConfig,
  getForgettingDecision,
  groupDecisionsForSummarization,
  hasComplianceOverride,
  INFINITE_RETENTION,
  type NodeConnectivity,
  type NodeInfo,
  PNL_NORMALIZATION_FACTOR,
  // Graph pruning
  pruneEdgesByWeight,
  type RetentionScoreBreakdown,
  // Access tracking
  recordAccess,
  SUMMARIZATION_THRESHOLD,
  shouldDelete,
  shouldSummarize,
  type TradeCohortSummary,
  type TradeDecisionInfo,
} from "./forgetting";
