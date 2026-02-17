/**
 * Core Corrective Retrieval Operations
 *
 * Main retrieval pipeline with automatic quality-based correction.
 */

import type { RetrievalResult as CoreRetrievalResult } from "../rrf.js";
import {
	calculateBroadenedK,
	calculateLoweredThreshold,
	generateExpansionTerms,
} from "./correction.js";
import { assessRetrievalQuality, shouldCorrect } from "./evaluation.js";
import {
	type CorrectionAttempt,
	type CorrectionStrategy,
	type CorrectiveRetrievalOptions,
	type CorrectiveRetrievalResult,
	DEFAULT_BROADENING_FACTOR,
	DEFAULT_QUALITY_THRESHOLDS,
	MAX_CORRECTION_ATTEMPTS,
	type QualityThresholds,
	type RetrievalFunction,
} from "./types.js";

type RetrievalParams = { k: number; minScore: number; query?: string };

type CorrectionState<T> = {
	results: CoreRetrievalResult<T>[];
	quality: ReturnType<typeof assessRetrievalQuality>;
	currentK: number;
	currentMinScore: number;
};

type CorrectionSettings = {
	thresholds: QualityThresholds;
	maxAttempts: number;
	broadeningFactor: number;
	strategies: CorrectionStrategy[];
};

type StrategyApplication = {
	params: RetrievalParams;
	attemptParams: Record<string, unknown>;
	nextK?: number;
	nextMinScore?: number;
};

function createCorrectionSettings(options: CorrectiveRetrievalOptions): CorrectionSettings {
	return {
		thresholds: {
			...DEFAULT_QUALITY_THRESHOLDS,
			...options.thresholds,
		},
		maxAttempts: options.maxAttempts ?? MAX_CORRECTION_ATTEMPTS,
		broadeningFactor: options.broadeningFactor ?? DEFAULT_BROADENING_FACTOR,
		strategies: options.strategies ?? ["broaden", "lower_threshold"],
	};
}

function selectStrategy(strategies: CorrectionStrategy[], attemptNum: number): CorrectionStrategy {
	const strategyIndex = Math.min(attemptNum - 1, strategies.length - 1);
	return strategies[strategyIndex] ?? "broaden";
}

function applyCorrectionStrategy(
	strategy: CorrectionStrategy,
	initialParams: RetrievalParams,
	state: Pick<CorrectionState<unknown>, "currentK" | "currentMinScore">,
	broadeningFactor: number,
): StrategyApplication {
	const attemptParams: Record<string, unknown> = {};
	if (strategy === "broaden") {
		const newK = calculateBroadenedK(state.currentK, broadeningFactor);
		attemptParams.previousK = state.currentK;
		attemptParams.newK = newK;
		return {
			params: { ...initialParams, k: newK },
			attemptParams,
			nextK: newK,
		};
	}
	if (strategy === "lower_threshold") {
		const newThreshold = calculateLoweredThreshold(state.currentMinScore);
		attemptParams.previousThreshold = state.currentMinScore;
		attemptParams.newThreshold = newThreshold;
		return {
			params: { ...initialParams, minScore: newThreshold },
			attemptParams,
			nextMinScore: newThreshold,
		};
	}
	if (!initialParams.query) {
		return { params: initialParams, attemptParams };
	}
	const expansionTerms = generateExpansionTerms(initialParams.query);
	attemptParams.expansionTerms = expansionTerms;
	return {
		params: { ...initialParams, query: `${initialParams.query} ${expansionTerms.join(" ")}` },
		attemptParams,
	};
}

function createAttempt<T>(
	attemptNum: number,
	strategy: CorrectionStrategy,
	attemptParams: Record<string, unknown>,
	results: CoreRetrievalResult<T>[],
	quality: ReturnType<typeof assessRetrievalQuality>,
): CorrectionAttempt<T> {
	return {
		attemptNumber: attemptNum,
		strategy,
		parameters: attemptParams,
		results,
		quality,
		succeeded: !shouldCorrect(quality),
	};
}

function updateStateFromAttempt<T>(
	state: CorrectionState<T>,
	application: StrategyApplication,
	correctedResults: CoreRetrievalResult<T>[],
	correctedQuality: ReturnType<typeof assessRetrievalQuality>,
): void {
	if (application.nextK !== undefined) {
		state.currentK = application.nextK;
	}
	if (application.nextMinScore !== undefined) {
		state.currentMinScore = application.nextMinScore;
	}
	if (
		!shouldCorrect(correctedQuality) ||
		correctedQuality.overallScore > state.quality.overallScore
	) {
		state.results = correctedResults;
		state.quality = correctedQuality;
	}
}

function buildEarlyReturn<T>(
	initialResults: CoreRetrievalResult<T>[],
	initialQuality: ReturnType<typeof assessRetrievalQuality>,
): CorrectiveRetrievalResult<T> {
	return {
		results: initialResults,
		correctionApplied: false,
		initialQuality,
		finalQuality: initialQuality,
		attempts: [],
	};
}

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
	const settings = createCorrectionSettings(options);
	const initialResults: CoreRetrievalResult<T>[] = await Promise.resolve(retrieveFn(initialParams));
	const initialQuality = assessRetrievalQuality(initialResults, settings.thresholds);
	if (!shouldCorrect(initialQuality)) {
		return buildEarlyReturn(initialResults, initialQuality);
	}

	const attempts: CorrectionAttempt<T>[] = [];
	const state: CorrectionState<T> = {
		results: initialResults,
		quality: initialQuality,
		currentK: initialParams.k,
		currentMinScore: initialParams.minScore,
	};

	for (let attemptNum = 1; attemptNum <= settings.maxAttempts; attemptNum++) {
		const strategy = selectStrategy(settings.strategies, attemptNum);
		const application = applyCorrectionStrategy(
			strategy,
			initialParams,
			state,
			settings.broadeningFactor,
		);
		const correctedResults: CoreRetrievalResult<T>[] = await Promise.resolve(
			retrieveFn(application.params),
		);
		const correctedQuality = assessRetrievalQuality(correctedResults, settings.thresholds);
		attempts.push(
			createAttempt(
				attemptNum,
				strategy,
				application.attemptParams,
				correctedResults,
				correctedQuality,
			),
		);
		updateStateFromAttempt(state, application, correctedResults, correctedQuality);
		if (!shouldCorrect(correctedQuality)) break;
	}

	return {
		results: state.results,
		correctionApplied: attempts.length > 0,
		initialQuality,
		finalQuality: state.quality,
		attempts,
		correctionTimeMs: Date.now() - startTime,
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
