import { describe, expect, test } from "bun:test";

import { createEmptyMemoryContext, getMostSimilarCase, hasMemoryContext } from "../memory-context";

describe("createEmptyMemoryContext", () => {
	test("returns empty context", () => {
		const context = createEmptyMemoryContext();
		expect(context.retrievedCases).toEqual([]);
		expect(context.caseStatistics).toBeUndefined();
	});
});

describe("hasMemoryContext", () => {
	test("returns false for empty context", () => {
		const context = createEmptyMemoryContext();
		expect(hasMemoryContext(context)).toBe(false);
	});

	test("returns true when cases present", () => {
		const context = {
			retrievedCases: [
				{
					caseId: "td_001",
					shortSummary: "Test",
					keyOutcomes: {
						result: "win" as const,
						return: 0.05,
						durationHours: 24,
					},
					asOfTimestamp: "2026-01-01T10:00:00Z",
				},
			],
		};
		expect(hasMemoryContext(context)).toBe(true);
	});
});

describe("getMostSimilarCase", () => {
	test("returns undefined for empty context", () => {
		const context = createEmptyMemoryContext();
		expect(getMostSimilarCase(context)).toBeUndefined();
	});

	test("returns case with highest similarity score", () => {
		const context = {
			retrievedCases: [
				{
					caseId: "td_001",
					shortSummary: "First",
					keyOutcomes: { result: "win" as const, return: 0.02, durationHours: 24 },
					asOfTimestamp: "2026-01-01T10:00:00Z",
					similarityScore: 0.7,
				},
				{
					caseId: "td_002",
					shortSummary: "Second",
					keyOutcomes: { result: "loss" as const, return: -0.03, durationHours: 48 },
					asOfTimestamp: "2026-01-02T10:00:00Z",
					similarityScore: 0.9,
				},
			],
		};

		const result = getMostSimilarCase(context);
		expect(result?.caseId).toBe("td_002");
	});

	test("returns first case when no similarity scores", () => {
		const context = {
			retrievedCases: [
				{
					caseId: "td_001",
					shortSummary: "First",
					keyOutcomes: { result: "win" as const, return: 0.02, durationHours: 24 },
					asOfTimestamp: "2026-01-01T10:00:00Z",
				},
				{
					caseId: "td_002",
					shortSummary: "Second",
					keyOutcomes: { result: "loss" as const, return: -0.03, durationHours: 48 },
					asOfTimestamp: "2026-01-02T10:00:00Z",
				},
			],
		};

		const result = getMostSimilarCase(context);
		expect(result?.caseId).toBe("td_001");
	});
});
