/**
 * Correction Strategy Functions
 *
 * Functions for calculating correction parameters and selecting strategies.
 */

import {
	type CorrectionStrategy,
	DEFAULT_BROADENING_FACTOR,
	DEFAULT_QUALITY_THRESHOLD,
	type QualityAssessment,
	THRESHOLD_REDUCTION_STEP,
} from "./types.js";

/**
 * Calculate broadened k value for expanded retrieval.
 *
 * @param initialK - Initial k value
 * @param factor - Broadening factor (default: 5)
 * @returns New k value
 */
export function calculateBroadenedK(
	initialK: number,
	factor: number = DEFAULT_BROADENING_FACTOR,
): number {
	return Math.ceil(initialK * factor);
}

/**
 * Calculate lowered threshold for more permissive retrieval.
 *
 * @param initialThreshold - Initial similarity threshold
 * @param reduction - Amount to reduce (default: 0.1)
 * @returns New threshold (minimum 0)
 */
export function calculateLoweredThreshold(
	initialThreshold: number,
	reduction: number = THRESHOLD_REDUCTION_STEP,
): number {
	return Math.max(0, initialThreshold - reduction);
}

/**
 * Generate expansion terms for query broadening.
 *
 * This is a simple implementation that splits the query into terms
 * and adds common synonyms. In production, this would use an LLM
 * or embedding-based expansion.
 *
 * @param query - Original query
 * @returns Expanded query terms
 */
export function generateExpansionTerms(query: string): string[] {
	const terms = query
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 2);
	return terms;
}

/**
 * Determine which correction strategy to use based on quality issues.
 *
 * @param quality - Quality assessment
 * @param attemptNumber - Current attempt number
 * @returns Recommended strategy
 */
export function selectCorrectionStrategy(
	quality: QualityAssessment,
	attemptNumber: number,
): CorrectionStrategy {
	// First attempt: broaden (fastest, most likely to help)
	if (attemptNumber === 1) {
		return "broaden";
	}

	// Second attempt: lower threshold (if avg score was the issue)
	if (attemptNumber === 2 && quality.avgScore < DEFAULT_QUALITY_THRESHOLD) {
		return "lower_threshold";
	}

	// Third attempt: broaden more aggressively
	return "broaden";
}
