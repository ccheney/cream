/**
 * HelixDB Integration Package
 *
 * Provides graph and vector database functionality for the Cream trading system.
 * HelixDB combines graph traversal and vector similarity search in a single store.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createHelixClient, vectorSearch, traverse } from "@cream/helix";
 *
 * // Create client
 * const client = createHelixClient({ port: 6969 });
 *
 * // Vector similarity search
 * const similar = await vectorSearch(client, embedding, {
 *   topK: 10,
 *   nodeType: "TradeDecision",
 * });
 *
 * // Graph traversal
 * const paths = await traverse(client, "decision-123", {
 *   maxDepth: 2,
 *   edgeTypes: ["INFLUENCED_DECISION"],
 * });
 *
 * // Export data for backup
 * const backup = await exportData(client);
 * ```
 *
 * @see docs/plans/04-memory-helixdb.md
 */

// Client
export {
  createHelixClient,
  createHelixClientFromEnv,
  type HelixClient,
  type HelixClientConfig,
  HelixError,
  type HelixErrorCode,
  type QueryResult,
} from "./client.js";
// Export/Import
export {
  type ExportOptions,
  exportData,
  exportToJson,
  type HelixExport,
  type ImportOptions,
  type ImportResult,
  importData,
  importFromJson,
} from "./queries/export.js";

// Graph traversal
export {
  type GraphEdge,
  type GraphNode,
  type GraphPath,
  getCompanyNodes,
  getInfluencedDecisions,
  getInfluencingEvents,
  getLifecycleEvents,
  getNeighbors,
  getNode,
  getNodesByType,
  type TraversalOptions,
  type TraversalResponse,
  traverse,
} from "./queries/graph.js";
// Vector search
export {
  searchSimilarDecisions,
  searchSimilarFilings,
  searchSimilarNews,
  searchSimilarTranscripts,
  type VectorSearchOptions,
  type VectorSearchResponse,
  type VectorSearchResult,
  vectorSearch,
} from "./queries/vector.js";

/**
 * Package version.
 */
export const HELIX_VERSION = "0.1.0";
