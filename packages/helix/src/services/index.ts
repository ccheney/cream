/**
 * HelixDB Services
 *
 * Higher-level services that orchestrate graph operations.
 */

export {
  type CompanyData,
  CompanyGraphBuilder,
  type CompanyGraphBuildOptions,
  type CompanyGraphBuildResult,
  type CorrelationAnalysisOptions,
  type CorrelationPair,
  calculateCorrelation,
  calculateReturns,
  createCompanyGraphBuilder,
  getMarketCapBucket,
  type SupplyChainRelationship,
} from "./company-graph-builder.js";
export {
  createEventIngestionService,
  type EventIngestionOptions,
  type EventIngestionResult,
  EventIngestionService,
  type ExtractedEvent,
} from "./event-ingestion.js";
export {
  type CompanySensitivity,
  calculateRollingCorrelation,
  correlationToSensitivity,
  createMacroGraphBuilder,
  type EventMacroLink,
  getSectorDefaultSensitivities,
  type MacroCategory,
  MacroGraphBuilder,
  type MacroGraphBuildOptions,
  type MacroGraphBuildResult,
  PREDEFINED_MACRO_ENTITIES,
  type PredefinedMacroEntity,
  SECTOR_DEFAULT_SENSITIVITIES,
} from "./macro-graph-builder.js";
export {
  createNewsIngestionService,
  type NewsIngestionOptions,
  type NewsIngestionResult,
  NewsIngestionService,
  type NewsItemInput,
} from "./news-ingestion.js";
export {
  calculatePaperRelevanceScore,
  createPaperIngestionService,
  type PaperIngestionOptions,
  type PaperIngestionResult,
  PaperIngestionService,
  type PaperInput,
  SEED_PAPERS,
} from "./paper-ingestion.js";
export {
  createUniverseSyncer,
  instrumentsToCompanyData,
  type ResolvedInstrument,
  syncCompaniesToGraph,
  syncUniverseToGraph,
  type UniverseSyncOptions,
  type UniverseSyncResult,
} from "./universe-graph-sync.js";
