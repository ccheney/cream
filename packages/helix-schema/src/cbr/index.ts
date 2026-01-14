/**
 * Case-Based Reasoning (CBR) Retrieval
 *
 * Implements the CBR cycle for trade memory retrieval:
 * - Retrieve: Find similar historical cases from HelixDB
 * - Reuse: Apply past decisions to current context
 * - Revise: Adjust based on differences
 * - Retain: Store new cases for future reference
 *
 * This module bridges the HelixDB trade memory retrieval with the
 * domain-level RetrievedCase and MemoryContext types.
 *
 * @see docs/plans/03-market-snapshot.md - memoryContext
 * @see docs/plans/04-memory-helixdb.md - Trade Memory Retrieval
 *
 * @module
 */

// Configuration
export { DEFAULT_CBR_OPTIONS, SIMILARITY_WEIGHTS } from "./config.js";
// Memory Context
export { buildMemoryContext, retrieveMemoryContext } from "./context.js";
// Type Conversion
export { convertToRetrievedCase, generateShortSummary } from "./conversion.js";
// Similarity Features
export { extractSimilarityFeatures } from "./features.js";
// Quality Metrics
export { calculateCBRQuality } from "./quality.js";
// Case Retention
export { retainCase, updateCaseOutcome } from "./retention.js";
// Core Retrieval
export { executeVectorSearch, retrieveSimilarCases } from "./retrieval.js";
// Situation Brief Generation
export { generateCBRSituationBrief } from "./situation-brief.js";
// Types
export type {
	CaseRetentionResult,
	CBRMarketSnapshot,
	CBRQualityMetrics,
	CBRRetrievalOptions,
	CBRRetrievalResult,
	HelixClient,
	QueryResult,
	SearchSimilarDecisionsResult,
	SimilarityFeatures,
} from "./types.js";
