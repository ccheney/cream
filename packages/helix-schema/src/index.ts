/**
 * HelixDB Schema Types
 *
 * TypeScript type definitions matching the HelixQL schema.
 * These types provide compile-time safety for node operations.
 *
 * @see schema.hx for the canonical HelixQL definitions
 */

// ============================================
// Enums and Type Aliases
// ============================================

export type {
  Action,
  DependencyType,
  DocumentType,
  Environment,
  ExternalEventType,
  FilingType,
  HypothesisStatus,
  IndicatorCategory,
  IndicatorStatus,
  InfluenceType,
  MacroFrequency,
  MarketCapBucket,
  MarketMechanism,
  MentionType,
  RelationshipType,
  TradeEventType,
} from "./enums.js";

// ============================================
// Node Types
// ============================================

export type {
  AcademicPaper,
  Company,
  ExternalEvent,
  FilingChunk,
  Indicator,
  MacroEntity,
  NewsItem,
  NodeType,
  NodeTypeName,
  ResearchHypothesis,
  TradeDecision,
  TradeLifecycleEvent,
  TranscriptChunk,
} from "./node-types.js";

export { EMBEDDED_FIELDS, NODE_TYPES } from "./node-types.js";

// ============================================
// Edge Types
// ============================================

export type {
  AffectedByEdge,
  DependsOnEdge,
  DerivedFromEdge,
  FiledByEdge,
  GeneratedFactorEdge,
  HasEventEdge,
  ImprovesOnEdge,
  InfluencedDecisionEdge,
  InspiredByEdge,
  MentionedInEdge,
  MentionsCompanyEdge,
  RelatedToEdge,
  RelatesToMacroEdge,
  SimilarToEdge,
  ThesisIncludesEdge,
  TranscriptForEdge,
  UsedInDecisionEdge,
} from "./edge-types.js";

// ============================================
// Case-Based Reasoning (CBR)
// ============================================

export type {
  CaseRetentionResult,
  CBRMarketSnapshot,
  CBRQualityMetrics,
  CBRRetrievalOptions,
  CBRRetrievalResult,
  SimilarityFeatures,
} from "./cbr.js";
export {
  buildMemoryContext,
  calculateCBRQuality,
  convertToRetrievedCase,
  extractSimilarityFeatures,
  generateCBRSituationBrief,
  retainCase,
  retrieveMemoryContext,
  retrieveSimilarCases,
  SIMILARITY_WEIGHTS,
  updateCaseOutcome,
} from "./cbr.js";

// ============================================
// Embedding Generation
// ============================================

export type {
  BatchEmbeddingOptions,
  BatchEmbeddingResult,
  BatchProgressCallback,
  EmbeddingConfig,
  EmbeddingMetadata,
  EmbeddingResult,
  RetryConfig,
} from "./embeddings.js";
export {
  batchEmbedWithProgress,
  createEmbeddingClient,
  createEmbeddingMetadata,
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RETRY_CONFIG,
  EMBEDDABLE_FIELDS,
  EMBEDDING_MODELS,
  EmbeddingClient,
  extractEmbeddableText,
  isEmbeddingStale,
  needsReembedding,
} from "./embeddings.js";

// ============================================
// HNSW Vector Index Configuration
// ============================================

export type {
  DistanceMetric as DistanceMetricType,
  HnswConfig,
  TuningProfile,
  TuningProfileName as TuningProfileNameType,
} from "./hnsw-config.js";
export {
  adjustEfSearchForRecall,
  DEFAULT_HNSW_CONFIG,
  DISTANCE_METRIC_NOTES,
  DistanceMetric,
  ENVIRONMENT_PROFILE_MAP,
  generateVectorIndexConfig,
  getConfigForEnvironment,
  getTuningProfile,
  HnswConfigSchema,
  listTuningProfiles,
  TUNING_PROFILES,
  TuningProfileName,
  TuningProfileSchema,
  validateHnswConfig,
} from "./hnsw-config.js";

// ============================================
// Hybrid Retrieval (RRF)
// ============================================

export type {
  CorrectionAttempt,
  CorrectionLogEntry,
  CorrectionMetrics,
  CorrectionStrategy,
  CorrectionStrategyConfig,
  CorrectiveRetrievalOptions,
  CorrectiveRetrievalResult,
  QualityAssessment,
  QualityThresholds,
  RankedResult,
  RetrievalFunction,
  RetrievalResult,
  RRFOptions,
  RRFResult,
} from "./retrieval/index.js";
export {
  assessRetrievalQuality,
  assessRRFQuality,
  assignRanks,
  calculateAvgScore,
  calculateBroadenedK,
  calculateCombinedRRFScore,
  calculateCorrectionMetrics,
  calculateCoverageScore,
  calculateDiversityScore,
  calculateLoweredThreshold,
  calculateMultiMethodBoost,
  calculateRRFScore,
  correctiveRetrieval,
  createCorrectionLogEntry,
  DEFAULT_BROADENING_FACTOR,
  DEFAULT_DIVERSITY_THRESHOLD,
  DEFAULT_MIN_RESULTS,
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_QUALITY_THRESHOLDS,
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  fuseMultipleWithRRF,
  fuseWithRRF,
  generateExpansionTerms,
  getMaxRRFScore,
  MAX_CORRECTION_ATTEMPTS,
  normalizeRRFScores,
  selectCorrectionStrategy,
  shouldCorrect,
  shouldCorrectRRF,
  THRESHOLD_REDUCTION_STEP,
  withCorrectiveRetrieval,
} from "./retrieval/index.js";

// ============================================
// Active Forgetting (Ebbinghaus Curve)
// ============================================

export type {
  AccessRecord,
  EdgeInfo,
  ForgettingDecision,
  ForgettingEnvironment as ForgettingEnvironmentType,
  ForgettingMetrics,
  ForgettingNodeType as ForgettingNodeTypeValue,
  GraphPruningAction,
  GraphPruningConfig,
  NodeConnectivity,
  NodeInfo,
  RetentionScoreBreakdown,
  TradeCohortSummary,
  TradeDecisionInfo,
} from "./retention/index.js";
export {
  batchGetForgettingDecisions,
  COMPLIANCE_PERIOD_DAYS,
  calculateForgettingMetrics,
  calculateFrequency,
  calculateImportance,
  calculateRecency,
  calculateRetentionScore,
  createTradeCohortSummary,
  DECAY_CONSTANT_DAYS,
  DEFAULT_PRUNING_CONFIG,
  DELETION_THRESHOLD,
  daysSinceLastAccess,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  evaluateSubgraphForMerge,
  ForgettingEnvironment,
  ForgettingNodeType,
  FREQUENCY_SCALE_FACTOR,
  filterForDeletion,
  filterForSummarization,
  findHubsTooPrune,
  findIsolatedNodes,
  formatMonthlyPeriod,
  formatQuarterlyPeriod,
  getForgettingDecision,
  groupDecisionsForSummarization,
  hasComplianceOverride,
  INFINITE_RETENTION,
  PNL_NORMALIZATION_FACTOR,
  pruneEdgesByWeight,
  recordAccess,
  SUMMARIZATION_THRESHOLD,
  shouldDelete,
  shouldSummarize,
} from "./retention/index.js";

// ============================================
// Query Timeout and Fallback Handling
// ============================================

export type {
  CacheEntry,
  ContradictionResult,
  FallbackStrategy,
  FreshnessInfo,
  QueryErrorType as QueryErrorTypeValue,
  QueryFunction,
  QueryMetrics,
  QueryOptions,
  QueryResult,
  QueryType as QueryTypeValue,
  QueryWrapperOptions,
  TimeoutConfig,
} from "./query/index.js";
export {
  classifyError,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_COMBINED_TIMEOUT_MS,
  DEFAULT_GRAPH_TIMEOUT_MS,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_VECTOR_TIMEOUT_MS,
  detectContradiction,
  executeWithFallback,
  getEmbeddingAgeHours,
  getTimeoutForQueryType,
  isRetryableError,
  MetricsCollector,
  QueryCache,
  QueryError,
  QueryErrorType,
  QueryType,
  QueryWrapper,
  resolveContradictions,
  STALE_EMBEDDING_THRESHOLD_MS,
  TIMEOUT_RATE_ALERT_THRESHOLD,
  validateFreshness,
  withTimeout,
} from "./query/index.js";

// ============================================
// Compliance and Audit Trail
// ============================================

export type {
  AuditLogEntry,
  AuditLoggerConfig,
  AuditStorage,
  AuditTrailQuery,
  ImmutabilityCheckResult,
  VersionHistoryEntry,
} from "./compliance/index.js";
export {
  AuditEntityType,
  AuditLogEntrySchema,
  AuditLogger,
  AuditOperationType,
  AuditRetentionPolicy,
  AuditTrailQuerySchema,
  checkImmutability,
  ImmutabilityViolationError,
  InMemoryAuditStorage,
  requireMutable,
  VersionHistoryEntrySchema,
} from "./compliance/index.js";

// ============================================
// Thesis Memory (Post-Hoc Analysis)
// ============================================

export type {
  ThesisCloseReason,
  ThesisMemory,
  ThesisMemoryInput,
  ThesisMemoryResult,
  ThesisMemoryRetrievalOptions,
  ThesisOutcome,
} from "./thesisMemory.js";
export {
  calculateHoldingPeriod,
  classifyOutcome,
  createThesisMemory,
  DEFAULT_RETRIEVAL_OPTIONS as DEFAULT_THESIS_RETRIEVAL_OPTIONS,
  generateEmbeddingText as generateThesisEmbeddingText,
  generateLessonsLearned,
  ingestThesisMemory,
  parseLessonsLearned,
  retrieveLosingTheses,
  retrieveSimilarTheses,
  retrieveWinningTheses,
  SCRATCH_THRESHOLD_PERCENT,
  summarizeThesisMemory,
} from "./thesisMemory.js";

// ============================================
// Temporal Edge Properties (Bi-Temporal Model)
// ============================================

export type {
  TemporalEdgeProperties,
  TemporalEdgeStats,
  TemporalQueryOptions,
} from "./temporal.js";
export {
  addTemporalPropertiesToEdge,
  calculateTemporalStats,
  createTemporalEdge,
  expireEdge,
  isEdgeActiveAt,
  matchesTemporalQuery,
  wasEdgeKnownAt,
} from "./temporal.js";
