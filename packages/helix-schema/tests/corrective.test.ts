/**
 * Corrective Retrieval Tests
 */

import { describe, expect, it } from "bun:test";
import {
	assessRetrievalQuality,
	// RRF integration
	assessRRFQuality,
	type CorrectionAttempt,
	type CorrectiveRetrievalResult,
	// Quality assessment
	calculateAvgScore,
	// Correction strategies
	calculateBroadenedK,
	// Logging and metrics
	calculateCorrectionMetrics,
	calculateCoverageScore,
	calculateDiversityScore,
	calculateLoweredThreshold,
	// Corrective retrieval pipeline
	correctiveRetrieval,
	createCorrectionLogEntry,
	DEFAULT_BROADENING_FACTOR,
	DEFAULT_DIVERSITY_THRESHOLD,
	DEFAULT_MIN_RESULTS,
	// Constants
	DEFAULT_QUALITY_THRESHOLD,
	DEFAULT_QUALITY_THRESHOLDS,
	generateExpansionTerms,
	MAX_CORRECTION_ATTEMPTS,
	// Types
	type QualityAssessment,
	type RetrievalFunction,
	selectCorrectionStrategy,
	shouldCorrect,
	shouldCorrectRRF,
	THRESHOLD_REDUCTION_STEP,
	withCorrectiveRetrieval,
} from "../src/retrieval/corrective";
import type { RetrievalResult, RRFResult } from "../src/retrieval/rrf";

// ============================================
// Test Helpers
// ============================================

function _createResult<T>(node: T, nodeId: string, score: number): RetrievalResult<T> {
	return { node, nodeId, score };
}

function createResults(scores: number[]): RetrievalResult<{ id: string }>[] {
	return scores.map((score, i) => ({
		node: { id: `node-${i}` },
		nodeId: `node-${i}`,
		score,
	}));
}

function createRRFResult<T>(node: T, nodeId: string, rrfScore: number): RRFResult<T> {
	return {
		node,
		nodeId,
		rrfScore,
		sources: ["vector"],
		ranks: { vector: 1 },
		originalScores: { vector: rrfScore },
	};
}

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
	it("DEFAULT_QUALITY_THRESHOLD is 0.5", () => {
		expect(DEFAULT_QUALITY_THRESHOLD).toBe(0.5);
	});

	it("DEFAULT_MIN_RESULTS is 3", () => {
		expect(DEFAULT_MIN_RESULTS).toBe(3);
	});

	it("DEFAULT_DIVERSITY_THRESHOLD is 0.1", () => {
		expect(DEFAULT_DIVERSITY_THRESHOLD).toBe(0.1);
	});

	it("DEFAULT_BROADENING_FACTOR is 5", () => {
		expect(DEFAULT_BROADENING_FACTOR).toBe(5);
	});

	it("MAX_CORRECTION_ATTEMPTS is 3", () => {
		expect(MAX_CORRECTION_ATTEMPTS).toBe(3);
	});

	it("THRESHOLD_REDUCTION_STEP is 0.1", () => {
		expect(THRESHOLD_REDUCTION_STEP).toBe(0.1);
	});

	it("DEFAULT_QUALITY_THRESHOLDS has correct values", () => {
		expect(DEFAULT_QUALITY_THRESHOLDS.minAvgScore).toBe(0.5);
		expect(DEFAULT_QUALITY_THRESHOLDS.minResultCount).toBe(3);
		expect(DEFAULT_QUALITY_THRESHOLDS.minDiversityScore).toBe(0.1);
		expect(DEFAULT_QUALITY_THRESHOLDS.minCoverageScore).toBe(0.3);
		expect(DEFAULT_QUALITY_THRESHOLDS.expectedResultCount).toBe(10);
	});
});

// ============================================
// Average Score Tests
// ============================================

describe("calculateAvgScore", () => {
	it("returns 0 for empty results", () => {
		expect(calculateAvgScore([])).toBe(0);
	});

	it("calculates average for single result", () => {
		const results = createResults([0.8]);
		expect(calculateAvgScore(results)).toBe(0.8);
	});

	it("calculates average for multiple results", () => {
		const results = createResults([0.9, 0.7, 0.5, 0.3]);
		expect(calculateAvgScore(results)).toBe(0.6);
	});

	it("handles scores of 0", () => {
		const results = createResults([0, 0, 0]);
		expect(calculateAvgScore(results)).toBe(0);
	});
});

// ============================================
// Diversity Score Tests
// ============================================

describe("calculateDiversityScore", () => {
	it("returns 0 for empty results", () => {
		expect(calculateDiversityScore([])).toBe(0);
	});

	it("returns 0 for single result", () => {
		const results = createResults([0.8]);
		expect(calculateDiversityScore(results)).toBe(0);
	});

	it("returns 0 for identical scores", () => {
		const results = createResults([0.5, 0.5, 0.5, 0.5]);
		expect(calculateDiversityScore(results)).toBe(0);
	});

	it("calculates diversity for varied scores", () => {
		const results = createResults([0.9, 0.7, 0.5, 0.3]);
		const diversity = calculateDiversityScore(results);
		expect(diversity).toBeGreaterThan(0);
		expect(diversity).toBeCloseTo(0.224, 2); // std dev of [0.9, 0.7, 0.5, 0.3]
	});

	it("higher variance = higher diversity", () => {
		const lowVariance = createResults([0.5, 0.5, 0.5, 0.6]);
		const highVariance = createResults([0.1, 0.3, 0.7, 0.9]);

		expect(calculateDiversityScore(highVariance)).toBeGreaterThan(
			calculateDiversityScore(lowVariance)
		);
	});
});

// ============================================
// Coverage Score Tests
// ============================================

describe("calculateCoverageScore", () => {
	it("returns 1 for full coverage", () => {
		expect(calculateCoverageScore(10, 10)).toBe(1);
	});

	it("returns fraction for partial coverage", () => {
		expect(calculateCoverageScore(5, 10)).toBe(0.5);
	});

	it("caps at 1 for over-coverage", () => {
		expect(calculateCoverageScore(15, 10)).toBe(1);
	});

	it("returns 1 for expected count of 0", () => {
		expect(calculateCoverageScore(5, 0)).toBe(1);
	});

	it("returns 0 for no results", () => {
		expect(calculateCoverageScore(0, 10)).toBe(0);
	});
});

// ============================================
// Quality Assessment Tests
// ============================================

describe("assessRetrievalQuality", () => {
	it("returns high quality for good results", () => {
		const results = createResults([0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45]);

		const quality = assessRetrievalQuality(results);

		expect(quality.avgScore).toBeCloseTo(0.675, 2);
		expect(quality.resultCount).toBe(10);
		expect(quality.diversityScore).toBeGreaterThan(0);
		expect(quality.coverageScore).toBe(1);
		expect(quality.needsCorrection).toBe(false);
		expect(quality.correctionReasons).toHaveLength(0);
	});

	it("flags low average score", () => {
		const results = createResults([0.3, 0.2, 0.1]);

		const quality = assessRetrievalQuality(results);

		expect(quality.needsCorrection).toBe(true);
		expect(quality.correctionReasons.some((r) => r.includes("Average score"))).toBe(true);
	});

	it("flags too few results", () => {
		const results = createResults([0.8, 0.7]);

		const quality = assessRetrievalQuality(results);

		expect(quality.needsCorrection).toBe(true);
		expect(quality.correctionReasons.some((r) => r.includes("Result count"))).toBe(true);
	});

	it("flags low diversity", () => {
		const results = createResults([0.5, 0.5, 0.5, 0.5, 0.5]);

		const quality = assessRetrievalQuality(results);

		expect(quality.diversityScore).toBe(0);
		expect(quality.needsCorrection).toBe(true);
		expect(quality.correctionReasons.some((r) => r.includes("Diversity"))).toBe(true);
	});

	it("flags low coverage", () => {
		const results = createResults([0.8]); // 1/10 = 0.1 coverage

		const quality = assessRetrievalQuality(results);

		expect(quality.coverageScore).toBe(0.1);
		expect(quality.needsCorrection).toBe(true);
		expect(quality.correctionReasons.some((r) => r.includes("Coverage"))).toBe(true);
	});

	it("accepts custom thresholds", () => {
		const results = createResults([0.4]); // Would fail with default thresholds

		const quality = assessRetrievalQuality(results, {
			minAvgScore: 0.3,
			minResultCount: 1,
			minDiversityScore: 0,
			minCoverageScore: 0.1,
			expectedResultCount: 10,
		});

		expect(quality.needsCorrection).toBe(false);
	});

	it("handles empty results", () => {
		const quality = assessRetrievalQuality([]);

		expect(quality.avgScore).toBe(0);
		expect(quality.resultCount).toBe(0);
		expect(quality.needsCorrection).toBe(true);
	});
});

describe("shouldCorrect", () => {
	it("returns true when needsCorrection is true", () => {
		const quality: QualityAssessment = {
			overallScore: 0.3,
			avgScore: 0.3,
			resultCount: 2,
			diversityScore: 0.1,
			coverageScore: 0.2,
			needsCorrection: true,
			correctionReasons: ["Low score"],
		};

		expect(shouldCorrect(quality)).toBe(true);
	});

	it("returns false when needsCorrection is false", () => {
		const quality: QualityAssessment = {
			overallScore: 0.8,
			avgScore: 0.8,
			resultCount: 10,
			diversityScore: 0.2,
			coverageScore: 1,
			needsCorrection: false,
			correctionReasons: [],
		};

		expect(shouldCorrect(quality)).toBe(false);
	});
});

// ============================================
// Correction Strategy Tests
// ============================================

describe("calculateBroadenedK", () => {
	it("multiplies k by broadening factor", () => {
		expect(calculateBroadenedK(10, 5)).toBe(50);
	});

	it("uses default factor of 5", () => {
		expect(calculateBroadenedK(10)).toBe(50);
	});

	it("rounds up to nearest integer", () => {
		expect(calculateBroadenedK(3, 2.5)).toBe(8);
	});
});

describe("calculateLoweredThreshold", () => {
	it("reduces threshold by reduction amount", () => {
		expect(calculateLoweredThreshold(0.5, 0.1)).toBe(0.4);
	});

	it("uses default reduction of 0.1", () => {
		expect(calculateLoweredThreshold(0.5)).toBe(0.4);
	});

	it("clamps at 0", () => {
		expect(calculateLoweredThreshold(0.05, 0.1)).toBe(0);
		expect(calculateLoweredThreshold(0.0, 0.1)).toBe(0);
	});
});

describe("generateExpansionTerms", () => {
	it("returns terms from query", () => {
		const terms = generateExpansionTerms("earnings report analysis");
		expect(terms).toContain("earnings");
		expect(terms).toContain("report");
		expect(terms).toContain("analysis");
	});

	it("filters short terms", () => {
		const terms = generateExpansionTerms("a an to stock price");
		expect(terms).not.toContain("a");
		expect(terms).not.toContain("an");
		expect(terms).not.toContain("to");
		expect(terms).toContain("stock");
		expect(terms).toContain("price");
	});

	it("handles empty query", () => {
		const terms = generateExpansionTerms("");
		expect(terms).toHaveLength(0);
	});
});

describe("selectCorrectionStrategy", () => {
	const lowQuality: QualityAssessment = {
		overallScore: 0.3,
		avgScore: 0.3,
		resultCount: 2,
		diversityScore: 0.1,
		coverageScore: 0.2,
		needsCorrection: true,
		correctionReasons: ["Low score"],
	};

	it("selects broaden for first attempt", () => {
		expect(selectCorrectionStrategy(lowQuality, 1)).toBe("broaden");
	});

	it("selects lower_threshold for second attempt if avg score low", () => {
		expect(selectCorrectionStrategy(lowQuality, 2)).toBe("lower_threshold");
	});

	it("selects broaden for third attempt", () => {
		expect(selectCorrectionStrategy(lowQuality, 3)).toBe("broaden");
	});
});

// ============================================
// Corrective Retrieval Pipeline Tests
// ============================================

describe("correctiveRetrieval", () => {
	it("returns early if initial quality is good", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () =>
			createResults([0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);

		const result = await correctiveRetrieval(retrieveFn, { k: 10, minScore: 0 });

		expect(result.correctionApplied).toBe(false);
		expect(result.attempts).toHaveLength(0);
		expect(result.results.length).toBe(10);
	});

	it("applies correction when quality is low", async () => {
		let callCount = 0;
		const retrieveFn: RetrievalFunction<{ id: string }> = () => {
			callCount++;
			// First call returns poor results, subsequent calls return good results
			if (callCount === 1) {
				return createResults([0.2, 0.1]);
			}
			return createResults([0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
		};

		const result = await correctiveRetrieval(retrieveFn, { k: 10, minScore: 0 });

		expect(result.correctionApplied).toBe(true);
		expect(result.attempts.length).toBeGreaterThan(0);
		expect(result.finalQuality.needsCorrection).toBe(false);
	});

	it("tracks multiple correction attempts", async () => {
		let callCount = 0;
		const retrieveFn: RetrievalFunction<{ id: string }> = () => {
			callCount++;
			// Gradually improve results
			if (callCount < 3) {
				return createResults([0.3, 0.2]);
			}
			return createResults([0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
		};

		const result = await correctiveRetrieval(retrieveFn, { k: 10, minScore: 0 });

		expect(result.attempts.length).toBeGreaterThan(1);
	});

	it("respects maxAttempts option", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]); // Always returns poor results

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ maxAttempts: 2 }
		);

		expect(result.attempts.length).toBe(2);
	});

	it("uses specified strategies in order", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]); // Always poor

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ strategies: ["lower_threshold", "broaden"], maxAttempts: 2 }
		);

		expect(result.attempts[0].strategy).toBe("lower_threshold");
		expect(result.attempts[1].strategy).toBe("broaden");
	});

	it("keeps best results even if still below threshold", async () => {
		let callCount = 0;
		const retrieveFn: RetrievalFunction<{ id: string }> = () => {
			callCount++;
			// Second call is better but still below threshold
			if (callCount === 1) {
				return createResults([0.1]);
			}
			return createResults([0.4, 0.4, 0.4]); // Better but still low
		};

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ maxAttempts: 2 }
		);

		// Should keep the better results from second attempt
		expect(result.finalQuality.avgScore).toBeCloseTo(0.4, 1);
	});

	it("records correction time", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]);

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ maxAttempts: 1 }
		);

		expect(result.correctionTimeMs).toBeDefined();
		expect(result.correctionTimeMs).toBeGreaterThanOrEqual(0);
	});
});

describe("withCorrectiveRetrieval", () => {
	it("creates wrapped function with corrective behavior", async () => {
		const baseFn: RetrievalFunction<{ id: string }> = () =>
			createResults([0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);

		const wrappedFn = withCorrectiveRetrieval(baseFn);
		const result = await wrappedFn({ k: 10, minScore: 0 });

		expect(result.correctionApplied).toBe(false);
		expect(result.results.length).toBe(10);
	});

	it("applies options to wrapped function", async () => {
		const baseFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]);

		const wrappedFn = withCorrectiveRetrieval(baseFn, { maxAttempts: 1 });
		const result = await wrappedFn({ k: 10, minScore: 0 });

		expect(result.attempts.length).toBe(1);
	});
});

// ============================================
// RRF Integration Tests
// ============================================

describe("assessRRFQuality", () => {
	it("assesses RRF results quality", () => {
		const results: RRFResult<{ id: string }>[] = [
			createRRFResult({ id: "1" }, "1", 0.9),
			createRRFResult({ id: "2" }, "2", 0.8),
			createRRFResult({ id: "3" }, "3", 0.7),
			createRRFResult({ id: "4" }, "4", 0.6),
			createRRFResult({ id: "5" }, "5", 0.5),
		];

		const quality = assessRRFQuality(results);

		expect(quality.avgScore).toBeCloseTo(0.7, 5);
		expect(quality.resultCount).toBe(5);
	});
});

describe("shouldCorrectRRF", () => {
	it("returns true for low-quality RRF results", () => {
		const results: RRFResult<{ id: string }>[] = [createRRFResult({ id: "1" }, "1", 0.2)];

		expect(shouldCorrectRRF(results)).toBe(true);
	});

	it("returns false for high-quality RRF results", () => {
		const results: RRFResult<{ id: string }>[] = Array.from({ length: 10 }, (_, i) =>
			createRRFResult({ id: `${i}` }, `${i}`, 0.9 - i * 0.05)
		);

		expect(shouldCorrectRRF(results)).toBe(false);
	});
});

// ============================================
// Metrics Tests
// ============================================

describe("calculateCorrectionMetrics", () => {
	it("handles empty entries", () => {
		const metrics = calculateCorrectionMetrics([]);

		expect(metrics.totalAttempts).toBe(0);
		expect(metrics.successfulCorrections).toBe(0);
		expect(metrics.failedCorrections).toBe(0);
		expect(metrics.avgQualityImprovement).toBe(0);
	});

	it("calculates metrics from entries", () => {
		const entries = [
			{
				timestamp: new Date(),
				initialQuality: { overallScore: 0.3 } as QualityAssessment,
				finalQuality: { overallScore: 0.8 } as QualityAssessment,
				attemptCount: 2,
				succeeded: true,
				correctionTimeMs: 100,
			},
			{
				timestamp: new Date(),
				initialQuality: { overallScore: 0.2 } as QualityAssessment,
				finalQuality: { overallScore: 0.4 } as QualityAssessment,
				attemptCount: 3,
				succeeded: false,
				correctionTimeMs: 150,
			},
		];

		const metrics = calculateCorrectionMetrics(entries);

		expect(metrics.totalAttempts).toBe(5);
		expect(metrics.successfulCorrections).toBe(1);
		expect(metrics.failedCorrections).toBe(1);
		expect(metrics.avgAttemptsPerCorrection).toBe(2.5);
		expect(metrics.avgQualityImprovement).toBe(0.35); // (0.5 + 0.2) / 2
		expect(metrics.avgCorrectionTimeMs).toBe(125);
	});
});

describe("createCorrectionLogEntry", () => {
	it("creates log entry from result", () => {
		const result: CorrectiveRetrievalResult<unknown> = {
			results: [],
			correctionApplied: true,
			initialQuality: {
				overallScore: 0.3,
				avgScore: 0.3,
				resultCount: 2,
				diversityScore: 0.1,
				coverageScore: 0.2,
				needsCorrection: true,
				correctionReasons: ["Low score"],
			},
			finalQuality: {
				overallScore: 0.8,
				avgScore: 0.8,
				resultCount: 10,
				diversityScore: 0.2,
				coverageScore: 1,
				needsCorrection: false,
				correctionReasons: [],
			},
			attempts: [{} as CorrectionAttempt<unknown>, {} as CorrectionAttempt<unknown>],
			correctionTimeMs: 100,
		};

		const entry = createCorrectionLogEntry(result, "query-123");

		expect(entry.queryId).toBe("query-123");
		expect(entry.attemptCount).toBe(2);
		expect(entry.succeeded).toBe(true);
		expect(entry.correctionTimeMs).toBe(100);
		expect(entry.timestamp).toBeInstanceOf(Date);
	});
});
