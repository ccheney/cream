/**
 * Trigger Condition Detection Tests
 *
 * Tests for the indicator synthesis trigger detection module.
 */

import { describe, expect, it } from "bun:test";
import {
  calculateICDecayDays,
  calculateRollingIC,
  createTriggerConditions,
  daysSince,
  evaluateTriggerConditions,
  type ICHistoryEntry,
  isUnderperforming,
  shouldTriggerGeneration,
  TRIGGER_DEFAULTS,
  type TriggerConditions,
} from "../src/synthesis/trigger.js";

// ============================================
// Test Fixtures
// ============================================

function createICHistory(values: number[], startDate = "2026-01-01"): ICHistoryEntry[] {
  const start = new Date(startDate);
  return values.map((icValue, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() - i); // Newest first
    const dateStr = date.toISOString().split("T")[0];
    return {
      date: dateStr ?? startDate, // Ensure non-undefined
      icValue,
    };
  });
}

function createDefaultConditions(overrides: Partial<TriggerConditions> = {}): TriggerConditions {
  return {
    regimeGapDetected: true,
    currentRegime: "HIGH_VOL",
    existingIndicatorsUnderperforming: true,
    rollingIC30Day: 0.01,
    icDecayDays: 7,
    daysSinceLastAttempt: 45,
    activeIndicatorCount: 10,
    maxIndicatorCapacity: 20,
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================
// shouldTriggerGeneration Tests
// ============================================

describe("shouldTriggerGeneration", () => {
  it("returns true when all conditions are met", () => {
    const conditions = createDefaultConditions();
    expect(shouldTriggerGeneration(conditions)).toBe(true);
  });

  it("returns false when regime gap not detected", () => {
    const conditions = createDefaultConditions({ regimeGapDetected: false });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns false when indicators not underperforming", () => {
    const conditions = createDefaultConditions({ existingIndicatorsUnderperforming: false });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns false when rolling IC above threshold", () => {
    const conditions = createDefaultConditions({ rollingIC30Day: 0.05 });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns false when IC decay days below threshold", () => {
    const conditions = createDefaultConditions({ icDecayDays: 3 });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns false when cooldown not met (29 days)", () => {
    const conditions = createDefaultConditions({ daysSinceLastAttempt: 29 });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns true when cooldown exactly met (30 days)", () => {
    const conditions = createDefaultConditions({ daysSinceLastAttempt: 30 });
    expect(shouldTriggerGeneration(conditions)).toBe(true);
  });

  it("returns false when at capacity", () => {
    const conditions = createDefaultConditions({
      activeIndicatorCount: 20,
      maxIndicatorCapacity: 20,
    });
    expect(shouldTriggerGeneration(conditions)).toBe(false);
  });

  it("returns true when one under capacity", () => {
    const conditions = createDefaultConditions({
      activeIndicatorCount: 19,
      maxIndicatorCapacity: 20,
    });
    expect(shouldTriggerGeneration(conditions)).toBe(true);
  });
});

// ============================================
// evaluateTriggerConditions Tests
// ============================================

describe("evaluateTriggerConditions", () => {
  it("returns detailed reasons when trigger is true", () => {
    const conditions = createDefaultConditions();
    const result = evaluateTriggerConditions(conditions);

    expect(result.shouldTrigger).toBe(true);
    expect(result.summary).toContain("triggered");
    expect(result.reasons.length).toBe(5);
  });

  it("returns failure reasons when trigger is false", () => {
    const conditions = createDefaultConditions({
      regimeGapDetected: false,
      daysSinceLastAttempt: 10,
    });
    const result = evaluateTriggerConditions(conditions);

    expect(result.shouldTrigger).toBe(false);
    expect(result.summary).toContain("blocked");
    expect(result.reasons.some((r) => r.includes("No regime gap"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("Cooldown not met"))).toBe(true);
  });

  it("includes regime details in reasons", () => {
    const conditions = createDefaultConditions({
      currentRegime: "BULL_TREND",
      regimeGapDetails: "Missing momentum indicators",
    });
    const result = evaluateTriggerConditions(conditions);

    expect(result.reasons.some((r) => r.includes("BULL_TREND"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("momentum indicators"))).toBe(true);
  });
});

// ============================================
// calculateICDecayDays Tests
// ============================================

describe("calculateICDecayDays", () => {
  it("returns 0 for empty history", () => {
    expect(calculateICDecayDays([])).toBe(0);
  });

  it("counts consecutive days below threshold or declining", () => {
    const history = createICHistory([0.01, 0.015, 0.018, 0.025, 0.03]);
    // All are either below threshold (0.02) OR declining from previous
    // 0.01 < 0.015 (declining), 0.015 < 0.018 (declining), 0.018 < 0.02 (below), 0.025 < 0.03 (declining)
    expect(calculateICDecayDays(history)).toBe(4);
  });

  it("counts declining days even if above threshold", () => {
    const history = createICHistory([0.025, 0.028, 0.03, 0.035, 0.04]);
    // Each is less than previous, so all 4 pairs are declining
    expect(calculateICDecayDays(history)).toBe(4);
  });

  it("breaks streak when IC rises above threshold", () => {
    const history = createICHistory([0.01, 0.01, 0.05, 0.01, 0.01]);
    // First 2 below threshold, then 0.05 breaks the declining streak
    expect(calculateICDecayDays(history)).toBe(2);
  });

  it("handles single entry", () => {
    const history = createICHistory([0.01]);
    expect(calculateICDecayDays(history)).toBe(1); // Below threshold
  });

  it("respects custom threshold", () => {
    const history = createICHistory([0.03, 0.035, 0.04]);
    expect(calculateICDecayDays(history, 0.05)).toBe(3); // All below 0.05
    // With threshold 0.02, none below but all declining (0.03 < 0.035 < 0.04)
    expect(calculateICDecayDays(history, 0.02)).toBe(2); // Still counts declining pairs
  });

  it("breaks streak when not declining and above threshold", () => {
    const history = createICHistory([0.05, 0.04, 0.03]); // Rising IC, all above threshold
    expect(calculateICDecayDays(history, 0.02)).toBe(0);
  });
});

// ============================================
// calculateRollingIC Tests
// ============================================

describe("calculateRollingIC", () => {
  it("returns 0 for empty history", () => {
    expect(calculateRollingIC([])).toBe(0);
  });

  it("calculates average over window", () => {
    const history = createICHistory([0.02, 0.04, 0.06]);
    expect(calculateRollingIC(history, 3)).toBeCloseTo(0.04);
  });

  it("uses only window days", () => {
    const history = createICHistory([0.01, 0.02, 0.03, 0.1, 0.2]);
    // Only first 3 entries
    expect(calculateRollingIC(history, 3)).toBeCloseTo(0.02);
  });

  it("handles window larger than history", () => {
    const history = createICHistory([0.02, 0.04]);
    expect(calculateRollingIC(history, 30)).toBeCloseTo(0.03);
  });

  it("defaults to 30-day window", () => {
    const values = Array(40).fill(0.05);
    const history = createICHistory(values);
    expect(calculateRollingIC(history)).toBeCloseTo(0.05);
  });
});

// ============================================
// daysSince Tests
// ============================================

describe("daysSince", () => {
  it("returns MAX_SAFE_INTEGER for null timestamp", () => {
    expect(daysSince(null)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("returns MAX_SAFE_INTEGER for undefined timestamp", () => {
    expect(daysSince(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("calculates days correctly", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const then = "2026-01-10T12:00:00Z";
    expect(daysSince(then, now)).toBe(5);
  });

  it("returns 0 for same day", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const then = "2026-01-15T00:00:00Z";
    expect(daysSince(then, now)).toBe(0);
  });

  it("floors partial days", () => {
    const now = new Date("2026-01-15T23:59:59Z");
    const then = "2026-01-14T00:00:01Z";
    expect(daysSince(then, now)).toBe(1);
  });
});

// ============================================
// isUnderperforming Tests
// ============================================

describe("isUnderperforming", () => {
  it("returns true when IC below threshold", () => {
    expect(isUnderperforming(0.01, 0)).toBe(true);
  });

  it("returns true when decay days at threshold", () => {
    expect(isUnderperforming(0.05, 5)).toBe(true);
  });

  it("returns false when IC good and decay low", () => {
    expect(isUnderperforming(0.05, 2)).toBe(false);
  });

  it("uses default thresholds", () => {
    expect(isUnderperforming(TRIGGER_DEFAULTS.minRollingIC - 0.001, 0)).toBe(true);
    expect(isUnderperforming(TRIGGER_DEFAULTS.minRollingIC + 0.001, 0)).toBe(false);
  });
});

// ============================================
// createTriggerConditions Tests
// ============================================

describe("createTriggerConditions", () => {
  it("creates conditions from inputs", () => {
    const icHistory = createICHistory([0.01, 0.015, 0.02, 0.025]);
    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      currentRegime: "HIGH_VOL",
      icHistory,
      activeIndicatorCount: 5,
    });

    expect(conditions.regimeGapDetected).toBe(true);
    expect(conditions.currentRegime).toBe("HIGH_VOL");
    expect(conditions.activeIndicatorCount).toBe(5);
    expect(conditions.maxIndicatorCapacity).toBe(TRIGGER_DEFAULTS.maxIndicatorCapacity);
    expect(conditions.evaluatedAt).toBeDefined();
  });

  it("calculates derived values from IC history", () => {
    const icHistory = createICHistory([0.01, 0.01, 0.01, 0.01, 0.01]);
    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      activeIndicatorCount: 5,
    });

    expect(conditions.rollingIC30Day).toBeCloseTo(0.01);
    expect(conditions.icDecayDays).toBe(5);
    expect(conditions.existingIndicatorsUnderperforming).toBe(true);
  });

  it("calculates days since last attempt", () => {
    const now = new Date("2026-01-15");
    const icHistory = createICHistory([0.01]);
    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      lastAttemptAt: "2025-12-01",
      activeIndicatorCount: 5,
      evaluatedAt: now.toISOString(),
    });

    expect(conditions.daysSinceLastAttempt).toBe(45);
    expect(conditions.lastAttemptAt).toBe("2025-12-01");
  });

  it("handles no previous attempt", () => {
    const icHistory = createICHistory([0.01]);
    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      lastAttemptAt: null,
      activeIndicatorCount: 5,
    });

    expect(conditions.daysSinceLastAttempt).toBe(Number.MAX_SAFE_INTEGER);
    expect(conditions.lastAttemptAt).toBeUndefined();
  });

  it("accepts custom capacity", () => {
    const icHistory = createICHistory([0.01]);
    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      activeIndicatorCount: 5,
      maxIndicatorCapacity: 50,
    });

    expect(conditions.maxIndicatorCapacity).toBe(50);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Trigger Detection Integration", () => {
  it("full workflow: should trigger generation", () => {
    // Create a scenario where generation should trigger
    const icHistory = createICHistory(
      Array(10)
        .fill(0)
        .map((_, i) => 0.01 - i * 0.001) // Declining IC
    );

    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      currentRegime: "CRASH",
      regimeGapDetails: "No crash-specific indicators",
      icHistory,
      lastAttemptAt: "2025-11-01",
      activeIndicatorCount: 10,
      maxIndicatorCapacity: 20,
      evaluatedAt: "2026-01-15T00:00:00Z",
    });

    const result = evaluateTriggerConditions(conditions);

    expect(result.shouldTrigger).toBe(true);
    expect(result.reasons.some((r) => r.includes("CRASH"))).toBe(true);
  });

  it("full workflow: should NOT trigger (cooldown)", () => {
    const icHistory = createICHistory(Array(10).fill(0.01));

    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      lastAttemptAt: "2026-01-10", // Only 5 days ago
      activeIndicatorCount: 10,
      evaluatedAt: "2026-01-15T00:00:00Z",
    });

    const result = evaluateTriggerConditions(conditions);

    expect(result.shouldTrigger).toBe(false);
    expect(result.reasons.some((r) => r.includes("Cooldown"))).toBe(true);
  });

  it("full workflow: should NOT trigger (good performance)", () => {
    const icHistory = createICHistory(Array(10).fill(0.08)); // Good IC

    const conditions = createTriggerConditions({
      regimeGapDetected: true,
      icHistory,
      lastAttemptAt: "2025-11-01",
      activeIndicatorCount: 10,
      evaluatedAt: "2026-01-15T00:00:00Z",
    });

    const result = evaluateTriggerConditions(conditions);

    expect(result.shouldTrigger).toBe(false);
  });
});
