/**
 * Active Forgetting Policy based on Ebbinghaus Forgetting Curve
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
 * ## Key Research Findings
 *
 * Ebbinghaus (1885) demonstrated:
 * - ~50% forgotten in first hour without reinforcement
 * - ~70% forgotten in 24 hours
 * - ~90% forgotten in 7 days
 * - Spaced repetition (access) strengthens retention
 * - Emotionally significant memories decay slower (importance weighting)
 *
 * ## Application to Trading Memory
 *
 * - **Recency**: Exponential decay with 1-year half-life for trading decisions
 * - **Frequency**: Log-scaled access count (spaced repetition effect)
 * - **Importance**: P/L magnitude for trades, edge count for graph nodes
 * - **Compliance**: SEC Rule 17a-4 override for LIVE trades (6 years)
 *
 * @see docs/plans/04-memory-helixdb.md - Memory Compaction and Cleanup
 * @see https://en.wikipedia.org/wiki/Forgetting_curve
 * @see https://pmc.ncbi.nlm.nih.gov/articles/PMC4492928/ - Ebbinghaus Replication
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
	type ForgettingMetrics,
	ForgettingNodeType,
	type GraphPruningAction,
	type GraphPruningConfig,
	type NodeConnectivity,
	type NodeInfo,
	type RetentionScoreBreakdown,
	type TradeCohortSummary,
	type TradeDecisionInfo,
} from "./types.js";
