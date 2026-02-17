/**
 * Corrective Retrieval Quality and Correction Pipeline Tests
 */

import { describe, expect, it } from "bun:test";
import {
	assessRetrievalQuality,
	correctiveRetrieval,
	type RetrievalFunction,
} from "../src/retrieval/corrective";
import type { RetrievalResult } from "../src/retrieval/rrf";

// ============================================
// Test Helpers
// ============================================

function createResults(scores: number[]): RetrievalResult<{ id: string }>[] {
	return scores.map((score, i) => ({
		node: { id: `node-${i}` },
		nodeId: `node-${i}`,
		score,
	}));
}

// ============================================
// Quality Assessment Tests
// ============================================

describe("assessRetrievalQuality score and threshold checks", () => {
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
});

describe("assessRetrievalQuality coverage and edge cases", () => {
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

// ============================================
// Corrective Retrieval Pipeline Tests
// ============================================

describe("correctiveRetrieval base behavior", () => {
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
});

describe("correctiveRetrieval attempt control and strategy", () => {
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
			{ maxAttempts: 2 },
		);

		expect(result.attempts.length).toBe(2);
	});

	it("uses specified strategies in order", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]); // Always poor

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ strategies: ["lower_threshold", "broaden"], maxAttempts: 2 },
		);

		expect(result.attempts[0].strategy).toBe("lower_threshold");
		expect(result.attempts[1].strategy).toBe("broaden");
	});
});

describe("correctiveRetrieval quality and timing metadata", () => {
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
			{ maxAttempts: 2 },
		);

		// Should keep the better results from second attempt
		expect(result.finalQuality.avgScore).toBeCloseTo(0.4, 1);
	});

	it("records correction time", async () => {
		const retrieveFn: RetrievalFunction<{ id: string }> = () => createResults([0.1]);

		const result = await correctiveRetrieval(
			retrieveFn,
			{ k: 10, minScore: 0 },
			{ maxAttempts: 1 },
		);

		expect(result.correctionTimeMs).toBeDefined();
		expect(result.correctionTimeMs).toBeGreaterThanOrEqual(0);
	});
});
