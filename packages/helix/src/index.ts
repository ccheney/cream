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
} from "./client";
// Export/Import
export {
  createGraphDatabase,
  type ExportOptions,
  exportData,
  exportIncremental,
  exportToJson,
  type HelixExport,
  HelixGraphDatabase,
  type IGraphDatabase,
  type ImportOptions,
  type ImportResult,
  importData,
  importFromJson,
  type IncrementalExport,
  mergeExports,
  validateExport,
} from "./queries/export";

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
} from "./queries/graph";
// Mutations
export {
  type BatchMutationResult,
  batchCreateEdges,
  batchCreateLifecycleEvents,
  batchUpsertExternalEvents,
  batchUpsertTradeDecisions,
  createEdge,
  createHasEventEdge,
  createInfluencedDecisionEdge,
  createLifecycleEvent,
  type EdgeInput,
  type MutationResult,
  type NodeWithEmbedding,
  upsertExternalEvent,
  upsertTradeDecision,
} from "./queries/mutations";
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
} from "./queries/vector";

// Trade Memory Retrieval (GraphRAG)
export {
  calculateTradeStatistics,
  formatTradeMemorySummary,
  generateSituationBrief,
  type MarketSnapshot,
  retrieveTradeMemories,
  type TradeMemory,
  type TradeMemoryRetrievalOptions,
  type TradeMemoryRetrievalResult,
  type TradeStatistics,
} from "./queries/retrieval";

/**
 * Package version.
 */
export const HELIX_VERSION = "0.1.0";
