/**
 * Graph Query Type Definitions
 *
 * Core types for graph traversal operations in HelixDB.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

/**
 * Graph traversal options.
 */
export interface TraversalOptions {
  /** Maximum traversal depth (default: 2) */
  maxDepth?: number;
  /** Maximum results to return (default: 100) */
  limit?: number;
  /** Edge types to traverse (empty = all) */
  edgeTypes?: string[];
  /** Direction of traversal */
  direction?: "outgoing" | "incoming" | "both";
  /** Maximum query time in milliseconds (default: 1000) */
  timeoutMs?: number;
  /** Minimum edge weight threshold to follow (default: 0.3) */
  edgeWeightThreshold?: number;
  /** Custom weights per edge type (overrides defaults) */
  edgeTypeWeights?: Record<string, number>;
  /** Days within which edges receive recency boost (default: 30) */
  recencyBoostDays?: number;
  /** Multiplier for recent edges (default: 1.5) */
  recencyBoostMultiplier?: number;
  /** Edge count above which nodes receive hub penalty (default: 500) */
  hubPenaltyThreshold?: number;
  /** Multiplier for hub nodes (default: 0.5) */
  hubPenaltyMultiplier?: number;
  /** Maximum neighbors per node during traversal (default: 50) */
  maxNeighborsPerNode?: number;
}

/**
 * Graph node result.
 */
export interface GraphNode<T = Record<string, unknown>> {
  /** Node ID */
  id: string;
  /** Node type */
  type: string;
  /** Node properties */
  properties: T;
}

/**
 * Graph edge result.
 */
export interface GraphEdge {
  /** Edge ID */
  id: string;
  /** Edge type (relationship name) */
  type: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Edge properties */
  properties: Record<string, unknown>;
}

/**
 * Path in the graph.
 */
export interface GraphPath<T = Record<string, unknown>> {
  /** Nodes in the path */
  nodes: GraphNode<T>[];
  /** Edges connecting the nodes */
  edges: GraphEdge[];
  /** Path length (number of edges) */
  length: number;
}

/**
 * Traversal response.
 */
export interface TraversalResponse<T = Record<string, unknown>> {
  /** Found paths */
  paths: GraphPath<T>[];
  /** All discovered nodes */
  nodes: GraphNode<T>[];
  /** Total execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Weighted traversal response with priority-scored edges.
 */
export interface WeightedTraversalResponse<T = Record<string, unknown>>
  extends TraversalResponse<T> {
  /** Edges sorted by priority score */
  prioritizedEdges: Array<{
    edge: GraphEdge;
    priority: number;
    recencyBoost: number;
    hubPenalty: number;
  }>;
  /** Statistics about filtering */
  filterStats: {
    totalEdges: number;
    filteredEdges: number;
    averagePriority: number;
  };
}

/**
 * Default traversal options.
 *
 * @see docs/plans/04-memory-helixdb.md:310-330 for rationale
 */
export const DEFAULT_TRAVERSAL_OPTIONS: Required<TraversalOptions> = {
  maxDepth: 2, // Research shows 1-2 hops optimal; deeper introduces noise
  limit: 100,
  edgeTypes: [],
  direction: "outgoing",
  timeoutMs: 1000,
  edgeWeightThreshold: 0.3,
  edgeTypeWeights: {},
  recencyBoostDays: 30,
  recencyBoostMultiplier: 1.5,
  hubPenaltyThreshold: 500,
  hubPenaltyMultiplier: 0.5,
  maxNeighborsPerNode: 50,
};
