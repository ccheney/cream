/**
 * Memory Context Type Tests
 */

import { describe, expect, test } from "bun:test";
import {
  calculateCaseStatistics,
  CaseResult,
  CaseStatisticsSchema,
  createEmptyMemoryContext,
  filterByResult,
  filterBySimilarity,
  getMostSimilarCase,
  hasMemoryContext,
  KeyOutcomesSchema,
  MemoryContextSchema,
  RetrievedCaseSchema,
} from "./memory-context";

// ============================================
// Enum Tests
// ============================================

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

// ============================================
// Key Outcomes Tests
// ============================================

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

// ============================================
// Retrieved Case Tests
// ============================================

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
      }).success
    ).toBe(false);

    expect(
      RetrievedCaseSchema.safeParse({
        ...validCase,
        similarityScore: -0.1,
      }).success
    ).toBe(false);
  });
});

// ============================================
// Case Statistics Tests
// ============================================

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
    const result = CaseStatisticsSchema.safeParse({
      winRate: 0.5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative totalCases", () => {
    const result = CaseStatisticsSchema.safeParse({
      totalCases: -1,
    });
    expect(result.success).toBe(false);
  });

  test("clamps winRate to [0, 1]", () => {
    expect(
      CaseStatisticsSchema.safeParse({
        totalCases: 10,
        winRate: 1.5,
      }).success
    ).toBe(false);
  });
});

// ============================================
// Memory Context Tests
// ============================================

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
        winRate: 1.0,
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

// ============================================
// Helper Function Tests
// ============================================

describe("createEmptyMemoryContext", () => {
  test("returns empty context", () => {
    const ctx = createEmptyMemoryContext();
    expect(ctx.retrievedCases).toEqual([]);
    expect(ctx.caseStatistics).toBeUndefined();
  });
});

describe("hasMemoryContext", () => {
  test("returns false for empty context", () => {
    const ctx = createEmptyMemoryContext();
    expect(hasMemoryContext(ctx)).toBe(false);
  });

  test("returns true when cases present", () => {
    const ctx = {
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
    expect(hasMemoryContext(ctx)).toBe(true);
  });
});

describe("getMostSimilarCase", () => {
  test("returns undefined for empty context", () => {
    const ctx = createEmptyMemoryContext();
    expect(getMostSimilarCase(ctx)).toBeUndefined();
  });

  test("returns case with highest similarity score", () => {
    const ctx = {
      retrievedCases: [
        {
          caseId: "td_001",
          shortSummary: "First",
          keyOutcomes: {
            result: "win" as const,
            return: 0.02,
            durationHours: 24,
          },
          asOfTimestamp: "2026-01-01T10:00:00Z",
          similarityScore: 0.7,
        },
        {
          caseId: "td_002",
          shortSummary: "Second",
          keyOutcomes: {
            result: "loss" as const,
            return: -0.03,
            durationHours: 48,
          },
          asOfTimestamp: "2026-01-02T10:00:00Z",
          similarityScore: 0.9,
        },
      ],
    };
    const result = getMostSimilarCase(ctx);
    expect(result?.caseId).toBe("td_002");
  });

  test("returns first case when no similarity scores", () => {
    const ctx = {
      retrievedCases: [
        {
          caseId: "td_001",
          shortSummary: "First",
          keyOutcomes: {
            result: "win" as const,
            return: 0.02,
            durationHours: 24,
          },
          asOfTimestamp: "2026-01-01T10:00:00Z",
        },
        {
          caseId: "td_002",
          shortSummary: "Second",
          keyOutcomes: {
            result: "loss" as const,
            return: -0.03,
            durationHours: 48,
          },
          asOfTimestamp: "2026-01-02T10:00:00Z",
        },
      ],
    };
    const result = getMostSimilarCase(ctx);
    expect(result?.caseId).toBe("td_001");
  });
});

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
        keyOutcomes: {
          result: "win" as const,
          return: 0.05,
          durationHours: 24,
        },
        asOfTimestamp: "2026-01-01T10:00:00Z",
        regime: "BULL_TREND",
        similarityScore: 0.8,
      },
      {
        caseId: "td_002",
        shortSummary: "Win 2",
        keyOutcomes: {
          result: "win" as const,
          return: 0.03,
          durationHours: 48,
        },
        asOfTimestamp: "2026-01-02T10:00:00Z",
        regime: "BULL_TREND",
        similarityScore: 0.7,
      },
      {
        caseId: "td_003",
        shortSummary: "Loss",
        keyOutcomes: {
          result: "loss" as const,
          return: -0.02,
          durationHours: 12,
        },
        asOfTimestamp: "2026-01-03T10:00:00Z",
        regime: "RANGE_BOUND",
        similarityScore: 0.6,
      },
    ];

    const stats = calculateCaseStatistics(cases);
    expect(stats.totalCases).toBe(3);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.avgReturn).toBeCloseTo(0.02); // (0.05 + 0.03 - 0.02) / 3
    expect(stats.avgDuration).toBeCloseTo(28); // (24 + 48 + 12) / 3
    expect(stats.bestReturn).toBe(0.05);
    expect(stats.worstReturn).toBe(-0.02);
    expect(stats.dominantRegime).toBe("BULL_TREND");
    expect(stats.avgSimilarity).toBeCloseTo(0.7); // (0.8 + 0.7 + 0.6) / 3
  });

  test("handles single case", () => {
    const cases = [
      {
        caseId: "td_001",
        shortSummary: "Single",
        keyOutcomes: {
          result: "win" as const,
          return: 0.05,
          durationHours: 24,
        },
        asOfTimestamp: "2026-01-01T10:00:00Z",
      },
    ];

    const stats = calculateCaseStatistics(cases);
    expect(stats.totalCases).toBe(1);
    expect(stats.winRate).toBe(1);
    expect(stats.avgReturn).toBe(0.05);
    expect(stats.returnStdDev).toBe(0); // Single value = 0 std dev
  });

  test("handles cases without similarity scores", () => {
    const cases = [
      {
        caseId: "td_001",
        shortSummary: "No score",
        keyOutcomes: {
          result: "win" as const,
          return: 0.05,
          durationHours: 24,
        },
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
      keyOutcomes: {
        result: "win" as const,
        return: 0.05,
        durationHours: 24,
      },
      asOfTimestamp: "2026-01-01T10:00:00Z",
      similarityScore: 0.9,
    },
    {
      caseId: "td_002",
      shortSummary: "Medium",
      keyOutcomes: {
        result: "win" as const,
        return: 0.03,
        durationHours: 48,
      },
      asOfTimestamp: "2026-01-02T10:00:00Z",
      similarityScore: 0.6,
    },
    {
      caseId: "td_003",
      shortSummary: "Low",
      keyOutcomes: {
        result: "loss" as const,
        return: -0.02,
        durationHours: 12,
      },
      asOfTimestamp: "2026-01-03T10:00:00Z",
      similarityScore: 0.3,
    },
    {
      caseId: "td_004",
      shortSummary: "No score",
      keyOutcomes: {
        result: "loss" as const,
        return: -0.01,
        durationHours: 6,
      },
      asOfTimestamp: "2026-01-04T10:00:00Z",
    },
  ];

  test("filters by minimum similarity", () => {
    const filtered = filterBySimilarity(cases, 0.7);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].caseId).toBe("td_001");
  });

  test("excludes cases without scores", () => {
    const filtered = filterBySimilarity(cases, 0.0);
    expect(filtered).toHaveLength(3); // Only the 3 with scores
  });
});

describe("filterByResult", () => {
  const cases = [
    {
      caseId: "td_001",
      shortSummary: "Win",
      keyOutcomes: {
        result: "win" as const,
        return: 0.05,
        durationHours: 24,
      },
      asOfTimestamp: "2026-01-01T10:00:00Z",
    },
    {
      caseId: "td_002",
      shortSummary: "Loss",
      keyOutcomes: {
        result: "loss" as const,
        return: -0.03,
        durationHours: 48,
      },
      asOfTimestamp: "2026-01-02T10:00:00Z",
    },
    {
      caseId: "td_003",
      shortSummary: "Another win",
      keyOutcomes: {
        result: "win" as const,
        return: 0.02,
        durationHours: 12,
      },
      asOfTimestamp: "2026-01-03T10:00:00Z",
    },
  ];

  test("filters by win result", () => {
    const filtered = filterByResult(cases, "win");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((c) => c.keyOutcomes.result === "win")).toBe(true);
  });

  test("filters by loss result", () => {
    const filtered = filterByResult(cases, "loss");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].caseId).toBe("td_002");
  });

  test("returns empty for non-existent result", () => {
    const filtered = filterByResult(cases, "stopped_out");
    expect(filtered).toHaveLength(0);
  });
});
