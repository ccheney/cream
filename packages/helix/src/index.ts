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
  type HealthCheckResult,
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
  type IncrementalExport,
  importData,
  importFromJson,
  mergeExports,
  validateExport,
} from "./queries/export";

// Graph traversal
export {
  type Citation,
  type CitationSourceType,
  // Scoring functions
  calculateEdgePriority,
  calculateHubPenalty,
  calculateRecencyBoost,
  // Constants
  EDGE_TYPE_THRESHOLDS,
  filterAndPrioritizeEdges,
  // Temporal traversal (point-in-time queries)
  filterEdgesByTime,
  type GraphEdge,
  type GraphNode,
  type GraphPath,
  getCompanyNodes,
  getDecisionCitations,
  getEdgeWeight,
  getInfluencedDecisions,
  getInfluencingEvents,
  getLifecycleEvents,
  getNeighbors,
  getNode,
  getNodesByType,
  isEdgeActiveAtTime,
  MENTION_TYPE_WEIGHTS,
  shouldFollowEdge,
  sortEdgesByPriority,
  type TemporalTraversalOptions,
  type TemporalTraversalResponse,
  type TraversalOptions,
  type TraversalResponse,
  traverse,
  traverseAtTime,
  // Weighted traversal
  type WeightedTraversalResponse,
  wasEdgeRecordedBy,
  weightedTraverse,
} from "./queries/graph";
// GraphRAG unified search
export {
  type CompanyResult,
  type ExternalEventResult,
  type FilingChunkResult,
  type GraphRAGSearchOptions,
  type GraphRAGSearchResult,
  type NewsItemResult,
  searchGraphContext,
  searchGraphContextByCompany,
  type TranscriptChunkResult,
} from "./queries/graphrag";
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
  createThesisIncludesEdge,
  type EdgeInput,
  type MutationResult,
  type NodeWithEmbedding,
  upsertExternalEvent,
  upsertTradeDecision,
} from "./queries/mutations";
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

// Services
export {
  type CompanyData,
  CompanyGraphBuilder,
  type CompanyGraphBuildOptions,
  type CompanyGraphBuildResult,
  type CompanySensitivity,
  type CorrelationAnalysisOptions,
  type CorrelationPair,
  calculateCorrelation,
  calculateHypothesisQualityScore,
  // Indicator Ingestion
  calculateIndicatorQualityScore,
  calculatePaperRelevanceScore,
  calculateReturns,
  calculateRollingCorrelation,
  correlationToSensitivity,
  createCompanyGraphBuilder,
  createEventIngestionService,
  createHypothesisIngestionService,
  createIndicatorIngestionService,
  createMacroGraphBuilder,
  createNewsIngestionService,
  createPaperIngestionService,
  createUniverseSyncer,
  DEFAULT_VALIDATION_THRESHOLDS,
  type EventIngestionOptions,
  type EventIngestionResult,
  EventIngestionService,
  type EventMacroLink,
  type ExtractedEvent,
  getMarketCapBucket,
  getSectorDefaultSensitivities,
  type HypothesisIngestionOptions,
  type HypothesisIngestionResult,
  HypothesisIngestionService,
  type HypothesisInput,
  type HypothesisUpdateInput,
  type IndicatorIngestionOptions,
  type IndicatorIngestionResult,
  IndicatorIngestionService,
  type IndicatorInput,
  type IndicatorUpdateInput,
  instrumentsToCompanyData,
  type MacroCategory,
  MacroGraphBuilder,
  type MacroGraphBuildOptions,
  type MacroGraphBuildResult,
  meetsValidationThresholds,
  type NewsIngestionOptions,
  type NewsIngestionResult,
  NewsIngestionService,
  type NewsItemInput,
  type PaperIngestionOptions,
  type PaperIngestionResult,
  PaperIngestionService,
  type PaperInput,
  PREDEFINED_MACRO_ENTITIES,
  type PredefinedMacroEntity,
  type ResolvedInstrument,
  SECTOR_DEFAULT_SENSITIVITIES,
  SEED_PAPERS,
  type SimilarHypothesis,
  type SimilarIndicator,
  type SupplyChainRelationship,
  syncCompaniesToGraph,
  syncUniverseToGraph,
  type UniverseSyncOptions,
  type UniverseSyncResult,
  type ValidationThresholds,
} from "./services";

/**
 * Package version.
 */
export const HELIX_VERSION = "0.1.0";
