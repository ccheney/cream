/**
 * HelixDB Schema Enums and Type Aliases
 *
 * Common enumeration types used across the HelixDB schema.
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
// Research Hypothesis Enums
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
