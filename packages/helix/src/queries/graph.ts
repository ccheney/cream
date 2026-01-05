/**
 * Graph Traversal Query Helpers
 *
 * Type-safe helpers for graph traversal operations in HelixDB.
 * Target latency: <1ms for graph traversal operations.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../client.js";

/**
 * Graph traversal options.
 */
export interface TraversalOptions {
  /** Maximum traversal depth (default: 3) */
  maxDepth?: number;
  /** Maximum results to return (default: 100) */
  limit?: number;
  /** Edge types to traverse (empty = all) */
  edgeTypes?: string[];
  /** Direction of traversal */
  direction?: "outgoing" | "incoming" | "both";
  /** Maximum query time in milliseconds (default: 1000) */
  timeoutMs?: number;
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
 */
const DEFAULT_OPTIONS: Required<TraversalOptions> = {
  maxDepth: 3,
  limit: 100,
  edgeTypes: [],
  direction: "outgoing",
  timeoutMs: 1000,
};

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
  };

  if (opts.edgeTypes.length > 0) {
    params.edge_types = opts.edgeTypes;
  }

  const result = await client.query<TraversalResponse<T>>("traverse", params);
  return result.data;
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
