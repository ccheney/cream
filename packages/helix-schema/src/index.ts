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

// ============================================
// Node Type Union
// ============================================

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
  | MacroEntity;

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
};

// ============================================
// Embedding Generation
// ============================================

export {
  // Configuration
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RETRY_CONFIG,
  EMBEDDING_MODELS,
  type EmbeddingConfig,
  type RetryConfig,
  // Client
  EmbeddingClient,
  createEmbeddingClient,
  // Types
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingMetadata,
  type BatchEmbeddingOptions,
  type BatchProgressCallback,
  // Helpers
  EMBEDDABLE_FIELDS,
  extractEmbeddableText,
  isEmbeddingStale,
  createEmbeddingMetadata,
  needsReembedding,
  batchEmbedWithProgress,
} from "./embeddings";

// ============================================
// HNSW Vector Index Configuration
// ============================================

export {
  // Schemas
  DistanceMetric,
  type DistanceMetric as DistanceMetricType,
  HnswConfigSchema,
  type HnswConfig,
  TuningProfileName,
  type TuningProfileName as TuningProfileNameType,
  TuningProfileSchema,
  type TuningProfile,
  // Defaults
  DEFAULT_HNSW_CONFIG,
  DISTANCE_METRIC_NOTES,
  // Tuning profiles
  TUNING_PROFILES,
  ENVIRONMENT_PROFILE_MAP,
  // Functions
  getConfigForEnvironment,
  getTuningProfile,
  listTuningProfiles,
  validateHnswConfig,
  adjustEfSearchForRecall,
  generateVectorIndexConfig,
} from "./hnsw-config";

// ============================================
// Hybrid Retrieval (RRF)
// ============================================

export {
  // Types
  type RetrievalResult,
  type RankedResult,
  type RRFResult,
  type RRFOptions,
  // Constants
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  // Core functions
  calculateRRFScore,
  assignRanks,
  fuseWithRRF,
  fuseMultipleWithRRF,
  // Utilities
  calculateCombinedRRFScore,
  getMaxRRFScore,
  normalizeRRFScores,
  calculateMultiMethodBoost,
} from "./retrieval";
