/**
 * Retention Module
 *
 * Active forgetting policy based on Ebbinghaus forgetting curve.
 *
 * Implements adaptive data retention based on cognitive memory research.
 * The forgetting curve demonstrates exponential decay of memory retention:
 *
 *   R = e^(-t/S)
 *
 * where:
 *   R = retention strength (0-1)
 *   t = time elapsed
 *   S = memory strength (stability)
 *
 * @see docs/plans/04-memory-helixdb.md - Memory Compaction and Cleanup
 * @see https://en.wikipedia.org/wiki/Forgetting_curve
 */

// Re-export access tracking
export { daysSinceLastAccess, recordAccess } from "./access-tracking.js";
// Re-export cohort summarization
export {
  createTradeCohortSummary,
  formatMonthlyPeriod,
  formatQuarterlyPeriod,
  groupDecisionsForSummarization,
} from "./cohort-summarization.js";
// Re-export constants
export {
  COMPLIANCE_PERIOD_DAYS,
  DECAY_CONSTANT_DAYS,
  DELETION_THRESHOLD,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  FREQUENCY_SCALE_FACTOR,
  INFINITE_RETENTION,
  PNL_NORMALIZATION_FACTOR,
  SUMMARIZATION_THRESHOLD,
} from "./constants.js";
// Re-export decay calculations
export {
  calculateFrequency,
  calculateImportance,
  calculateRecency,
  calculateRetentionScore,
  hasComplianceOverride,
  shouldDelete,
  shouldSummarize,
} from "./decay.js";
// Re-export decision functions
export {
  batchGetForgettingDecisions,
  filterForDeletion,
  filterForSummarization,
  getForgettingDecision,
} from "./decisions.js";

// Re-export graph pruning
export {
  evaluateSubgraphForMerge,
  findHubsTooPrune,
  findIsolatedNodes,
  pruneEdgesByWeight,
} from "./graph-pruning.js";
// Re-export metrics
export { calculateForgettingMetrics } from "./metrics.js";
// Re-export types
export {
  type AccessRecord,
  DEFAULT_PRUNING_CONFIG,
  type EdgeInfo,
  type ForgettingDecision,
  ForgettingEnvironment,
  type ForgettingEnvironment as ForgettingEnvironmentType,
  type ForgettingMetrics,
  ForgettingNodeType,
  type ForgettingNodeType as ForgettingNodeTypeValue,
  type GraphPruningAction,
  type GraphPruningConfig,
  type NodeConnectivity,
  type NodeInfo,
  type RetentionScoreBreakdown,
  type TradeCohortSummary,
  type TradeDecisionInfo,
} from "./types.js";
