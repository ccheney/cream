/**
 * Graph Traversal Query Helpers
 *
 * Type-safe helpers for graph traversal operations in HelixDB.
 * Target latency: <1ms for graph traversal operations.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../client";

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
 * Default traversal options.
 *
 * @see docs/plans/04-memory-helixdb.md:310-330 for rationale
 */
const DEFAULT_OPTIONS: Required<TraversalOptions> = {
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

// ============================================
// Edge Scoring Constants
// ============================================

/**
 * Default edge type weight thresholds.
 *
 * @see docs/plans/04-memory-helixdb.md:325-330
 */
export const EDGE_TYPE_THRESHOLDS: Record<string, number> = {
  INFLUENCED_DECISION: 0.6, // confidence_score >= 0.6
  DEPENDS_ON: 0.3, // strength weighted
  AFFECTED_BY: 0.3, // sensitivity threshold
  MENTIONED_IN: 0.5, // mention_type dependent
};

/**
 * Mention type weights for MENTIONED_IN edges.
 */
export const MENTION_TYPE_WEIGHTS: Record<string, number> = {
  PRIMARY: 1.0,
  SECONDARY: 0.7,
  PEER_COMPARISON: 0.5,
};

// ============================================
// Edge Scoring Functions
// ============================================

/**
 * Extract the weight attribute from an edge based on its type.
 *
 * @param edge - Graph edge with properties
 * @returns Weight value [0, 1] or undefined if no weight attribute
 */
export function getEdgeWeight(edge: GraphEdge): number | undefined {
  const props = edge.properties;

  switch (edge.type) {
    case "INFLUENCED_DECISION":
      return typeof props.confidence_score === "number"
        ? props.confidence_score
        : typeof props.influence_score === "number"
          ? props.influence_score
          : undefined;

    case "DEPENDS_ON":
      return typeof props.strength === "number" ? props.strength : undefined;

    case "AFFECTED_BY":
      return typeof props.sensitivity === "number" ? props.sensitivity : undefined;

    case "MENTIONED_IN": {
      const mentionType = props.mention_type as string | undefined;
      return mentionType ? (MENTION_TYPE_WEIGHTS[mentionType] ?? 0.5) : 0.5;
    }

    default:
      // For other edge types, check for common weight properties
      if (typeof props.weight === "number") {
        return props.weight;
      }
      if (typeof props.score === "number") {
        return props.score;
      }
      if (typeof props.strength === "number") {
        return props.strength;
      }
      return undefined;
  }
}

/**
 * Check if an edge meets the weight threshold for traversal.
 *
 * @param edge - Graph edge to check
 * @param options - Traversal options with thresholds
 * @returns true if edge should be followed
 */
export function shouldFollowEdge(edge: GraphEdge, options: Required<TraversalOptions>): boolean {
  // Check custom threshold for this edge type
  const customThreshold = options.edgeTypeWeights[edge.type];
  const typeThreshold = EDGE_TYPE_THRESHOLDS[edge.type];
  const threshold = customThreshold ?? typeThreshold ?? options.edgeWeightThreshold;

  const weight = getEdgeWeight(edge);

  // If no weight attribute, use threshold 0 (allow all)
  if (weight === undefined) {
    return true;
  }

  return weight >= threshold;
}

/**
 * Calculate recency boost for an edge based on its timestamp.
 *
 * @param edge - Graph edge with timestamp
 * @param options - Traversal options with recency settings
 * @returns Multiplier (1.0 for old edges, recencyBoostMultiplier for recent)
 */
export function calculateRecencyBoost(
  edge: GraphEdge,
  options: Required<TraversalOptions>
): number {
  const props = edge.properties;

  // Extract timestamp from various possible fields
  const timestampStr = props.created_at ?? props.timestamp ?? props.computed_at ?? props.derived_at;

  if (typeof timestampStr !== "string") {
    return 1.0;
  }

  const edgeDate = new Date(timestampStr);
  const now = new Date();
  const daysSinceCreation = (now.getTime() - edgeDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCreation <= options.recencyBoostDays) {
    return options.recencyBoostMultiplier;
  }

  return 1.0;
}

/**
 * Calculate hub penalty for a node based on its edge count.
 *
 * @param edgeCount - Number of edges connected to the node
 * @param options - Traversal options with hub penalty settings
 * @returns Multiplier (1.0 for normal nodes, hubPenaltyMultiplier for hubs)
 */
export function calculateHubPenalty(
  edgeCount: number,
  options: Required<TraversalOptions>
): number {
  if (edgeCount > options.hubPenaltyThreshold) {
    return options.hubPenaltyMultiplier;
  }
  return 1.0;
}

/**
 * Calculate the final traversal priority score for an edge.
 *
 * Combines:
 * 1. Base edge weight
 * 2. Recency boost for recent edges
 * 3. Hub penalty for high-degree target nodes
 *
 * @param edge - Graph edge to score
 * @param targetNodeEdgeCount - Number of edges on the target node
 * @param options - Traversal options
 * @returns Priority score (higher = traverse first)
 */
export function calculateEdgePriority(
  edge: GraphEdge,
  targetNodeEdgeCount: number,
  options: Required<TraversalOptions>
): number {
  // Base weight (default to 0.5 if no weight attribute)
  const baseWeight = getEdgeWeight(edge) ?? 0.5;

  // Apply recency boost
  const recencyMultiplier = calculateRecencyBoost(edge, options);

  // Apply hub penalty
  const hubMultiplier = calculateHubPenalty(targetNodeEdgeCount, options);

  return baseWeight * recencyMultiplier * hubMultiplier;
}

/**
 * Sort edges by priority score (highest first).
 *
 * @param edges - Array of edges with target node edge counts
 * @param options - Traversal options
 * @returns Sorted edges
 */
export function sortEdgesByPriority(
  edges: Array<{ edge: GraphEdge; targetNodeEdgeCount: number }>,
  options: Required<TraversalOptions>
): Array<{ edge: GraphEdge; targetNodeEdgeCount: number; priority: number }> {
  return edges
    .map((e) => ({
      ...e,
      priority: calculateEdgePriority(e.edge, e.targetNodeEdgeCount, options),
    }))
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Filter and sort edges for weighted traversal.
 *
 * Applies:
 * 1. Edge weight threshold filtering
 * 2. Priority scoring with recency boost and hub penalty
 * 3. Sorting by priority (highest first)
 * 4. Limiting to maxNeighborsPerNode
 *
 * @param edges - Edges to process
 * @param targetNodeEdgeCounts - Map of node ID to edge count
 * @param options - Traversal options
 * @returns Filtered and sorted edges
 */
export function filterAndPrioritizeEdges(
  edges: GraphEdge[],
  targetNodeEdgeCounts: Map<string, number>,
  options: Required<TraversalOptions>
): GraphEdge[] {
  // Filter by weight threshold
  const filtered = edges.filter((edge) => shouldFollowEdge(edge, options));

  // Score and sort
  const withCounts = filtered.map((edge) => ({
    edge,
    targetNodeEdgeCount: targetNodeEdgeCounts.get(edge.targetId) ?? 0,
  }));

  const sorted = sortEdgesByPriority(withCounts, options);

  // Limit to max neighbors per node
  return sorted.slice(0, options.maxNeighborsPerNode).map((e) => e.edge);
}

/**
 * Get a node by ID.
 *
 * @param client - HelixDB client
 * @param nodeId - Node ID
 * @returns The node or null if not found
 */
export async function getNode<T = Record<string, unknown>>(
  client: HelixClient,
  nodeId: string
): Promise<GraphNode<T> | null> {
  try {
    const result = await client.query<GraphNode<T>>("getNode", { id: nodeId });
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Get nodes by type.
 *
 * @param client - HelixDB client
 * @param nodeType - Node type
 * @param options - Query options
 * @returns Matching nodes
 */
export async function getNodesByType<T = Record<string, unknown>>(
  client: HelixClient,
  nodeType: string,
  options: { limit?: number; filters?: Record<string, unknown> } = {}
): Promise<GraphNode<T>[]> {
  const result = await client.query<GraphNode<T>[]>("getNodesByType", {
    type: nodeType,
    limit: options.limit ?? 100,
    filters: options.filters ?? {},
  });
  return result.data;
}

/**
 * Traverse the graph from a starting node.
 *
 * @param client - HelixDB client
 * @param startNodeId - Starting node ID
 * @param options - Traversal options
 * @returns Traversal results with paths and nodes
 *
 * @example
 * ```typescript
 * const result = await traverse(client, "decision-123", {
 *   maxDepth: 2,
 *   edgeTypes: ["INFLUENCED_DECISION"],
 *   direction: "incoming",
 * });
 * ```
 */
export async function traverse<T = Record<string, unknown>>(
  client: HelixClient,
  startNodeId: string,
  options: TraversalOptions = {}
): Promise<TraversalResponse<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const params: Record<string, unknown> = {
    start_id: startNodeId,
    max_depth: opts.maxDepth,
    limit: opts.limit,
    direction: opts.direction,
    max_neighbors: opts.maxNeighborsPerNode,
  };

  if (opts.edgeTypes.length > 0) {
    params.edge_types = opts.edgeTypes;
  }

  // Pass weight threshold to HelixDB if supported
  if (opts.edgeWeightThreshold > 0) {
    params.min_edge_weight = opts.edgeWeightThreshold;
  }

  const result = await client.query<TraversalResponse<T>>("traverse", params);
  return result.data;
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
 * Traverse the graph with edge weight prioritization.
 *
 * This function extends the basic traverse with:
 * 1. Edge weight threshold filtering (per edge type)
 * 2. Recency boost for recent edges
 * 3. Hub penalty for high-degree nodes
 * 4. Priority-based edge ordering
 *
 * @param client - HelixDB client
 * @param startNodeId - Starting node ID
 * @param options - Traversal options with weight settings
 * @returns Weighted traversal results with prioritized edges
 *
 * @example
 * ```typescript
 * const result = await weightedTraverse(client, "decision-123", {
 *   maxDepth: 2,
 *   edgeTypes: ["INFLUENCED_DECISION", "DEPENDS_ON"],
 *   edgeWeightThreshold: 0.5,
 *   recencyBoostDays: 14,
 * });
 *
 * // High-priority edges first
 * for (const { edge, priority } of result.prioritizedEdges) {
 *   console.log(`${edge.type}: ${priority.toFixed(2)}`);
 * }
 * ```
 */
export async function weightedTraverse<T = Record<string, unknown>>(
  client: HelixClient,
  startNodeId: string,
  options: TraversalOptions = {}
): Promise<WeightedTraversalResponse<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = performance.now();

  // Get base traversal result
  const baseResult = await traverse<T>(client, startNodeId, options);

  // Build edge count map for hub penalty calculation
  const nodeEdgeCounts = new Map<string, number>();
  for (const path of baseResult.paths) {
    for (const edge of path.edges) {
      nodeEdgeCounts.set(edge.targetId, (nodeEdgeCounts.get(edge.targetId) ?? 0) + 1);
      nodeEdgeCounts.set(edge.sourceId, (nodeEdgeCounts.get(edge.sourceId) ?? 0) + 1);
    }
  }

  // Collect all unique edges
  const allEdges = new Map<string, GraphEdge>();
  for (const path of baseResult.paths) {
    for (const edge of path.edges) {
      allEdges.set(edge.id, edge);
    }
  }

  const totalEdges = allEdges.size;

  // Filter edges by weight threshold
  const filteredEdges = Array.from(allEdges.values()).filter((edge) =>
    shouldFollowEdge(edge, opts)
  );

  // Calculate priority for each edge
  const prioritizedEdges = filteredEdges.map((edge) => {
    const targetEdgeCount = nodeEdgeCounts.get(edge.targetId) ?? 0;
    const recencyBoost = calculateRecencyBoost(edge, opts);
    const hubPenalty = calculateHubPenalty(targetEdgeCount, opts);
    const priority = calculateEdgePriority(edge, targetEdgeCount, opts);

    return { edge, priority, recencyBoost, hubPenalty };
  });

  // Sort by priority (highest first)
  prioritizedEdges.sort((a, b) => b.priority - a.priority);

  // Calculate average priority
  const averagePriority =
    prioritizedEdges.length > 0
      ? prioritizedEdges.reduce((sum, e) => sum + e.priority, 0) / prioritizedEdges.length
      : 0;

  return {
    ...baseResult,
    executionTimeMs: performance.now() - startTime,
    prioritizedEdges,
    filterStats: {
      totalEdges,
      filteredEdges: filteredEdges.length,
      averagePriority,
    },
  };
}

/**
 * Find neighbors of a node.
 *
 * @param client - HelixDB client
 * @param nodeId - Node ID
 * @param options - Options for neighbor retrieval
 * @returns Neighboring nodes
 */
export async function getNeighbors<T = Record<string, unknown>>(
  client: HelixClient,
  nodeId: string,
  options: Pick<TraversalOptions, "edgeTypes" | "direction" | "limit"> = {}
): Promise<GraphNode<T>[]> {
  const result = await traverse<T>(client, nodeId, {
    maxDepth: 1,
    limit: options.limit ?? 100,
    edgeTypes: options.edgeTypes ?? [],
    direction: options.direction ?? "both",
  });

  return result.nodes.filter((n) => n.id !== nodeId);
}

/**
 * Get events that influenced a trade decision.
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Events that influenced this decision
 */
export async function getInfluencingEvents(
  client: HelixClient,
  decisionId: string
): Promise<GraphNode[]> {
  return getNeighbors(client, decisionId, {
    edgeTypes: ["INFLUENCED_DECISION"],
    direction: "incoming",
  });
}

/**
 * Get decisions influenced by an event.
 *
 * @param client - HelixDB client
 * @param eventId - External event ID
 * @returns Decisions influenced by this event
 */
export async function getInfluencedDecisions(
  client: HelixClient,
  eventId: string
): Promise<GraphNode[]> {
  return getNeighbors(client, eventId, {
    edgeTypes: ["INFLUENCED_DECISION"],
    direction: "outgoing",
  });
}

/**
 * Get trade lifecycle events for a decision.
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Lifecycle events for this decision
 */
export async function getLifecycleEvents(
  client: HelixClient,
  decisionId: string
): Promise<GraphNode[]> {
  return getNeighbors(client, decisionId, {
    edgeTypes: ["HAS_EVENT"],
    direction: "outgoing",
  });
}

/**
 * Get company-related nodes (filings, transcripts, news).
 *
 * @param client - HelixDB client
 * @param companySymbol - Company ticker symbol
 * @param nodeTypes - Types of nodes to retrieve
 * @returns Related nodes
 */
export async function getCompanyNodes(
  client: HelixClient,
  companySymbol: string,
  nodeTypes: ("FilingChunk" | "TranscriptChunk" | "NewsItem")[] = [
    "FilingChunk",
    "TranscriptChunk",
    "NewsItem",
  ]
): Promise<GraphNode[]> {
  const result = await client.query<GraphNode[]>("getCompanyNodes", {
    symbol: companySymbol,
    node_types: nodeTypes,
  });
  return result.data;
}

// ============================================
// Citation Types
// ============================================

/**
 * Citation source type
 */
export type CitationSourceType = "news" | "filing" | "transcript" | "memory" | "event";

/**
 * Citation for a trade decision
 */
export interface Citation {
  /** Unique identifier */
  id: string;
  /** Source type */
  sourceType: CitationSourceType;
  /** URL if available */
  url?: string;
  /** Title or headline */
  title: string;
  /** Source name (e.g., "Reuters", "SEC EDGAR") */
  source: string;
  /** Relevant text snippet */
  snippet: string;
  /** Relevance/influence score (0-1) */
  relevanceScore: number;
  /** When the citation was fetched/created */
  fetchedAt: string;
}

/**
 * Get citations for a trade decision.
 *
 * Retrieves all sources that influenced the decision:
 * - News items that mentioned related symbols
 * - Filing chunks from SEC filings
 * - Transcript chunks from earnings calls
 * - External events that influenced the decision
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Array of citations
 *
 * @example
 * ```typescript
 * const citations = await getDecisionCitations(client, "decision-123");
 * for (const citation of citations) {
 *   console.log(`[${citation.sourceType}] ${citation.title}`);
 * }
 * ```
 */
export async function getDecisionCitations(
  client: HelixClient,
  decisionId: string
): Promise<Citation[]> {
  const citations: Citation[] = [];

  // 1. Get events that influenced this decision
  const influencingNodes = await getInfluencingEvents(client, decisionId);

  for (const node of influencingNodes) {
    const props = node.properties as Record<string, unknown>;

    if (node.type === "ExternalEvent") {
      citations.push({
        id: String(props.event_id ?? node.id),
        sourceType: "event",
        title: String(props.text_summary ?? props.event_type ?? "External Event"),
        source: String(props.event_type ?? "Unknown"),
        snippet: String(props.payload ?? props.text_summary ?? ""),
        relevanceScore: 0.8, // Default for events
        fetchedAt: String(props.event_time ?? new Date().toISOString()),
      });
    } else if (node.type === "NewsItem") {
      citations.push({
        id: String(props.item_id ?? node.id),
        sourceType: "news",
        title: String(props.headline ?? "News Item"),
        source: String(props.source ?? "Unknown"),
        snippet: String(props.body_text ?? props.headline ?? "").slice(0, 500),
        relevanceScore: props.sentiment_score ? Math.abs(Number(props.sentiment_score)) : 0.7,
        fetchedAt: String(props.published_at ?? new Date().toISOString()),
      });
    } else if (node.type === "FilingChunk") {
      citations.push({
        id: String(props.chunk_id ?? node.id),
        sourceType: "filing",
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${props.company_symbol}`,
        title: `${props.filing_type} Filing - ${props.company_symbol}`,
        source: "SEC EDGAR",
        snippet: String(props.chunk_text ?? "").slice(0, 500),
        relevanceScore: 0.75,
        fetchedAt: String(props.filing_date ?? new Date().toISOString()),
      });
    } else if (node.type === "TranscriptChunk") {
      citations.push({
        id: String(props.chunk_id ?? node.id),
        sourceType: "transcript",
        title: `Earnings Call - ${props.company_symbol} (${props.call_date})`,
        source: String(props.speaker ?? "Earnings Call"),
        snippet: String(props.chunk_text ?? "").slice(0, 500),
        relevanceScore: 0.7,
        fetchedAt: String(props.call_date ?? new Date().toISOString()),
      });
    }
  }

  // Sort by relevance score (highest first)
  citations.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return citations;
}
