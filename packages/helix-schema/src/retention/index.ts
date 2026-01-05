/**
 * Retention Module
 *
 * Active forgetting policy based on Ebbinghaus forgetting curve.
 */

export {
  // Constants
  DECAY_CONSTANT_DAYS,
  COMPLIANCE_PERIOD_DAYS,
  FREQUENCY_SCALE_FACTOR,
  PNL_NORMALIZATION_FACTOR,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  SUMMARIZATION_THRESHOLD,
  DELETION_THRESHOLD,
  INFINITE_RETENTION,
  DEFAULT_PRUNING_CONFIG,
  // Types
  ForgettingEnvironment,
  type ForgettingEnvironment as ForgettingEnvironmentType,
  ForgettingNodeType,
  type ForgettingNodeType as ForgettingNodeTypeValue,
  type NodeInfo,
  type RetentionScoreBreakdown,
  type ForgettingDecision,
  type TradeCohortSummary,
  type GraphPruningAction,
  type GraphPruningConfig,
  type TradeDecisionInfo,
  type EdgeInfo,
  type NodeConnectivity,
  type AccessRecord,
  type ForgettingMetrics,
  // Core forgetting functions
  calculateRecency,
  calculateFrequency,
  calculateImportance,
  hasComplianceOverride,
  calculateRetentionScore,
  shouldSummarize,
  shouldDelete,
  getForgettingDecision,
  // Batch processing
  batchGetForgettingDecisions,
  filterForSummarization,
  filterForDeletion,
  // Trade cohort summarization
  createTradeCohortSummary,
  groupDecisionsForSummarization,
  formatQuarterlyPeriod,
  formatMonthlyPeriod,
  // Graph pruning
  pruneEdgesByWeight,
  findIsolatedNodes,
  findHubsTooPrune,
  evaluateSubgraphForMerge,
  // Access tracking
  recordAccess,
  daysSinceLastAccess,
  // Metrics
  calculateForgettingMetrics,
} from "./forgetting";
