import { describe, expect, test } from "bun:test";

import { calculateCaseStatistics, filterByResult, filterBySimilarity } from "../memory-context";

describe("calculateCaseStatistics", () => {
	test("returns zero totalCases for empty array", () => {
		const stats = calculateCaseStatistics([]);
		expect(stats.totalCases).toBe(0);
		expect(stats.winRate).toBeUndefined();
	});

	test("calculates correct statistics", () => {
		const cases = [
			{
				caseId: "td_001",
				shortSummary: "Win 1",
				keyOutcomes: { result: "win" as const, return: 0.05, durationHours: 24 },
				asOfTimestamp: "2026-01-01T10:00:00Z",
				regime: "BULL_TREND",
				similarityScore: 0.8,
			},
			{
				caseId: "td_002",
				shortSummary: "Win 2",
				keyOutcomes: { result: "win" as const, return: 0.03, durationHours: 48 },
				asOfTimestamp: "2026-01-02T10:00:00Z",
				regime: "BULL_TREND",
				similarityScore: 0.7,
			},
			{
				caseId: "td_003",
				shortSummary: "Loss",
				keyOutcomes: { result: "loss" as const, return: -0.02, durationHours: 12 },
				asOfTimestamp: "2026-01-03T10:00:00Z",
				regime: "RANGE_BOUND",
				similarityScore: 0.6,
			},
		];

		const stats = calculateCaseStatistics(cases);
		expect(stats.totalCases).toBe(3);
		expect(stats.winRate).toBeCloseTo(2 / 3);
		expect(stats.avgReturn).toBeCloseTo(0.02);
		expect(stats.avgDuration).toBeCloseTo(28);
		expect(stats.bestReturn).toBe(0.05);
		expect(stats.worstReturn).toBe(-0.02);
		expect(stats.dominantRegime).toBe("BULL_TREND");
		expect(stats.avgSimilarity).toBeCloseTo(0.7);
	});
});

describe("calculateCaseStatistics", () => {
	test("handles single case", () => {
		const cases = [
			{
				caseId: "td_001",
				shortSummary: "Single",
				keyOutcomes: { result: "win" as const, return: 0.05, durationHours: 24 },
				asOfTimestamp: "2026-01-01T10:00:00Z",
			},
		];

		const stats = calculateCaseStatistics(cases);
		expect(stats.totalCases).toBe(1);
		expect(stats.winRate).toBe(1);
		expect(stats.avgReturn).toBe(0.05);
		expect(stats.returnStdDev).toBe(0);
	});

	test("handles cases without similarity scores", () => {
		const cases = [
			{
				caseId: "td_001",
				shortSummary: "No score",
				keyOutcomes: { result: "win" as const, return: 0.05, durationHours: 24 },
				asOfTimestamp: "2026-01-01T10:00:00Z",
			},
		];

		const stats = calculateCaseStatistics(cases);
		expect(stats.avgSimilarity).toBeUndefined();
	});
});

describe("filterBySimilarity", () => {
	const cases = [
		{
			caseId: "td_001",
			shortSummary: "High",
			keyOutcomes: { result: "win" as const, return: 0.05, durationHours: 24 },
			asOfTimestamp: "2026-01-01T10:00:00Z",
			similarityScore: 0.9,
		},
		{
			caseId: "td_002",
			shortSummary: "Medium",
			keyOutcomes: { result: "win" as const, return: 0.03, durationHours: 48 },
			asOfTimestamp: "2026-01-02T10:00:00Z",
			similarityScore: 0.6,
		},
		{
			caseId: "td_003",
			shortSummary: "Low",
			keyOutcomes: { result: "loss" as const, return: -0.02, durationHours: 12 },
			asOfTimestamp: "2026-01-03T10:00:00Z",
			similarityScore: 0.3,
		},
		{
			caseId: "td_004",
			shortSummary: "No score",
			keyOutcomes: { result: "loss" as const, return: -0.01, durationHours: 6 },
			asOfTimestamp: "2026-01-04T10:00:00Z",
		},
	];

	test("filters by minimum similarity", () => {
		const filtered = filterBySimilarity(cases, 0.7);
		const firstFilteredCase = filtered[0];
		expect(filtered).toHaveLength(1);
		expect(firstFilteredCase).toBeDefined();
		expect(firstFilteredCase?.caseId).toBe("td_001");
	});

	test("excludes cases without scores", () => {
		const filtered = filterBySimilarity(cases, 0);
		expect(filtered).toHaveLength(3);
	});
});

describe("filterByResult", () => {
	const cases = [
		{
			caseId: "td_001",
			shortSummary: "Win",
			keyOutcomes: { result: "win" as const, return: 0.05, durationHours: 24 },
			asOfTimestamp: "2026-01-01T10:00:00Z",
		},
		{
			caseId: "td_002",
			shortSummary: "Loss",
			keyOutcomes: { result: "loss" as const, return: -0.03, durationHours: 48 },
			asOfTimestamp: "2026-01-02T10:00:00Z",
		},
		{
			caseId: "td_003",
			shortSummary: "Another win",
			keyOutcomes: { result: "win" as const, return: 0.02, durationHours: 12 },
			asOfTimestamp: "2026-01-03T10:00:00Z",
		},
	];

	test("filters by win result", () => {
		const filtered = filterByResult(cases, "win");
		expect(filtered).toHaveLength(2);
		expect(filtered.every((currentCase) => currentCase.keyOutcomes.result === "win")).toBe(true);
	});

	test("filters by loss result", () => {
		const filtered = filterByResult(cases, "loss");
		const firstFilteredCase = filtered[0];
		expect(filtered).toHaveLength(1);
		expect(firstFilteredCase).toBeDefined();
		expect(firstFilteredCase?.caseId).toBe("td_002");
	});

	test("returns empty for non-existent result", () => {
		const filtered = filterByResult(cases, "stopped_out");
		expect(filtered).toHaveLength(0);
	});
});
