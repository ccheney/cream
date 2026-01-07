/**
 * HelixDB Schema Types
 *
 * TypeScript type definitions matching the HelixQL schema.
 * These types provide compile-time safety for node operations.
 *
 * @see schema.hx for the canonical HelixQL definitions
 */

// ============================================
// Common Enums
// ============================================

/**
 * Trading environment
 */
export type Environment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Trading action
 */
export type Action = "BUY" | "SELL" | "HOLD" | "INCREASE" | "REDUCE" | "NO_TRADE";

/**
 * Trade lifecycle event type
 */
export type TradeEventType = "FILL" | "PARTIAL_FILL" | "ADJUSTMENT" | "CLOSE";

/**
 * External event type
 */
export type ExternalEventType =
  | "EARNINGS"
  | "MACRO"
  | "NEWS"
  | "SENTIMENT_SPIKE"
  | "FED_MEETING"
  | "ECONOMIC_RELEASE";

/**
 * Filing type
 */
export type FilingType = "10-K" | "10-Q" | "8-K" | "DEF14A" | "S-1";

/**
 * Market cap bucket
 */
export type MarketCapBucket = "MEGA" | "LARGE" | "MID" | "SMALL" | "MICRO";

/**
 * Macro entity frequency
 */
export type MacroFrequency = "MONTHLY" | "QUARTERLY" | "WEEKLY" | "IRREGULAR";

/**
 * Company relationship type
 */
export type RelationshipType = "SECTOR_PEER" | "SUPPLY_CHAIN" | "COMPETITOR" | "CUSTOMER";

// ============================================
// Case-Based Reasoning (CBR)
// ============================================

export {
  buildMemoryContext,
  type CaseRetentionOptions,
  type CaseRetentionResult,
  type CBRMarketSnapshot,
  type CBRQualityMetrics,
  type CBRRetrievalOptions,
  type CBRRetrievalResult,
  calculateCBRQuality,
  convertToRetrievedCase,
  extractSimilarityFeatures,
  generateCBRSituationBrief,
  retainCase,
  retrieveMemoryContext,
  retrieveSimilarCases,
  SIMILARITY_WEIGHTS,
  type SimilarityFeatures,
  updateCaseOutcome,
} from "./cbr";

/**
 * Company dependency relationship type (for DEPENDS_ON edge)
 */
export type DependencyType = "SUPPLIER" | "CUSTOMER" | "PARTNER";

/**
 * Influence type for decision edges
 */
export type InfluenceType = "NEWS" | "SENTIMENT" | "FUNDAMENTAL" | "MACRO";

/**
 * Mention type for document references
 */
export type MentionType = "PRIMARY" | "SECONDARY" | "PEER_COMPARISON";

/**
 * Document type for MENTIONED_IN edge
 */
export type DocumentType = "FILING" | "TRANSCRIPT" | "NEWS";

// ============================================
// Indicator Synthesis Enums
// ============================================

/**
 * Technical indicator category
 */
export type IndicatorCategory = "momentum" | "trend" | "volatility" | "volume" | "custom";

/**
 * Indicator lifecycle status
 */
export type IndicatorStatus = "staging" | "paper" | "production" | "retired";

// ============================================
// Trading Memory Nodes
// ============================================

/**
 * TradeDecision node - stores trading decisions with context
 */
export interface TradeDecision {
  decision_id: string;
  cycle_id: string;
  instrument_id: string;
  underlying_symbol?: string;
  regime_label: string;
  action: Action;
  decision_json: string;
  rationale_text: string; // Embedded field
  snapshot_reference: string;
  realized_outcome?: string;
  created_at: string;
  closed_at?: string;
  environment: Environment;
}

/**
 * TradeLifecycleEvent node - events in a trade's lifecycle
 */
export interface TradeLifecycleEvent {
  event_id: string;
  decision_id: string;
  event_type: TradeEventType;
  timestamp: string;
  price: number;
  quantity: number;
  environment: Environment;
}

// ============================================
// External Event Nodes
// ============================================

/**
 * ExternalEvent node - discrete market events
 */
export interface ExternalEvent {
  event_id: string;
  event_type: ExternalEventType | string;
  event_time: string;
  payload: string;
  text_summary?: string; // Optionally embedded
  related_instrument_ids: string; // JSON array
}

// ============================================
// Document Nodes
// ============================================

/**
 * FilingChunk node - chunked SEC filings
 */
export interface FilingChunk {
  chunk_id: string;
  filing_id: string;
  company_symbol: string;
  filing_type: FilingType | string;
  filing_date: string;
  chunk_text: string; // Embedded field
  chunk_index: number;
}

/**
 * TranscriptChunk node - chunked earnings transcripts
 */
export interface TranscriptChunk {
  chunk_id: string;
  transcript_id: string;
  company_symbol: string;
  call_date: string;
  speaker: string;
  chunk_text: string; // Embedded field
  chunk_index: number;
}

/**
 * NewsItem node - news articles and press releases
 */
export interface NewsItem {
  item_id: string;
  headline: string; // Embedded field
  body_text: string; // Embedded field
  published_at: string;
  source: string;
  related_symbols: string; // JSON array
  sentiment_score: number;
}

// ============================================
// Domain Knowledge Nodes
// ============================================

/**
 * Company node - company metadata
 */
export interface Company {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  market_cap_bucket: MarketCapBucket;
}

/**
 * MacroEntity node - macroeconomic concepts
 */
export interface MacroEntity {
  entity_id: string;
  name: string;
  description: string;
  frequency: MacroFrequency;
}

// ============================================
// Indicator Synthesis Nodes
// ============================================

/**
 * Indicator node - synthesized technical indicators
 *
 * Stores metadata and embeddings for generated indicators,
 * enabling semantic similarity search and relationship tracking.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */
export interface Indicator {
  /** Unique identifier (matches Turso indicators.id) */
  indicator_id: string;
  /** Human-readable name (e.g., "RSI_Adaptive_14") */
  name: string;
  /** Indicator category */
  category: IndicatorCategory;
  /** Lifecycle status */
  status: IndicatorStatus;
  /** Economic hypothesis driving the indicator */
  hypothesis: string;
  /** Economic rationale for why this indicator should work */
  economic_rationale: string;
  /** Combined text for semantic embedding (hypothesis + economic_rationale) */
  embedding_text: string; // Embedded field
  /** Market regime label when indicator was generated */
  generated_in_regime?: string;
  /** Code hash for deduplication (SHA256) */
  code_hash?: string;
  /** AST signature for structural similarity */
  ast_signature?: string;
  /** Deflated Sharpe Ratio from validation */
  deflated_sharpe?: number;
  /** Probability of Backtest Overfitting */
  probability_of_overfit?: number;
  /** Information Coefficient */
  information_coefficient?: number;
  /** Generation timestamp (ISO 8601) */
  generated_at: string;
  /** Environment where indicator was generated */
  environment: Environment;
}

// ============================================
// Research Hypothesis Nodes
// ============================================

/**
 * Hypothesis status for the research pipeline
 */
export type HypothesisStatus = "pending" | "validated" | "rejected" | "implemented";

/**
 * Market mechanism type explaining why alpha exists
 */
export type MarketMechanism =
  | "BEHAVIORAL_BIAS"
  | "STRUCTURAL_CONSTRAINT"
  | "INFORMATION_ASYMMETRY"
  | "LIQUIDITY_PREMIUM"
  | "RISK_PREMIUM";

/**
 * ResearchHypothesis node - alpha factor hypotheses from the Idea Agent
 *
 * Stores structured hypotheses generated by the research pipeline.
 * Enables vector similarity search for finding similar past attempts.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 1: Idea Generation
 */
export interface ResearchHypothesis {
  /** Unique identifier (format: hyp-{timestamp}-{shortname}) */
  hypothesis_id: string;
  /** Human-readable title (3-5 words) */
  title: string;
  /** Economic rationale explaining WHY this alpha exists (embedded field) */
  economic_rationale: string;
  /** Market mechanism that creates the alpha */
  market_mechanism: MarketMechanism;
  /** Target market regime */
  target_regime: string;
  /** Current status in the pipeline */
  status: HypothesisStatus;
  /** Expected Information Coefficient (0.03-0.10) */
  expected_ic: number;
  /** Expected Sharpe ratio (1.0-2.5) */
  expected_sharpe: number;
  /** Testable conditions that would prove hypothesis wrong */
  falsification_criteria: string; // JSON array
  /** Required input features (max 8) */
  required_features: string; // JSON array
  /** Related academic papers and references */
  related_literature: string; // JSON array
  /** How this differs from existing factors */
  originality_justification: string;
  /** What triggered this hypothesis (REGIME_GAP, ALPHA_DECAY, etc.) */
  trigger_type: string;
  /** Suggestions for implementation */
  implementation_hints?: string;
  /** Lessons learned after validation/rejection */
  lessons_learned?: string;
  /** Actual IC achieved (after validation) */
  realized_ic?: number;
  /** Actual Sharpe achieved (after validation) */
  realized_sharpe?: number;
  /** Factor ID if hypothesis was implemented */
  factor_id?: string;
  /** Agent that generated the hypothesis */
  author: string;
  /** Creation timestamp (ISO 8601) */
  created_at: string;
  /** Validation completion timestamp */
  validated_at?: string;
  /** Environment */
  environment: Environment;
}

/**
 * AcademicPaper node - referenced academic papers
 */
export interface AcademicPaper {
  /** Unique identifier */
  paper_id: string;
  /** Paper title */
  title: string;
  /** Authors */
  authors: string;
  /** Abstract or summary (embedded field) */
  abstract: string;
  /** URL or DOI */
  url?: string;
  /** Publication year */
  publication_year?: number;
  /** How many hypotheses reference this paper */
  citation_count: number;
}

// ============================================
// Relationship Edges
// ============================================

/**
 * INFLUENCED_DECISION edge
 */
export interface InfluencedDecisionEdge {
  source_id: string; // ExternalEvent.event_id
  target_id: string; // TradeDecision.decision_id
  influence_score: number;
  influence_type: string;
}

/**
 * FILED_BY edge
 */
export interface FiledByEdge {
  source_id: string; // FilingChunk.chunk_id
  target_id: string; // Company.symbol
}

/**
 * TRANSCRIPT_FOR edge
 */
export interface TranscriptForEdge {
  source_id: string; // TranscriptChunk.chunk_id
  target_id: string; // Company.symbol
}

/**
 * MENTIONS_COMPANY edge
 */
export interface MentionsCompanyEdge {
  source_id: string; // NewsItem.item_id
  target_id: string; // Company.symbol
  sentiment?: number;
}

/**
 * RELATES_TO_MACRO edge
 */
export interface RelatesToMacroEdge {
  source_id: string; // ExternalEvent.event_id
  target_id: string; // MacroEntity.entity_id
}

/**
 * RELATED_TO edge (company relationships)
 */
export interface RelatedToEdge {
  source_id: string; // Company.symbol
  target_id: string; // Company.symbol
  relationship_type: RelationshipType;
}

/**
 * HAS_EVENT edge
 */
export interface HasEventEdge {
  source_id: string; // TradeDecision.decision_id
  target_id: string; // TradeLifecycleEvent.event_id
}

/**
 * THESIS_INCLUDES edge - links ThesisMemory to related TradeDecisions
 */
export interface ThesisIncludesEdge {
  source_id: string; // ThesisMemory.thesis_id
  target_id: string; // TradeDecision.decision_id
}

/**
 * DEPENDS_ON edge - company supply chain and partnership dependencies
 */
export interface DependsOnEdge {
  source_id: string; // Company.symbol (the company that depends)
  target_id: string; // Company.symbol (the company it depends on)
  relationship_type: DependencyType;
  strength: number; // [0.0, 1.0]
}

/**
 * AFFECTED_BY edge - company sensitivity to macro factors
 */
export interface AffectedByEdge {
  source_id: string; // Company.symbol
  target_id: string; // MacroEntity.entity_id
  sensitivity: number; // [0.0, 1.0] where 1.0 = highly sensitive
}

/**
 * MENTIONED_IN edge - company mentions in documents
 */
export interface MentionedInEdge {
  source_id: string; // Company.symbol
  target_id: string; // Document ID (chunk_id or item_id)
  document_type: DocumentType;
  mention_type: MentionType;
}

// ============================================
// Indicator Synthesis Edges
// ============================================

/**
 * SIMILAR_TO edge - similarity between indicators
 *
 * Connects indicators that are semantically or structurally similar,
 * used for deduplication and evolution tracking.
 */
export interface SimilarToEdge {
  source_id: string; // Indicator.indicator_id
  target_id: string; // Indicator.indicator_id
  /** Semantic similarity score from embedding distance (0.0 to 1.0) */
  similarity_score: number;
  /** AST structural similarity score (0.0 to 1.0) */
  ast_similarity?: number;
  /** Timestamp when similarity was computed */
  computed_at: string;
}

/**
 * USED_IN_DECISION edge - indicator usage in trade decisions
 *
 * Tracks which indicators contributed to trading decisions,
 * enabling attribution analysis and IC tracking.
 */
export interface UsedInDecisionEdge {
  source_id: string; // Indicator.indicator_id
  target_id: string; // TradeDecision.decision_id
  /** Signal value at decision time */
  signal_value: number;
  /** Whether the indicator signal aligned with decision outcome */
  contributed_to_outcome?: boolean;
  /** Weight given to this indicator in the decision */
  decision_weight?: number;
}

/**
 * DERIVED_FROM edge - indicator lineage tracking
 *
 * Tracks when one indicator is derived from or replaces another,
 * enabling evolution tracking and retirement analysis.
 */
export interface DerivedFromEdge {
  source_id: string; // Indicator.indicator_id (new indicator)
  target_id: string; // Indicator.indicator_id (parent indicator)
  /** Type of derivation */
  derivation_type: "EVOLVED" | "REPLACED" | "ENSEMBLE";
  /** Timestamp of derivation */
  derived_at: string;
}

// ============================================
// Research Hypothesis Edges
// ============================================

/**
 * INSPIRED_BY edge - hypothesis to academic paper
 *
 * Tracks which academic papers inspired a hypothesis.
 */
export interface InspiredByEdge {
  source_id: string; // ResearchHypothesis.hypothesis_id
  target_id: string; // AcademicPaper.paper_id
  /** How the paper supports the hypothesis */
  relevance: string;
  /** Timestamp when link was created */
  created_at: string;
}

/**
 * IMPROVES_ON edge - hypothesis to hypothesis
 *
 * Tracks when a new hypothesis builds upon or improves a previous one.
 */
export interface ImprovesOnEdge {
  source_id: string; // ResearchHypothesis.hypothesis_id (new)
  target_id: string; // ResearchHypothesis.hypothesis_id (previous)
  /** What improvement was made */
  improvement_type: "REFINEMENT" | "EXTENSION" | "CORRECTION" | "COMBINATION";
  /** Description of the improvement */
  improvement_description: string;
  /** Timestamp */
  created_at: string;
}

/**
 * GENERATED_FACTOR edge - hypothesis to factor
 *
 * Links a validated hypothesis to the factor it generated.
 */
export interface GeneratedFactorEdge {
  source_id: string; // ResearchHypothesis.hypothesis_id
  target_id: string; // Factor ID in Turso
  /** Validation timestamp */
  validated_at: string;
  /** Environment where validation occurred */
  environment: Environment;
}

// ============================================
// Node Type Union
// ============================================

// Import ThesisMemory type for node union
import type { ThesisMemory as ThesisMemoryNode } from "./thesisMemory";

/**
 * All node types
 */
export type NodeType =
  | TradeDecision
  | TradeLifecycleEvent
  | ExternalEvent
  | FilingChunk
  | TranscriptChunk
  | NewsItem
  | Company
  | MacroEntity
  | Indicator
  | ThesisMemoryNode
  | ResearchHypothesis
  | AcademicPaper;

/**
 * Node type names for runtime type checking
 */
export const NODE_TYPES = [
  "TradeDecision",
  "TradeLifecycleEvent",
  "ExternalEvent",
  "FilingChunk",
  "TranscriptChunk",
  "NewsItem",
  "Company",
  "MacroEntity",
  "Indicator",
  "ThesisMemory",
  "ResearchHypothesis",
  "AcademicPaper",
] as const;

export type NodeTypeName = (typeof NODE_TYPES)[number];

// ============================================
// Embedded Fields Registry
// ============================================

/**
 * Fields that are embedded for vector similarity search
 */
export const EMBEDDED_FIELDS: Record<NodeTypeName, string[]> = {
  TradeDecision: ["rationale_text"],
  TradeLifecycleEvent: [],
  ExternalEvent: ["text_summary"],
  FilingChunk: ["chunk_text"],
  TranscriptChunk: ["chunk_text"],
  NewsItem: ["headline", "body_text"],
  Company: [],
  MacroEntity: [],
  Indicator: ["embedding_text"],
  ThesisMemory: ["entry_thesis"],
  ResearchHypothesis: ["economic_rationale"],
  AcademicPaper: ["abstract"],
};

// ============================================
// Embedding Generation
// ============================================

export {
  type BatchEmbeddingOptions,
  type BatchEmbeddingResult,
  type BatchProgressCallback,
  batchEmbedWithProgress,
  createEmbeddingClient,
  createEmbeddingMetadata,
  // Configuration
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RETRY_CONFIG,
  // Helpers
  EMBEDDABLE_FIELDS,
  EMBEDDING_MODELS,
  // Client
  EmbeddingClient,
  type EmbeddingConfig,
  type EmbeddingMetadata,
  // Types
  type EmbeddingResult,
  extractEmbeddableText,
  isEmbeddingStale,
  needsReembedding,
  type RetryConfig,
} from "./embeddings";

// ============================================
// HNSW Vector Index Configuration
// ============================================

export {
  adjustEfSearchForRecall,
  // Defaults
  DEFAULT_HNSW_CONFIG,
  DISTANCE_METRIC_NOTES,
  // Schemas
  DistanceMetric,
  type DistanceMetric as DistanceMetricType,
  ENVIRONMENT_PROFILE_MAP,
  generateVectorIndexConfig,
  // Functions
  getConfigForEnvironment,
  getTuningProfile,
  type HnswConfig,
  HnswConfigSchema,
  listTuningProfiles,
  // Tuning profiles
  TUNING_PROFILES,
  type TuningProfile,
  TuningProfileName,
  type TuningProfileName as TuningProfileNameType,
  TuningProfileSchema,
  validateHnswConfig,
} from "./hnsw-config";

// ============================================
// Hybrid Retrieval (RRF)
// ============================================

export {
  assessRetrievalQuality,
  assessRRFQuality,
  assignRanks,
  type CorrectionAttempt,
  type CorrectionLogEntry,
  type CorrectionMetrics,
  type CorrectionStrategy,
  type CorrectionStrategyConfig,
  type CorrectiveRetrievalOptions,
  type CorrectiveRetrievalResult,
  calculateAvgScore,
  calculateBroadenedK,
  // Utilities
  calculateCombinedRRFScore,
  calculateCorrectionMetrics,
  calculateCoverageScore,
  calculateDiversityScore,
  calculateLoweredThreshold,
  calculateMultiMethodBoost,
  // Core functions
  calculateRRFScore,
  correctiveRetrieval,
  createCorrectionLogEntry,
  DEFAULT_BROADENING_FACTOR,
  DEFAULT_DIVERSITY_THRESHOLD,
  DEFAULT_MIN_RESULTS,
  // Corrective Retrieval
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_QUALITY_THRESHOLDS,
  // Constants
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  fuseMultipleWithRRF,
  fuseWithRRF,
  generateExpansionTerms,
  getMaxRRFScore,
  MAX_CORRECTION_ATTEMPTS,
  normalizeRRFScores,
  type QualityAssessment,
  type QualityThresholds,
  type RankedResult,
  type RetrievalFunction,
  // Types
  type RetrievalResult,
  type RRFOptions,
  type RRFResult,
  selectCorrectionStrategy,
  shouldCorrect,
  shouldCorrectRRF,
  THRESHOLD_REDUCTION_STEP,
  withCorrectiveRetrieval,
} from "./retrieval";

// ============================================
// Active Forgetting (Ebbinghaus Curve)
// ============================================

export {
  type AccessRecord,
  // Batch processing
  batchGetForgettingDecisions,
  COMPLIANCE_PERIOD_DAYS,
  // Metrics
  calculateForgettingMetrics,
  calculateFrequency,
  calculateImportance,
  // Core forgetting functions
  calculateRecency,
  calculateRetentionScore,
  // Trade cohort summarization
  createTradeCohortSummary,
  // Constants
  DECAY_CONSTANT_DAYS,
  DEFAULT_PRUNING_CONFIG,
  DELETION_THRESHOLD,
  daysSinceLastAccess,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  type EdgeInfo,
  evaluateSubgraphForMerge,
  type ForgettingDecision,
  // Types
  ForgettingEnvironment,
  type ForgettingEnvironment as ForgettingEnvironmentType,
  type ForgettingMetrics,
  ForgettingNodeType,
  type ForgettingNodeType as ForgettingNodeTypeValue,
  FREQUENCY_SCALE_FACTOR,
  filterForDeletion,
  filterForSummarization,
  findHubsTooPrune,
  findIsolatedNodes,
  formatMonthlyPeriod,
  formatQuarterlyPeriod,
  type GraphPruningAction,
  type GraphPruningConfig,
  getForgettingDecision,
  groupDecisionsForSummarization,
  hasComplianceOverride,
  INFINITE_RETENTION,
  type NodeConnectivity,
  type NodeInfo,
  PNL_NORMALIZATION_FACTOR,
  // Graph pruning
  pruneEdgesByWeight,
  type RetentionScoreBreakdown,
  // Access tracking
  recordAccess,
  SUMMARIZATION_THRESHOLD,
  shouldDelete,
  shouldSummarize,
  type TradeCohortSummary,
  type TradeDecisionInfo,
} from "./retention";

// ============================================
// Query Timeout and Fallback Handling
// ============================================

export {
  type CacheEntry,
  type ContradictionResult,
  classifyError,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_COMBINED_TIMEOUT_MS,
  DEFAULT_GRAPH_TIMEOUT_MS,
  DEFAULT_TIMEOUT_CONFIG,
  // Constants
  DEFAULT_VECTOR_TIMEOUT_MS,
  // Contradiction resolution
  detectContradiction,
  // Fallback strategies
  executeWithFallback,
  type FallbackStrategy,
  type FreshnessInfo,
  // Freshness validation (isEmbeddingStale and needsReembedding exported from embeddings)
  getEmbeddingAgeHours,
  // Timeout functions
  getTimeoutForQueryType,
  isRetryableError,
  // Metrics
  MetricsCollector,
  // Cache
  QueryCache,
  // Error handling
  QueryError,
  QueryErrorType,
  type QueryErrorType as QueryErrorTypeValue,
  type QueryFunction,
  type QueryMetrics,
  type QueryOptions,
  type QueryResult,
  // Types
  QueryType,
  type QueryType as QueryTypeValue,
  // High-level wrapper
  QueryWrapper,
  type QueryWrapperOptions,
  resolveContradictions,
  STALE_EMBEDDING_THRESHOLD_MS,
  TIMEOUT_RATE_ALERT_THRESHOLD,
  type TimeoutConfig,
  validateFreshness,
  withTimeout,
} from "./query";

// ============================================
// Compliance and Audit Trail
// ============================================

export {
  AuditEntityType,
  type AuditLogEntry,
  // Schemas
  AuditLogEntrySchema,
  // Audit Logger
  AuditLogger,
  type AuditLoggerConfig,
  // Enums
  AuditOperationType,
  // Retention
  AuditRetentionPolicy,
  type AuditStorage,
  type AuditTrailQuery,
  AuditTrailQuerySchema,
  // Immutability
  checkImmutability,
  type ImmutabilityCheckResult,
  ImmutabilityViolationError,
  // Storage implementations
  InMemoryAuditStorage,
  requireMutable,
  type VersionHistoryEntry,
  VersionHistoryEntrySchema,
} from "./compliance";

// ============================================
// Thesis Memory (Post-Hoc Analysis)
// ============================================

export {
  // Outcome classification
  calculateHoldingPeriod,
  classifyOutcome,
  // ThesisMemory creation
  createThesisMemory,
  // Retrieval options
  DEFAULT_RETRIEVAL_OPTIONS as DEFAULT_THESIS_RETRIEVAL_OPTIONS,
  // Embedding
  generateEmbeddingText as generateThesisEmbeddingText,
  // Post-hoc analysis
  generateLessonsLearned,
  // HelixDB operations
  ingestThesisMemory,
  // Utility
  parseLessonsLearned,
  // Convenience retrieval
  retrieveLosingTheses,
  // Retrieval
  retrieveSimilarTheses,
  retrieveWinningTheses,
  // Constants
  SCRATCH_THRESHOLD_PERCENT,
  summarizeThesisMemory,
  // Types
  type ThesisCloseReason,
  type ThesisMemory,
  type ThesisMemoryInput,
  type ThesisMemoryResult,
  type ThesisMemoryRetrievalOptions,
  type ThesisOutcome,
} from "./thesisMemory";
