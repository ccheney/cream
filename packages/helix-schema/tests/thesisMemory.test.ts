/**
 * Tests for Thesis Memory module
 *
 * Tests outcome classification, holding period calculation,
 * lessons learned generation, and ThesisMemory creation.
 */

import { describe, expect, test } from "bun:test";
import {
  calculateHoldingPeriod,
  classifyOutcome,
  createThesisMemory,
  generateEmbeddingText,
  generateLessonsLearned,
  parseLessonsLearned,
  SCRATCH_THRESHOLD_PERCENT,
  summarizeThesisMemory,
  type ThesisMemoryInput,
} from "../src/thesisMemory";

// ============================================
// Test Fixtures
// ============================================

function createMockInput(overrides: Partial<ThesisMemoryInput> = {}): ThesisMemoryInput {
  return {
    thesisId: "thesis-123",
    instrumentId: "AAPL",
    entryThesis:
      "Strong momentum with earnings catalyst. RSI crossing above 50 with volume confirmation.",
    pnlPercent: 5.5,
    entryDate: "2025-12-01T14:00:00Z",
    closedAt: "2025-12-15T15:00:00Z",
    closeReason: "TARGET_HIT",
    entryPrice: 180.0,
    exitPrice: 190.0,
    entryRegime: "BULL_TREND",
    exitRegime: "BULL_TREND",
    environment: "PAPER",
    ...overrides,
  };
}

// ============================================
// Outcome Classification Tests
// ============================================

describe("classifyOutcome", () => {
  test("classifies positive P&L as WIN", () => {
    expect(classifyOutcome(5.5)).toBe("WIN");
    expect(classifyOutcome(0.6)).toBe("WIN"); // Just above scratch threshold
    expect(classifyOutcome(100.0)).toBe("WIN");
  });

  test("classifies negative P&L as LOSS", () => {
    expect(classifyOutcome(-3.2)).toBe("LOSS");
    expect(classifyOutcome(-0.6)).toBe("LOSS"); // Just below scratch threshold
    expect(classifyOutcome(-50.0)).toBe("LOSS");
  });

  test("classifies near-zero P&L as SCRATCH", () => {
    expect(classifyOutcome(0)).toBe("SCRATCH");
    expect(classifyOutcome(0.4)).toBe("SCRATCH");
    expect(classifyOutcome(-0.4)).toBe("SCRATCH");
    expect(classifyOutcome(SCRATCH_THRESHOLD_PERCENT)).toBe("SCRATCH");
    expect(classifyOutcome(-SCRATCH_THRESHOLD_PERCENT)).toBe("SCRATCH");
  });

  test("uses custom scratch threshold", () => {
    expect(classifyOutcome(0.8, 1.0)).toBe("SCRATCH");
    expect(classifyOutcome(-0.8, 1.0)).toBe("SCRATCH");
    expect(classifyOutcome(1.5, 1.0)).toBe("WIN");
    expect(classifyOutcome(-1.5, 1.0)).toBe("LOSS");
  });
});

// ============================================
// Holding Period Calculation Tests
// ============================================

describe("calculateHoldingPeriod", () => {
  test("calculates holding period in days", () => {
    const entryDate = "2025-12-01T14:00:00Z";
    const closedAt = "2025-12-15T14:00:00Z";
    expect(calculateHoldingPeriod(entryDate, closedAt)).toBe(14);
  });

  test("returns 0 for same-day trades", () => {
    const entryDate = "2025-12-01T09:00:00Z";
    const closedAt = "2025-12-01T16:00:00Z";
    expect(calculateHoldingPeriod(entryDate, closedAt)).toBe(0);
  });

  test("handles partial days correctly", () => {
    // Entry at end of day, close at start of next day = 0 days (less than 24h)
    const entryDate = "2025-12-01T20:00:00Z";
    const closedAt = "2025-12-02T08:00:00Z";
    expect(calculateHoldingPeriod(entryDate, closedAt)).toBe(0);

    // Entry at start of day, close at start of next day = 1 day
    const entryDate2 = "2025-12-01T09:00:00Z";
    const closedAt2 = "2025-12-02T10:00:00Z";
    expect(calculateHoldingPeriod(entryDate2, closedAt2)).toBe(1);
  });

  test("returns 0 for negative periods (should not happen in practice)", () => {
    const entryDate = "2025-12-15T14:00:00Z";
    const closedAt = "2025-12-01T14:00:00Z";
    expect(calculateHoldingPeriod(entryDate, closedAt)).toBe(0);
  });
});

// ============================================
// Lessons Learned Generation Tests
// ============================================

describe("generateLessonsLearned", () => {
  test("generates lessons for STOP_HIT", () => {
    const input = createMockInput({
      closeReason: "STOP_HIT",
      pnlPercent: -5.0,
      exitPrice: 171.0,
    });
    const lessons = generateLessonsLearned(input, "LOSS");

    expect(lessons).toContain("Stop loss triggered at 171");
    expect(lessons).toContain("Risk management worked as intended - loss was limited");
  });

  test("generates lessons for TARGET_HIT", () => {
    const input = createMockInput({
      closeReason: "TARGET_HIT",
      pnlPercent: 10.0,
    });
    const lessons = generateLessonsLearned(input, "WIN");

    expect(lessons).toContain("Target reached at 190");
    expect(lessons).toContain("Entry thesis validated - target execution successful");
  });

  test("generates lessons for INVALIDATED", () => {
    const input = createMockInput({
      closeReason: "INVALIDATED",
      pnlPercent: -2.0,
    });
    const lessons = generateLessonsLearned(input, "LOSS");

    expect(lessons).toContain("Original thesis was invalidated before full resolution");
  });

  test("generates lessons for significant gains", () => {
    const input = createMockInput({ pnlPercent: 15.0 });
    const lessons = generateLessonsLearned(input, "WIN");

    expect(lessons.some((l) => l.includes("Strong positive outcome"))).toBe(true);
  });

  test("generates lessons for significant losses", () => {
    const input = createMockInput({
      closeReason: "STOP_HIT",
      pnlPercent: -12.0,
    });
    const lessons = generateLessonsLearned(input, "LOSS");

    expect(lessons.some((l) => l.includes("Significant loss"))).toBe(true);
  });

  test("generates lessons for SCRATCH outcome", () => {
    const input = createMockInput({ pnlPercent: 0.2 });
    const lessons = generateLessonsLearned(input, "SCRATCH");

    expect(lessons.some((l) => l.includes("Breakeven trade"))).toBe(true);
  });

  test("generates lessons for regime change", () => {
    const input = createMockInput({
      entryRegime: "BULL_TREND",
      exitRegime: "RANGE_BOUND",
    });
    const lessons = generateLessonsLearned(input, "WIN");

    expect(lessons.some((l) => l.includes("Regime shifted"))).toBe(true);
  });

  test("generates lessons for day trades", () => {
    const input = createMockInput({
      entryDate: "2025-12-01T09:30:00Z",
      closedAt: "2025-12-01T15:00:00Z",
    });
    const lessons = generateLessonsLearned(input, "WIN");

    expect(lessons.some((l) => l.includes("Very short holding period"))).toBe(true);
  });

  test("generates lessons for long-term trades", () => {
    const input = createMockInput({
      entryDate: "2025-11-01T09:30:00Z",
      closedAt: "2025-12-15T15:00:00Z",
    });
    const lessons = generateLessonsLearned(input, "WIN");

    expect(lessons.some((l) => l.includes("Long holding period"))).toBe(true);
  });
});

// ============================================
// ThesisMemory Creation Tests
// ============================================

describe("createThesisMemory", () => {
  test("creates ThesisMemory from input", () => {
    const input = createMockInput();
    const memory = createThesisMemory(input);

    expect(memory.thesis_id).toBe("thesis-123");
    expect(memory.instrument_id).toBe("AAPL");
    expect(memory.entry_thesis).toBe(input.entryThesis);
    expect(memory.outcome).toBe("WIN");
    expect(memory.pnl_percent).toBe(5.5);
    expect(memory.holding_period_days).toBe(14);
    expect(memory.entry_regime).toBe("BULL_TREND");
    expect(memory.exit_regime).toBe("BULL_TREND");
    expect(memory.close_reason).toBe("TARGET_HIT");
    expect(memory.entry_price).toBe(180.0);
    expect(memory.exit_price).toBe(190.0);
    expect(memory.environment).toBe("PAPER");
  });

  test("classifies outcome correctly", () => {
    const winInput = createMockInput({ pnlPercent: 10.0 });
    expect(createThesisMemory(winInput).outcome).toBe("WIN");

    const lossInput = createMockInput({ pnlPercent: -8.0 });
    expect(createThesisMemory(lossInput).outcome).toBe("LOSS");

    const scratchInput = createMockInput({ pnlPercent: 0.2 });
    expect(createThesisMemory(scratchInput).outcome).toBe("SCRATCH");
  });

  test("calculates holding period correctly", () => {
    const input = createMockInput({
      entryDate: "2025-12-01T09:30:00Z",
      closedAt: "2025-12-08T15:00:00Z",
    });
    const memory = createThesisMemory(input);

    expect(memory.holding_period_days).toBe(7);
  });

  test("generates lessons learned as JSON array", () => {
    const input = createMockInput();
    const memory = createThesisMemory(input);

    const lessons = JSON.parse(memory.lessons_learned);
    expect(Array.isArray(lessons)).toBe(true);
    expect(lessons.length).toBeGreaterThan(0);
  });

  test("handles optional fields", () => {
    const input = createMockInput({
      underlyingSymbol: undefined,
      exitRegime: undefined,
      entryPrice: undefined,
      exitPrice: undefined,
    });
    const memory = createThesisMemory(input);

    expect(memory.underlying_symbol).toBeUndefined();
    expect(memory.exit_regime).toBeUndefined();
    expect(memory.entry_price).toBeUndefined();
    expect(memory.exit_price).toBeUndefined();
  });
});

// ============================================
// Embedding Text Generation Tests
// ============================================

describe("generateEmbeddingText", () => {
  test("includes thesis and outcome", () => {
    const memory = createThesisMemory(createMockInput());
    const text = generateEmbeddingText(memory);

    expect(text).toContain("Strong momentum");
    expect(text).toContain("WIN");
    expect(text).toContain("5.5%");
  });

  test("includes regime information", () => {
    const memory = createThesisMemory(createMockInput());
    const text = generateEmbeddingText(memory);

    expect(text).toContain("BULL_TREND");
  });

  test("includes close reason", () => {
    const memory = createThesisMemory(createMockInput());
    const text = generateEmbeddingText(memory);

    expect(text).toContain("TARGET_HIT");
  });

  test("notes regime shift if occurred", () => {
    const input = createMockInput({
      entryRegime: "BULL_TREND",
      exitRegime: "RANGE_BOUND",
    });
    const memory = createThesisMemory(input);
    const text = generateEmbeddingText(memory);

    expect(text).toContain("shifted to RANGE_BOUND");
  });

  test("includes lessons learned snippet", () => {
    const input = createMockInput({ closeReason: "TARGET_HIT" });
    const memory = createThesisMemory(input);
    const text = generateEmbeddingText(memory);

    expect(text).toContain("Lessons:");
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("parseLessonsLearned", () => {
  test("parses valid JSON array", () => {
    const json = '["Lesson 1", "Lesson 2", "Lesson 3"]';
    const lessons = parseLessonsLearned(json);

    expect(lessons).toEqual(["Lesson 1", "Lesson 2", "Lesson 3"]);
  });

  test("returns empty array for invalid JSON", () => {
    expect(parseLessonsLearned("not json")).toEqual([]);
    expect(parseLessonsLearned("{invalid}")).toEqual([]);
  });

  test("filters out non-string items", () => {
    const json = '["valid", 123, "also valid", null]';
    const lessons = parseLessonsLearned(json);

    expect(lessons).toEqual(["valid", "also valid"]);
  });

  test("returns empty array for non-array JSON", () => {
    expect(parseLessonsLearned('{"key": "value"}')).toEqual([]);
    expect(parseLessonsLearned('"just a string"')).toEqual([]);
  });
});

describe("summarizeThesisMemory", () => {
  test("generates human-readable summary", () => {
    const memory = createThesisMemory(createMockInput());
    const summary = summarizeThesisMemory(memory);

    expect(summary).toContain("WIN");
    expect(summary).toContain("AAPL");
    expect(summary).toContain("+5.5%");
    expect(summary).toContain("14 days");
    expect(summary).toContain("TARGET_HIT");
  });

  test("shows negative P&L without plus sign", () => {
    const input = createMockInput({
      pnlPercent: -3.2,
      closeReason: "STOP_HIT",
    });
    const memory = createThesisMemory(input);
    const summary = summarizeThesisMemory(memory);

    expect(summary).toContain("-3.2%");
    expect(summary).not.toContain("+-3.2%");
  });

  test("includes first lesson", () => {
    const memory = createThesisMemory(createMockInput());
    const summary = summarizeThesisMemory(memory);

    // Should include some lesson text
    expect(summary).toContain(" - ");
  });
});

// ============================================
// Edge Case Tests
// ============================================

describe("edge cases", () => {
  test("handles zero P&L", () => {
    const input = createMockInput({ pnlPercent: 0 });
    const memory = createThesisMemory(input);

    expect(memory.outcome).toBe("SCRATCH");
    expect(memory.pnl_percent).toBe(0);
  });

  test("handles very large P&L", () => {
    const input = createMockInput({ pnlPercent: 500.0 });
    const memory = createThesisMemory(input);

    expect(memory.outcome).toBe("WIN");
    expect(memory.pnl_percent).toBe(500.0);
  });

  test("handles very large losses", () => {
    const input = createMockInput({
      pnlPercent: -90.0,
      closeReason: "STOP_HIT",
    });
    const memory = createThesisMemory(input);

    expect(memory.outcome).toBe("LOSS");
    expect(memory.pnl_percent).toBe(-90.0);
  });

  test("handles options with underlying symbol", () => {
    const input = createMockInput({
      instrumentId: "AAPL240119C200",
      underlyingSymbol: "AAPL",
    });
    const memory = createThesisMemory(input);

    expect(memory.instrument_id).toBe("AAPL240119C200");
    expect(memory.underlying_symbol).toBe("AAPL");
  });

  test("handles all close reasons", () => {
    const reasons = [
      "STOP_HIT",
      "TARGET_HIT",
      "INVALIDATED",
      "MANUAL",
      "TIME_DECAY",
      "CORRELATION",
    ] as const;

    for (const reason of reasons) {
      const input = createMockInput({ closeReason: reason });
      const memory = createThesisMemory(input);
      expect(memory.close_reason).toBe(reason);

      // Verify lessons are generated without error
      const lessons = parseLessonsLearned(memory.lessons_learned);
      expect(lessons.length).toBeGreaterThan(0);
    }
  });
});
