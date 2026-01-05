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

import { z } from "zod/v4";

// ============================================
// Constants
// ============================================

/**
 * Decay constant in days for the forgetting curve.
 * 365 days = 1 year half-life for trading decisions.
 * At t=365 days, recency factor ≈ 0.368 (1/e)
 */
export const DECAY_CONSTANT_DAYS = 365;

/**
 * SEC Rule 17a-4 compliance period in days (6 years)
 */
export const COMPLIANCE_PERIOD_DAYS = 6 * 365; // 2190 days

/**
 * Frequency scaling factor for log transformation
 * Prevents over-weighting highly accessed nodes
 */
export const FREQUENCY_SCALE_FACTOR = 10;

/**
 * P/L normalization factor for importance calculation ($10K)
 */
export const PNL_NORMALIZATION_FACTOR = 10_000;

/**
 * Edge count normalization factor for importance calculation
 */
export const EDGE_COUNT_NORMALIZATION_FACTOR = 50;

/**
 * Threshold below which nodes are candidates for summarization
 */
export const SUMMARIZATION_THRESHOLD = 0.1;

/**
 * Threshold below which nodes are candidates for deletion (non-LIVE only)
 */
export const DELETION_THRESHOLD = 0.05;

/**
 * Infinite retention score (never forget - compliance requirement)
 */
export const INFINITE_RETENTION = Number.POSITIVE_INFINITY;

// ============================================
// Types
// ============================================

/**
 * Environment for retention decisions
 */
export const ForgettingEnvironment = z.enum(["LIVE", "PAPER", "BACKTEST"]);
export type ForgettingEnvironment = z.infer<typeof ForgettingEnvironment>;

/**
 * Node type for forgetting decisions
 */
export const ForgettingNodeType = z.enum([
  "TradeDecision",
  "TradeLifecycleEvent",
  "ExternalEvent",
  "FilingChunk",
  "TranscriptChunk",
  "NewsItem",
  "Company",
  "MacroEntity",
]);
export type ForgettingNodeType = z.infer<typeof ForgettingNodeType>;

/**
 * Information about a node for forgetting decisions
 */
export interface NodeInfo {
  /** Node unique identifier */
  id: string;
  /** Node type */
  nodeType: ForgettingNodeType;
  /** Trading environment */
  environment: ForgettingEnvironment;
  /** When the node was created */
  createdAt: Date;
  /** Number of times the node has been accessed/retrieved */
  accessCount: number;
  /** Number of graph edges connected to this node */
  edgeCount: number;
  /** Realized P/L (only for TradeDecision nodes) */
  realizedPnl?: number;
  /** Last time the node was accessed */
  lastAccessedAt?: Date;
}

/**
 * Retention score breakdown for debugging/analysis
 */
export interface RetentionScoreBreakdown {
  /** Base score (always 1.0) */
  baseScore: number;
  /** Recency factor (exponential decay) */
  recencyFactor: number;
  /** Frequency factor (1 + log-scaled access count) */
  frequencyFactor: number;
  /** Importance factor (1 + domain-specific weight) */
  importanceFactor: number;
  /** Whether compliance override applies */
  complianceOverride: boolean;
  /** Final retention score */
  finalScore: number;
  /** Age in days */
  ageDays: number;
}

/**
 * Forgetting decision for a node
 */
export interface ForgettingDecision {
  /** Node ID */
  nodeId: string;
  /** Retention score */
  score: number;
  /** Score breakdown for analysis */
  breakdown: RetentionScoreBreakdown;
  /** Whether the node should be summarized */
  shouldSummarize: boolean;
  /** Whether the node should be deleted */
  shouldDelete: boolean;
  /** Reason for the decision */
  reason: string;
}

/**
 * Trade cohort summary for aggregated decisions
 */
export interface TradeCohortSummary {
  /** Summary type identifier */
  summaryType: "trade_cohort";
  /** Time period (e.g., "2024-Q3") */
  period: string;
  /** Instrument identifier */
  instrumentId: string;
  /** Market regime label */
  regimeLabel: string;
  /** Aggregated statistics */
  stats: {
    /** Total number of decisions */
    totalDecisions: number;
    /** Win rate (0-1) */
    winRate: number;
    /** Average return per trade */
    avgReturn: number;
    /** Average holding period in days */
    avgHoldingDays: number;
    /** Total realized P/L */
    totalPnl: number;
  };
  /** IDs of notable decisions (top performers, outliers) */
  notableDecisionIds: string[];
  /** Compressed/clustered rationale embedding */
  compressedRationaleEmbedding?: number[];
}

/**
 * Graph pruning action
 */
export type GraphPruningAction =
  | { type: "remove_edge"; edgeId: string; reason: string }
  | { type: "remove_node"; nodeId: string; reason: string }
  | { type: "merge_subgraph"; nodeIds: string[]; summaryNodeId: string; reason: string }
  | {
      type: "prune_hub";
      nodeId: string;
      retainedEdges: number;
      prunedEdges: number;
      reason: string;
    };

/**
 * Graph pruning configuration
 */
export interface GraphPruningConfig {
  /** Minimum edge weight to retain (default: 0.3) */
  minEdgeWeight: number;
  /** Maximum isolated subgraph size to merge (default: 5) */
  maxIsolatedSubgraphSize: number;
  /** Maximum edges for hub nodes (default: 100) */
  maxHubEdges: number;
  /** Hub edge threshold before pruning (default: 1000) */
  hubEdgeThreshold: number;
}

/**
 * Default graph pruning configuration
 */
export const DEFAULT_PRUNING_CONFIG: GraphPruningConfig = {
  minEdgeWeight: 0.3,
  maxIsolatedSubgraphSize: 5,
  maxHubEdges: 100,
  hubEdgeThreshold: 1000,
};

// ============================================
// Core Forgetting Functions
// ============================================

/**
 * Calculate the recency factor using exponential decay (Ebbinghaus curve).
 *
 * The recency factor decreases exponentially with age:
 *   recency = e^(-age_days / decay_constant)
 *
 * With decay_constant = 365 days:
 *   - Day 0: recency = 1.0
 *   - Day 30: recency ≈ 0.92
 *   - Day 90: recency ≈ 0.78
 *   - Day 365: recency ≈ 0.37 (1/e)
 *   - Day 730: recency ≈ 0.14
 *
 * @param ageDays - Age of the node in days
 * @param decayConstant - Decay constant in days (default: 365)
 * @returns Recency factor between 0 and 1
 */
export function calculateRecency(
  ageDays: number,
  decayConstant: number = DECAY_CONSTANT_DAYS
): number {
  if (ageDays < 0) {
    throw new Error("Age cannot be negative");
  }
  return Math.exp(-ageDays / decayConstant);
}

/**
 * Calculate the frequency factor based on access count.
 *
 * Uses log scaling to prevent over-weighting highly accessed nodes
 * (spaced repetition effect).
 *
 *   frequency = log(1 + access_count) / scale_factor
 *
 * The +1 prevents log(0) and ensures frequency is always >= 0.
 *
 * @param accessCount - Number of times the node has been accessed
 * @param scaleFactor - Scaling factor (default: 10)
 * @returns Frequency factor (0 for never accessed, increases logarithmically)
 */
export function calculateFrequency(
  accessCount: number,
  scaleFactor: number = FREQUENCY_SCALE_FACTOR
): number {
  if (accessCount < 0) {
    throw new Error("Access count cannot be negative");
  }
  return Math.log(1 + accessCount) / scaleFactor;
}

/**
 * Calculate the importance factor based on node type and properties.
 *
 * For TradeDecision nodes:
 *   importance = |realized_pnl| / normalization_factor
 *
 * For other nodes:
 *   importance = edge_count / normalization_factor
 *
 * This mimics emotional salience in memory - significant events
 * (large gains/losses) are remembered longer.
 *
 * @param nodeInfo - Node information
 * @returns Importance factor (higher = more important)
 */
export function calculateImportance(nodeInfo: NodeInfo): number {
  if (nodeInfo.nodeType === "TradeDecision" && nodeInfo.realizedPnl !== undefined) {
    // P/L magnitude indicates significance
    return Math.abs(nodeInfo.realizedPnl) / PNL_NORMALIZATION_FACTOR;
  }

  // Edge count indicates graph centrality/relevance
  return nodeInfo.edgeCount / EDGE_COUNT_NORMALIZATION_FACTOR;
}

/**
 * Check if compliance override applies (LIVE trades < 6 years).
 *
 * SEC Rule 17a-4 requires:
 * - Records preserved for 6 years
 * - First 2 years must be easily accessible
 *
 * @param nodeInfo - Node information
 * @param ageDays - Age of node in days
 * @returns True if compliance override applies (infinite retention)
 */
export function hasComplianceOverride(nodeInfo: NodeInfo, ageDays: number): boolean {
  if (nodeInfo.environment !== "LIVE") {
    return false;
  }

  // Only TradeDecision and TradeLifecycleEvent require compliance
  if (nodeInfo.nodeType !== "TradeDecision" && nodeInfo.nodeType !== "TradeLifecycleEvent") {
    return false;
  }

  return ageDays < COMPLIANCE_PERIOD_DAYS;
}

/**
 * Calculate the complete retention score for a node.
 *
 * Formula:
 *   score = base_score * recency * (1 + frequency) * (1 + importance)
 *
 * If compliance override applies, returns INFINITE_RETENTION.
 *
 * @param nodeInfo - Node information
 * @param referenceDate - Reference date for age calculation (default: now)
 * @returns Complete retention score breakdown
 */
export function calculateRetentionScore(
  nodeInfo: NodeInfo,
  referenceDate: Date = new Date()
): RetentionScoreBreakdown {
  const ageDays = Math.floor(
    (referenceDate.getTime() - nodeInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const baseScore = 1.0;
  const recencyFactor = calculateRecency(ageDays);
  const frequencyFactor = 1 + calculateFrequency(nodeInfo.accessCount);
  const importanceFactor = 1 + calculateImportance(nodeInfo);
  const complianceOverride = hasComplianceOverride(nodeInfo, ageDays);

  let finalScore: number;
  if (complianceOverride) {
    finalScore = INFINITE_RETENTION;
  } else {
    finalScore = baseScore * recencyFactor * frequencyFactor * importanceFactor;
  }

  return {
    baseScore,
    recencyFactor,
    frequencyFactor,
    importanceFactor,
    complianceOverride,
    finalScore,
    ageDays,
  };
}

/**
 * Determine if a node should be summarized based on retention score.
 *
 * @param score - Retention score
 * @param threshold - Summarization threshold (default: 0.1)
 * @returns True if node should be summarized
 */
export function shouldSummarize(
  score: number,
  threshold: number = SUMMARIZATION_THRESHOLD
): boolean {
  if (!Number.isFinite(score)) {
    return false; // Infinite retention = never summarize
  }
  return score < threshold;
}

/**
 * Determine if a node should be deleted based on retention score.
 *
 * Only non-LIVE nodes can be deleted. LIVE nodes must be retained
 * for compliance.
 *
 * @param score - Retention score
 * @param environment - Trading environment
 * @param threshold - Deletion threshold (default: 0.05)
 * @returns True if node should be deleted
 */
export function shouldDelete(
  score: number,
  environment: ForgettingEnvironment,
  threshold: number = DELETION_THRESHOLD
): boolean {
  if (!Number.isFinite(score)) {
    return false; // Infinite retention = never delete
  }
  if (environment === "LIVE") {
    return false; // LIVE nodes cannot be deleted (compliance)
  }
  return score < threshold;
}

/**
 * Get forgetting decision for a node.
 *
 * @param nodeInfo - Node information
 * @param referenceDate - Reference date for age calculation
 * @returns Forgetting decision with score and recommended actions
 */
export function getForgettingDecision(
  nodeInfo: NodeInfo,
  referenceDate: Date = new Date()
): ForgettingDecision {
  const breakdown = calculateRetentionScore(nodeInfo, referenceDate);
  const { finalScore } = breakdown;

  const summarize = shouldSummarize(finalScore);
  const deleteNode = shouldDelete(finalScore, nodeInfo.environment);

  let reason: string;
  if (breakdown.complianceOverride) {
    reason = `Compliance override: LIVE ${nodeInfo.nodeType} must be retained for ${COMPLIANCE_PERIOD_DAYS} days`;
  } else if (deleteNode) {
    reason = `Score ${finalScore.toFixed(4)} below deletion threshold ${DELETION_THRESHOLD}`;
  } else if (summarize) {
    reason = `Score ${finalScore.toFixed(4)} below summarization threshold ${SUMMARIZATION_THRESHOLD}`;
  } else {
    reason = `Retention score ${finalScore.toFixed(4)} above thresholds`;
  }

  return {
    nodeId: nodeInfo.id,
    score: finalScore,
    breakdown,
    shouldSummarize: summarize,
    shouldDelete: deleteNode,
    reason,
  };
}

// ============================================
// Batch Processing
// ============================================

/**
 * Get forgetting decisions for multiple nodes.
 *
 * @param nodes - Array of node information
 * @param referenceDate - Reference date for age calculation
 * @returns Array of forgetting decisions
 */
export function batchGetForgettingDecisions(
  nodes: NodeInfo[],
  referenceDate: Date = new Date()
): ForgettingDecision[] {
  return nodes.map((node) => getForgettingDecision(node, referenceDate));
}

/**
 * Filter nodes that need summarization.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Decisions for nodes that should be summarized
 */
export function filterForSummarization(decisions: ForgettingDecision[]): ForgettingDecision[] {
  return decisions.filter((d) => d.shouldSummarize && !d.shouldDelete);
}

/**
 * Filter nodes that should be deleted.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Decisions for nodes that should be deleted
 */
export function filterForDeletion(decisions: ForgettingDecision[]): ForgettingDecision[] {
  return decisions.filter((d) => d.shouldDelete);
}

// ============================================
// Trade Cohort Summarization
// ============================================

/**
 * Trade decision info for cohort summarization
 */
export interface TradeDecisionInfo {
  /** Decision ID */
  decisionId: string;
  /** Instrument ID */
  instrumentId: string;
  /** Regime label */
  regimeLabel: string;
  /** Created timestamp */
  createdAt: Date;
  /** Closed timestamp */
  closedAt?: Date;
  /** Realized P/L */
  realizedPnl: number;
  /** Return percentage */
  returnPct: number;
  /** Whether the trade was profitable */
  isWin: boolean;
}

/**
 * Create a trade cohort summary from multiple decisions.
 *
 * @param period - Time period (e.g., "2024-Q3")
 * @param instrumentId - Instrument identifier
 * @param regimeLabel - Market regime label
 * @param decisions - Trade decisions to summarize
 * @param maxNotableDecisions - Maximum notable decisions to retain (default: 5)
 * @returns Trade cohort summary
 */
export function createTradeCohortSummary(
  period: string,
  instrumentId: string,
  regimeLabel: string,
  decisions: TradeDecisionInfo[],
  maxNotableDecisions = 5
): TradeCohortSummary {
  if (decisions.length === 0) {
    throw new Error("Cannot create summary from empty decisions array");
  }

  const wins = decisions.filter((d) => d.isWin);
  const winRate = wins.length / decisions.length;

  const avgReturn = decisions.reduce((sum, d) => sum + d.returnPct, 0) / decisions.length;

  // Calculate average holding days
  const holdingDays = decisions
    .filter((d): d is typeof d & { closedAt: Date } => d.closedAt !== undefined)
    .map((d) => {
      const diff = d.closedAt.getTime() - d.createdAt.getTime();
      return diff / (1000 * 60 * 60 * 24);
    });
  const avgHoldingDays =
    holdingDays.length > 0 ? holdingDays.reduce((sum, d) => sum + d, 0) / holdingDays.length : 0;

  const totalPnl = decisions.reduce((sum, d) => sum + d.realizedPnl, 0);

  // Select notable decisions (top by absolute P/L)
  const sortedByAbsPnl = [...decisions].sort(
    (a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl)
  );
  const notableDecisionIds = sortedByAbsPnl.slice(0, maxNotableDecisions).map((d) => d.decisionId);

  return {
    summaryType: "trade_cohort",
    period,
    instrumentId,
    regimeLabel,
    stats: {
      totalDecisions: decisions.length,
      winRate,
      avgReturn,
      avgHoldingDays,
      totalPnl,
    },
    notableDecisionIds,
  };
}

/**
 * Group trade decisions by period and instrument for cohort summarization.
 *
 * @param decisions - Trade decisions to group
 * @param periodFormatter - Function to format period from date (default: quarterly)
 * @returns Map of cohort key to decisions
 */
export function groupDecisionsForSummarization(
  decisions: TradeDecisionInfo[],
  periodFormatter: (date: Date) => string = formatQuarterlyPeriod
): Map<string, TradeDecisionInfo[]> {
  const groups = new Map<string, TradeDecisionInfo[]>();

  for (const decision of decisions) {
    const period = periodFormatter(decision.createdAt);
    const key = `${period}:${decision.instrumentId}:${decision.regimeLabel}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(decision);
  }

  return groups;
}

/**
 * Format a date as a quarterly period string (e.g., "2024-Q3")
 */
export function formatQuarterlyPeriod(date: Date): string {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Format a date as a monthly period string (e.g., "2024-03")
 */
export function formatMonthlyPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

// ============================================
// Graph Pruning
// ============================================

/**
 * Edge information for pruning decisions
 */
export interface EdgeInfo {
  /** Edge ID */
  edgeId: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Edge weight (0-1) */
  weight: number;
}

/**
 * Node connectivity info for pruning
 */
export interface NodeConnectivity {
  /** Node ID */
  nodeId: string;
  /** Connected edge IDs */
  edgeIds: string[];
  /** Sorted edges by weight (for hub pruning) */
  edgesByWeight?: EdgeInfo[];
}

/**
 * Determine edges to prune based on weight threshold.
 *
 * @param edges - Array of edges to evaluate
 * @param minWeight - Minimum weight to retain (default: 0.3)
 * @returns Array of pruning actions for low-weight edges
 */
export function pruneEdgesByWeight(
  edges: EdgeInfo[],
  minWeight: number = DEFAULT_PRUNING_CONFIG.minEdgeWeight
): GraphPruningAction[] {
  return edges
    .filter((edge) => edge.weight < minWeight)
    .map((edge) => ({
      type: "remove_edge" as const,
      edgeId: edge.edgeId,
      reason: `Edge weight ${edge.weight.toFixed(3)} below threshold ${minWeight}`,
    }));
}

/**
 * Find isolated nodes (nodes with no edges) for removal.
 *
 * @param nodes - Array of node connectivity info
 * @returns Array of pruning actions for isolated nodes
 */
export function findIsolatedNodes(nodes: NodeConnectivity[]): GraphPruningAction[] {
  return nodes
    .filter((node) => node.edgeIds.length === 0)
    .map((node) => ({
      type: "remove_node" as const,
      nodeId: node.nodeId,
      reason: "Node has no edges (isolated)",
    }));
}

/**
 * Find hub nodes that exceed edge threshold and should be pruned.
 *
 * @param nodes - Array of node connectivity info with edges sorted by weight
 * @param config - Pruning configuration
 * @returns Array of pruning actions for hub nodes
 */
export function findHubsTooPrune(
  nodes: NodeConnectivity[],
  config: GraphPruningConfig = DEFAULT_PRUNING_CONFIG
): GraphPruningAction[] {
  const actions: GraphPruningAction[] = [];

  for (const node of nodes) {
    if (node.edgeIds.length > config.hubEdgeThreshold) {
      const prunedEdges = node.edgeIds.length - config.maxHubEdges;
      actions.push({
        type: "prune_hub",
        nodeId: node.nodeId,
        retainedEdges: config.maxHubEdges,
        prunedEdges,
        reason: `Hub node has ${node.edgeIds.length} edges, pruning to top ${config.maxHubEdges} by weight`,
      });
    }
  }

  return actions;
}

/**
 * Find small isolated subgraphs for merging.
 *
 * A subgraph is considered isolated if it's not connected to the main graph.
 * Small isolated subgraphs are candidates for summarization into a single node.
 *
 * @param subgraphNodeIds - Array of node IDs in the subgraph
 * @param maxSize - Maximum subgraph size for merging
 * @param summaryNodeIdGenerator - Function to generate summary node ID
 * @returns Pruning action if subgraph should be merged, null otherwise
 */
export function evaluateSubgraphForMerge(
  subgraphNodeIds: string[],
  maxSize: number = DEFAULT_PRUNING_CONFIG.maxIsolatedSubgraphSize,
  summaryNodeIdGenerator: () => string = () => `summary_${Date.now()}`
): GraphPruningAction | null {
  if (subgraphNodeIds.length >= maxSize || subgraphNodeIds.length <= 1) {
    return null;
  }

  return {
    type: "merge_subgraph",
    nodeIds: subgraphNodeIds,
    summaryNodeId: summaryNodeIdGenerator(),
    reason: `Isolated subgraph with ${subgraphNodeIds.length} nodes merged into summary node`,
  };
}

// ============================================
// Access Tracking
// ============================================

/**
 * Access tracking record for a node
 */
export interface AccessRecord {
  /** Node ID */
  nodeId: string;
  /** Total access count */
  accessCount: number;
  /** Last access timestamp */
  lastAccessedAt: Date;
  /** First access timestamp */
  firstAccessedAt: Date;
}

/**
 * Update access tracking for a node.
 *
 * @param existing - Existing access record (or undefined for new)
 * @param nodeId - Node ID
 * @param accessTime - Time of access (default: now)
 * @returns Updated access record
 */
export function recordAccess(
  existing: AccessRecord | undefined,
  nodeId: string,
  accessTime: Date = new Date()
): AccessRecord {
  if (!existing) {
    return {
      nodeId,
      accessCount: 1,
      lastAccessedAt: accessTime,
      firstAccessedAt: accessTime,
    };
  }

  return {
    ...existing,
    accessCount: existing.accessCount + 1,
    lastAccessedAt: accessTime,
  };
}

/**
 * Calculate days since last access for recency boost.
 *
 * @param record - Access record
 * @param referenceDate - Reference date (default: now)
 * @returns Days since last access
 */
export function daysSinceLastAccess(
  record: AccessRecord,
  referenceDate: Date = new Date()
): number {
  const diffMs = referenceDate.getTime() - record.lastAccessedAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// Metrics and Analysis
// ============================================

/**
 * Summary statistics for a batch of forgetting decisions
 */
export interface ForgettingMetrics {
  /** Total nodes evaluated */
  totalNodes: number;
  /** Nodes with compliance override */
  complianceOverrideCount: number;
  /** Nodes eligible for summarization */
  summarizationCandidates: number;
  /** Nodes eligible for deletion */
  deletionCandidates: number;
  /** Average retention score (excluding infinite) */
  avgRetentionScore: number;
  /** Median retention score (excluding infinite) */
  medianRetentionScore: number;
  /** Score distribution buckets */
  scoreDistribution: {
    infinite: number;
    high: number; // >= 0.5
    medium: number; // 0.1 - 0.5
    low: number; // 0.05 - 0.1
    veryLow: number; // < 0.05
  };
}

/**
 * Calculate metrics from forgetting decisions.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Summary metrics
 */
export function calculateForgettingMetrics(decisions: ForgettingDecision[]): ForgettingMetrics {
  const finiteScores = decisions
    .map((d) => d.score)
    .filter((s) => Number.isFinite(s))
    .sort((a, b) => a - b);

  const avgScore =
    finiteScores.length > 0 ? finiteScores.reduce((sum, s) => sum + s, 0) / finiteScores.length : 0;

  const medianScore =
    finiteScores.length > 0 ? (finiteScores[Math.floor(finiteScores.length / 2)] ?? 0) : 0;

  const distribution = {
    infinite: decisions.filter((d) => !Number.isFinite(d.score)).length,
    high: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.5).length,
    medium: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.1 && d.score < 0.5)
      .length,
    low: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.05 && d.score < 0.1)
      .length,
    veryLow: decisions.filter((d) => Number.isFinite(d.score) && d.score < 0.05).length,
  };

  return {
    totalNodes: decisions.length,
    complianceOverrideCount: decisions.filter((d) => d.breakdown.complianceOverride).length,
    summarizationCandidates: decisions.filter((d) => d.shouldSummarize && !d.shouldDelete).length,
    deletionCandidates: decisions.filter((d) => d.shouldDelete).length,
    avgRetentionScore: avgScore,
    medianRetentionScore: medianScore,
    scoreDistribution: distribution,
  };
}
