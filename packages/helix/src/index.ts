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
  HelixError,
  type HelixClient,
  type HelixClientConfig,
  type HelixErrorCode,
  type QueryResult,
} from "./client.js";

// Vector search
export {
  vectorSearch,
  searchSimilarDecisions,
  searchSimilarNews,
  searchSimilarFilings,
  searchSimilarTranscripts,
  type VectorSearchOptions,
  type VectorSearchResult,
  type VectorSearchResponse,
} from "./queries/vector.js";

// Graph traversal
export {
  getNode,
  getNodesByType,
  traverse,
  getNeighbors,
  getInfluencingEvents,
  getInfluencedDecisions,
  getLifecycleEvents,
  getCompanyNodes,
  type TraversalOptions,
  type GraphNode,
  type GraphEdge,
  type GraphPath,
  type TraversalResponse,
} from "./queries/graph.js";

// Export/Import
export {
  exportData,
  importData,
  exportToJson,
  importFromJson,
  type HelixExport,
  type ExportOptions,
  type ImportOptions,
  type ImportResult,
} from "./queries/export.js";

/**
 * Package version.
 */
export const HELIX_VERSION = "0.1.0";
