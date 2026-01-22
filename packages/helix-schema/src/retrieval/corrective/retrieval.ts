/**
 * Core Corrective Retrieval Operations
 *
 * Main retrieval pipeline with automatic quality-based correction.
 */

import {
	calculateBroadenedK,
	calculateLoweredThreshold,
	generateExpansionTerms,
} from "./correction.js";
import { assessRetrievalQuality, shouldCorrect } from "./evaluation.js";
import {
	type CorrectionAttempt,
	type CorrectiveRetrievalOptions,
	type CorrectiveRetrievalResult,
	DEFAULT_BROADENING_FACTOR,
	DEFAULT_QUALITY_THRESHOLDS,
	MAX_CORRECTION_ATTEMPTS,
	type QualityThresholds,
	type RetrievalFunction,
} from "./types.js";

/**
 * Execute corrective retrieval with automatic quality-based correction.
 *
 * @param retrieveFn - The retrieval function to call
 * @param initialParams - Initial retrieval parameters
 * @param options - Corrective retrieval options
 * @returns Corrective retrieval result
 */
export async function correctiveRetrieval<T>(
	retrieveFn: RetrievalFunction<T>,
	initialParams: { k: number; minScore: number; query?: string },
	options: CorrectiveRetrievalOptions = {},
): Promise<CorrectiveRetrievalResult<T>> {
	const startTime = Date.now();

	const thresholds: QualityThresholds = {
		...DEFAULT_QUALITY_THRESHOLDS,
		...options.thresholds,
	};

	const maxAttempts = options.maxAttempts ?? MAX_CORRECTION_ATTEMPTS;
	const broadeningFactor = options.broadeningFactor ?? DEFAULT_BROADENING_FACTOR;
	const strategies = options.strategies ?? ["broaden", "lower_threshold"];

	// Initial retrieval
	const initialResults = await Promise.resolve(retrieveFn(initialParams));
	const initialQuality = assessRetrievalQuality(initialResults, thresholds);

	// If quality is acceptable, return early
	if (!shouldCorrect(initialQuality)) {
		return {
			results: initialResults,
			correctionApplied: false,
			initialQuality,
			finalQuality: initialQuality,
			attempts: [],
		};
	}

	// Correction loop
	const attempts: CorrectionAttempt<T>[] = [];
	let currentResults = initialResults;
	let currentQuality = initialQuality;
	let currentK = initialParams.k;
	let currentMinScore = initialParams.minScore;

	for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
		// Select strategy
		const strategyIndex = Math.min(attemptNum - 1, strategies.length - 1);
		const strategy = strategies[strategyIndex] || "broaden";

		// Apply strategy
		let params: { k: number; minScore: number; query?: string };
		const attemptParams: Record<string, unknown> = {};

		switch (strategy) {
			case "broaden": {
				const newK = calculateBroadenedK(currentK, broadeningFactor);
				attemptParams.previousK = currentK;
				attemptParams.newK = newK;
				currentK = newK;
				params = { ...initialParams, k: currentK };
				break;
			}
			case "lower_threshold": {
				const newThreshold = calculateLoweredThreshold(currentMinScore);
				attemptParams.previousThreshold = currentMinScore;
				attemptParams.newThreshold = newThreshold;
				currentMinScore = newThreshold;
				params = { ...initialParams, minScore: currentMinScore };
				break;
			}
			case "expand_query": {
				if (initialParams.query) {
					const expansionTerms = generateExpansionTerms(initialParams.query);
					attemptParams.expansionTerms = expansionTerms;
					params = {
						...initialParams,
						query: `${initialParams.query} ${expansionTerms.join(" ")}`,
					};
				} else {
					params = initialParams;
				}
				break;
			}
			default:
				params = initialParams;
		}

		// Execute corrected retrieval
		const correctedResults = await Promise.resolve(retrieveFn(params));
		const correctedQuality = assessRetrievalQuality(correctedResults, thresholds);

		const attempt: CorrectionAttempt<T> = {
			attemptNumber: attemptNum,
			strategy,
			parameters: attemptParams,
			results: correctedResults,
			quality: correctedQuality,
			succeeded: !shouldCorrect(correctedQuality),
		};

		attempts.push(attempt);

		// If quality is now acceptable, or this attempt is better, update current
		if (!shouldCorrect(correctedQuality)) {
			currentResults = correctedResults;
			currentQuality = correctedQuality;
			break;
		}

		// Keep better results even if still below threshold
		if (correctedQuality.overallScore > currentQuality.overallScore) {
			currentResults = correctedResults;
			currentQuality = correctedQuality;
		}
	}

	const correctionTimeMs = Date.now() - startTime;

	return {
		results: currentResults,
		correctionApplied: attempts.length > 0,
		initialQuality,
		finalQuality: currentQuality,
		attempts,
		correctionTimeMs,
	};
}

/**
 * Wrap a retrieval function with automatic corrective behavior.
 *
 * @param retrieveFn - The retrieval function to wrap
 * @param options - Corrective retrieval options
 * @returns Wrapped function with corrective behavior
 */
export function withCorrectiveRetrieval<T>(
	retrieveFn: RetrievalFunction<T>,
	options: CorrectiveRetrievalOptions = {},
): (params: {
	k: number;
	minScore: number;
	query?: string;
}) => Promise<CorrectiveRetrievalResult<T>> {
	return (params) => correctiveRetrieval(retrieveFn, params, options);
}
