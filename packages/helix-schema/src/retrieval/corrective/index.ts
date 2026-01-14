/**
 * Corrective Retrieval for Low-Quality Results
 *
 * Implements a self-correcting retrieval strategy that broadens the search
 * when initial retrieval quality is below threshold.
 *
 * ## How It Works
 *
 * 1. Initial retrieval returns results
 * 2. Quality assessment evaluates: avg score, result count, diversity
 * 3. If quality < threshold, trigger correction:
 *    a. Broaden candidate pool (increase k)
 *    b. Lower similarity threshold
 *    c. Optional: Query expansion
 * 4. Corrected results replace initial results
 *
 * ## Quality Metrics
 *
 * - **Average Score**: Mean similarity/relevance of top results
 * - **Result Count**: Number of results returned
 * - **Diversity**: Variance in scores (low = all results similar)
 * - **Coverage**: Fraction of expected results obtained
 *
 * ## When to Correct
 *
 * - Avg similarity < 0.5 (results not relevant enough)
 * - Result count < 3 (too few results)
 * - Diversity score < 0.1 (all results too similar - possible duplicates)
 *
 * @see docs/plans/04-memory-helixdb.md - Retrieval Policies (Corrective Retrieval)
 */

// Correction Strategies
export {
	calculateBroadenedK,
	calculateLoweredThreshold,
	generateExpansionTerms,
	selectCorrectionStrategy,
} from "./correction.js";

// Quality Assessment
export {
	assessRetrievalQuality,
	assessRRFQuality,
	calculateAvgScore,
	calculateCoverageScore,
	calculateDiversityScore,
	shouldCorrect,
	shouldCorrectRRF,
} from "./evaluation.js";
// Logging and Metrics
export { calculateCorrectionMetrics, createCorrectionLogEntry } from "./metrics.js";

// Core Retrieval Pipeline
export { correctiveRetrieval, withCorrectiveRetrieval } from "./retrieval.js";
// Types and Constants
export {
	type CorrectionAttempt,
	type CorrectionLogEntry,
	type CorrectionMetrics,
	type CorrectionStrategy,
	type CorrectionStrategyConfig,
	type CorrectiveRetrievalOptions,
	type CorrectiveRetrievalResult,
	DEFAULT_BROADENING_FACTOR,
	DEFAULT_DIVERSITY_THRESHOLD,
	DEFAULT_MIN_RESULTS,
	DEFAULT_QUALITY_THRESHOLD,
	DEFAULT_QUALITY_THRESHOLDS,
	MAX_CORRECTION_ATTEMPTS,
	type QualityAssessment,
	type QualityThresholds,
	type RetrievalFunction,
	THRESHOLD_REDUCTION_STEP,
} from "./types.js";
