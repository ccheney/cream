import { describe, expect, test } from "bun:test";

import {
	CaseResult,
	CaseStatisticsSchema,
	KeyOutcomesSchema,
	MemoryContextSchema,
	RetrievedCaseSchema,
} from "../memory-context";

describe("CaseResult", () => {
	test("accepts valid case results", () => {
		expect(() => CaseResult.parse("win")).not.toThrow();
		expect(() => CaseResult.parse("loss")).not.toThrow();
		expect(() => CaseResult.parse("breakeven")).not.toThrow();
		expect(() => CaseResult.parse("stopped_out")).not.toThrow();
		expect(() => CaseResult.parse("expired")).not.toThrow();
	});

	test("rejects invalid results", () => {
		expect(() => CaseResult.parse("profit")).toThrow();
		expect(() => CaseResult.parse("draw")).toThrow();
	});
});

describe("KeyOutcomesSchema", () => {
	const validOutcome = {
		result: "win" as const,
		return: 0.032,
		durationHours: 72,
	};

	test("accepts valid outcomes", () => {
		const result = KeyOutcomesSchema.safeParse(validOutcome);
		expect(result.success).toBe(true);
	});

	test("accepts negative returns for losses", () => {
		const result = KeyOutcomesSchema.safeParse({
			result: "loss",
			return: -0.05,
			durationHours: 24,
		});
		expect(result.success).toBe(true);
	});

	test("accepts optional MAE/MFE", () => {
		const result = KeyOutcomesSchema.parse({
			...validOutcome,
			mae: -0.02,
			mfe: 0.05,
		});
		expect(result.mae).toBe(-0.02);
		expect(result.mfe).toBe(0.05);
	});

	test("rejects negative duration", () => {
		const result = KeyOutcomesSchema.safeParse({
			...validOutcome,
			durationHours: -1,
		});
		expect(result.success).toBe(false);
	});

	test("requires result field", () => {
		const result = KeyOutcomesSchema.safeParse({
			return: 0.032,
			durationHours: 72,
		});
		expect(result.success).toBe(false);
	});
});

describe("RetrievedCaseSchema", () => {
	const validCase = {
		caseId: "td_0182",
		shortSummary: "Long AAPL during BULL_TREND after product announcement",
		keyOutcomes: {
			result: "win" as const,
			return: 0.032,
			durationHours: 72,
		},
		asOfTimestamp: "2025-09-15T15:00:00Z",
	};

	test("accepts valid case", () => {
		const result = RetrievedCaseSchema.safeParse(validCase);
		expect(result.success).toBe(true);
	});

	test("accepts optional fields", () => {
		const result = RetrievedCaseSchema.parse({
			...validCase,
			ticker: "AAPL",
			regime: "BULL_TREND",
			similarityScore: 0.85,
		});
		expect(result.ticker).toBe("AAPL");
		expect(result.regime).toBe("BULL_TREND");
		expect(result.similarityScore).toBe(0.85);
	});

	test("requires caseId", () => {
		const { caseId: _, ...invalid } = validCase;
		const result = RetrievedCaseSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});

	test("requires non-empty shortSummary", () => {
		const result = RetrievedCaseSchema.safeParse({
			...validCase,
			shortSummary: "",
		});
		expect(result.success).toBe(false);
	});

	test("clamps similarityScore to [0, 1]", () => {
		expect(
			RetrievedCaseSchema.safeParse({
				...validCase,
				similarityScore: 1.5,
			}).success,
		).toBe(false);

		expect(
			RetrievedCaseSchema.safeParse({
				...validCase,
				similarityScore: -0.1,
			}).success,
		).toBe(false);
	});
});

describe("CaseStatisticsSchema", () => {
	test("accepts valid statistics", () => {
		const result = CaseStatisticsSchema.safeParse({
			totalCases: 12,
			winRate: 0.67,
			avgReturn: 0.018,
			avgDuration: 48,
		});
		expect(result.success).toBe(true);
	});

	test("accepts all optional fields", () => {
		const result = CaseStatisticsSchema.parse({
			totalCases: 5,
			winRate: 0.6,
			avgReturn: 0.02,
			avgDuration: 36,
			returnStdDev: 0.015,
			bestReturn: 0.08,
			worstReturn: -0.03,
			dominantRegime: "BULL_TREND",
			avgSimilarity: 0.75,
		});
		expect(result.bestReturn).toBe(0.08);
		expect(result.dominantRegime).toBe("BULL_TREND");
	});

	test("requires totalCases", () => {
		const result = CaseStatisticsSchema.safeParse({ winRate: 0.5 });
		expect(result.success).toBe(false);
	});

	test("rejects negative totalCases", () => {
		const result = CaseStatisticsSchema.safeParse({ totalCases: -1 });
		expect(result.success).toBe(false);
	});

	test("clamps winRate to [0, 1]", () => {
		expect(
			CaseStatisticsSchema.safeParse({
				totalCases: 10,
				winRate: 1.5,
			}).success,
		).toBe(false);
	});
});

describe("MemoryContextSchema", () => {
	test("accepts empty context", () => {
		const result = MemoryContextSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.retrievedCases).toEqual([]);
		}
	});

	test("accepts complete context", () => {
		const result = MemoryContextSchema.safeParse({
			retrievedCases: [
				{
					caseId: "td_001",
					shortSummary: "Test case",
					keyOutcomes: {
						result: "win",
						return: 0.05,
						durationHours: 24,
					},
					asOfTimestamp: "2026-01-01T10:00:00Z",
				},
			],
			caseStatistics: {
				totalCases: 1,
				winRate: 1,
				avgReturn: 0.05,
			},
		});
		expect(result.success).toBe(true);
	});

	test("defaults retrievedCases to empty array", () => {
		const result = MemoryContextSchema.parse({});
		expect(result.retrievedCases).toEqual([]);
	});
});
