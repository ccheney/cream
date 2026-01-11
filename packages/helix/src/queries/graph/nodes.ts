/**
 * Node Query Functions
 *
 * Functions for querying nodes in HelixDB.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import type { GraphNode } from "./types.js";

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
