/**
 * HelixDB Edge Type Definitions
 *
 * TypeScript interfaces for all edge/relationship types in the HelixDB schema.
 *
 * @see schema.hx for the canonical HelixQL definitions
 */

import type {
  DependencyType,
  DocumentType,
  Environment,
  MentionType,
  RelationshipType,
} from "./enums.js";

// ============================================
// Core Relationship Edges
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
 * INSPIRED_BY edge - hypothesis to hypothesis
 *
 * Tracks which hypotheses inspired a new hypothesis.
 */
export interface InspiredByEdge {
  source_id: string; // ResearchHypothesis.hypothesis_id (new)
  target_id: string; // ResearchHypothesis.hypothesis_id (inspiration)
  /** How the original hypothesis inspired the new one */
  relevance: string;
  /** Timestamp when link was created */
  created_at: string;
}

/**
 * CITES_PAPER edge - hypothesis to academic paper
 *
 * Tracks which academic papers were cited by a hypothesis.
 */
export interface CitesPaperEdge {
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
