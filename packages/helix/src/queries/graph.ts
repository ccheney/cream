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
