/**
 * Type Definitions for Corrective Retrieval
 *
 * All interfaces, types, and constants used across the corrective retrieval module.
 */

import type { RetrievalResult } from "../rrf.js";

// ============================================
// Constants
// ============================================

/** Default quality threshold for triggering correction */
export const DEFAULT_QUALITY_THRESHOLD = 0.5;

/** Minimum results before considering correction */
export const DEFAULT_MIN_RESULTS = 3;

/** Default diversity threshold (std dev of scores) */
export const DEFAULT_DIVERSITY_THRESHOLD = 0.1;

/** Default broadening factor (how much to increase k) */
export const DEFAULT_BROADENING_FACTOR = 5;

/** Maximum correction attempts before giving up */
export const MAX_CORRECTION_ATTEMPTS = 3;

/** Threshold reduction per attempt */
export const THRESHOLD_REDUCTION_STEP = 0.1;

// ============================================
// Quality Assessment Types
// ============================================

/** Quality assessment result for retrieval */
export interface QualityAssessment {
	/** Overall quality score (0-1) */
	overallScore: number;

	/** Average similarity/relevance score of results */
	avgScore: number;

	/** Number of results returned */
	resultCount: number;

	/** Diversity score (std dev of scores, higher = more diverse) */
	diversityScore: number;

	/** Coverage score (resultCount / expectedCount) */
	coverageScore: number;

	/** Whether correction is needed */
	needsCorrection: boolean;

	/** Reasons for needing correction */
	correctionReasons: string[];
}

/** Quality thresholds configuration */
export interface QualityThresholds {
	/** Minimum average score (default: 0.5) */
	minAvgScore: number;

	/** Minimum result count (default: 3) */
	minResultCount: number;

	/** Minimum diversity score (default: 0.1) */
	minDiversityScore: number;

	/** Minimum coverage score (default: 0.3) */
	minCoverageScore: number;

	/** Expected result count for coverage calculation (default: 10) */
	expectedResultCount: number;
}

/** Default quality thresholds */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
	minAvgScore: 0.5,
	minResultCount: 3,
	minDiversityScore: 0.1,
	minCoverageScore: 0.3,
	expectedResultCount: 10,
};

// ============================================
// Correction Strategy Types
// ============================================

/** Correction strategy type */
export type CorrectionStrategy = "broaden" | "lower_threshold" | "expand_query";

/** Correction strategy configuration */
export interface CorrectionStrategyConfig {
	/** Strategy type */
	strategy: CorrectionStrategy;

	/** Broadening factor (for "broaden" strategy) */
	broadeningFactor?: number;

	/** Threshold reduction amount (for "lower_threshold" strategy) */
	thresholdReduction?: number;

	/** Query expansion terms (for "expand_query" strategy) */
	expansionTerms?: string[];
}

// ============================================
// Correction Attempt Types
// ============================================

/** Correction attempt result */
export interface CorrectionAttempt<T> {
	/** Attempt number (1-based) */
	attemptNumber: number;

	/** Strategy used */
	strategy: CorrectionStrategy;

	/** Parameters used */
	parameters: Record<string, unknown>;

	/** Results from this attempt */
	results: RetrievalResult<T>[];

	/** Quality assessment of these results */
	quality: QualityAssessment;

	/** Whether this attempt succeeded (quality above threshold) */
	succeeded: boolean;
}

// ============================================
// Corrective Retrieval Result Types
// ============================================

/** Corrective retrieval result */
export interface CorrectiveRetrievalResult<T> {
	/** Final results (corrected if needed) */
	results: RetrievalResult<T>[];

	/** Whether correction was applied */
	correctionApplied: boolean;

	/** Initial quality assessment */
	initialQuality: QualityAssessment;

	/** Final quality assessment */
	finalQuality: QualityAssessment;

	/** Correction attempts (if any) */
	attempts: CorrectionAttempt<T>[];

	/** Total time spent in correction (ms) */
	correctionTimeMs?: number;
}

/** Corrective retrieval options */
export interface CorrectiveRetrievalOptions {
	/** Quality thresholds */
	thresholds?: Partial<QualityThresholds>;

	/** Maximum correction attempts (default: 3) */
	maxAttempts?: number;

	/** Strategies to try in order (default: ["broaden", "lower_threshold"]) */
	strategies?: CorrectionStrategy[];

	/** Broadening factor (default: 5) */
	broadeningFactor?: number;

	/** Whether to log correction attempts */
	enableLogging?: boolean;
}

/** Retrieval function signature for corrective wrapper */
export type RetrievalFunction<T> = (params: {
	k: number;
	minScore: number;
	query?: string;
}) => Promise<RetrievalResult<T>[]> | RetrievalResult<T>[];

// ============================================
// Logging Types
// ============================================

/** Correction log entry */
export interface CorrectionLogEntry {
	/** Timestamp */
	timestamp: Date;

	/** Query identifier (if available) */
	queryId?: string;

	/** Initial quality */
	initialQuality: QualityAssessment;

	/** Final quality */
	finalQuality: QualityAssessment;

	/** Correction attempts */
	attemptCount: number;

	/** Whether correction succeeded */
	succeeded: boolean;

	/** Total correction time (ms) */
	correctionTimeMs: number;
}

/** Correction metrics for monitoring */
export interface CorrectionMetrics {
	/** Total correction attempts */
	totalAttempts: number;

	/** Successful corrections */
	successfulCorrections: number;

	/** Failed corrections (still below threshold after max attempts) */
	failedCorrections: number;

	/** Average attempts per correction */
	avgAttemptsPerCorrection: number;

	/** Average improvement in quality score */
	avgQualityImprovement: number;

	/** Average correction time (ms) */
	avgCorrectionTimeMs: number;

	/** Strategy success rates */
	strategySuccessRates: Record<CorrectionStrategy, { attempts: number; successes: number }>;
}
