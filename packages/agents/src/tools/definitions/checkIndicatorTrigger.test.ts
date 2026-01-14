/**
 * Check Indicator Trigger Tool Tests
 *
 * Comprehensive unit tests for the checkIndicatorTrigger tool, covering
 * all trigger conditions and edge cases.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md (Phase 1, Step 4)
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, test } from "bun:test";
import type {
	CheckIndicatorTriggerInput,
	CheckIndicatorTriggerOutput,
} from "./checkIndicatorTrigger";
import { createCheckIndicatorTriggerTool } from "./checkIndicatorTrigger";

// ============================================
// Test Helpers
// ============================================

/**
 * Create IC history entries for testing
 *
 * @param days - Number of days to generate
 * @param icValue - IC value to use (or function to calculate from day index)
 */
function createICHistory(
	days: number,
	icValue: number | ((dayIndex: number) => number) = 0.05
): { date: string; icValue: number }[] {
	const history: { date: string; icValue: number }[] = [];
	const today = new Date();

	for (let i = 0; i < days; i++) {
		const date = new Date(today);
		date.setDate(date.getDate() - i);
		const value = typeof icValue === "function" ? icValue(i) : icValue;
		history.push({
			date: date.toISOString().split("T")[0]!,
			icValue: value,
		});
	}

	return history;
}

/**
 * Create base input with sensible defaults
 */
function createBaseInput(
	overrides: Partial<CheckIndicatorTriggerInput> = {}
): CheckIndicatorTriggerInput {
	return {
		regimeGapDetected: false,
		currentRegime: "BULL_TREND",
		icHistory: createICHistory(30, 0.05),
		activeIndicatorCount: 10,
		maxIndicatorCapacity: 20,
		lastAttemptAt: null,
		closestIndicatorSimilarity: 0.5,
		...overrides,
	};
}

/**
 * Execute the tool and return the result
 */
async function executeTool(
	input: CheckIndicatorTriggerInput
): Promise<CheckIndicatorTriggerOutput> {
	const tool = createCheckIndicatorTriggerTool();
	const result = await tool.execute(input);
	// Cast to expected output type (Mastra tools may return ValidationError on invalid input)
	return result as CheckIndicatorTriggerOutput;
}

// ============================================
// Regime Gap Trigger Tests
// ============================================

describe("checkIndicatorTrigger - Regime Gap Trigger", () => {
	test("should trigger when regime gap detected", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			regimeGapDetails: "No indicators trained for HIGH_VOL regime",
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.conditions.regimeGapDetected).toBe(true);
		expect(result.triggerReason).toContain("Regime gap");
		expect(result.triggerReason).toContain("HIGH_VOL");
	});

	test("should include regime gap details in trigger reason", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "BEAR_TREND",
			regimeGapDetails: "Coverage dropped below 50%",
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.triggerReason).toContain("Coverage dropped below 50%");
	});

	test("should not trigger regime gap when regime covered", async () => {
		const input = createBaseInput({
			regimeGapDetected: false,
			currentRegime: "BULL_TREND",
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.regimeGapDetected).toBe(false);
	});
});

// ============================================
// IC Decay Trigger Tests
// ============================================

describe("checkIndicatorTrigger - IC Decay Trigger", () => {
	test("should trigger when IC < 0.02 for 5+ consecutive days", async () => {
		// Create IC history with sustained low IC (below 0.02) and decay pattern
		// Decay days are calculated by comparing consecutive values
		// We need: 1) rolling 30-day IC < 0.02, 2) 5+ consecutive decay days
		const icHistory = createICHistory(30, (dayIndex) => {
			// All days have low IC (below 0.02) with consistent decay pattern
			// Starting at 0.019 and decreasing, ensures rolling average is < 0.02
			return 0.019 - dayIndex * 0.0003;
		});

		const input = createBaseInput({
			regimeGapDetected: false,
			icHistory,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.conditions.existingIndicatorsUnderperforming).toBe(true);
		expect(result.conditions.icDecayDays).toBeGreaterThanOrEqual(5);
		expect(result.triggerReason).toContain("Sustained underperformance");
	});

	test("should not trigger when IC is adequate (>= 0.02)", async () => {
		const input = createBaseInput({
			regimeGapDetected: false,
			icHistory: createICHistory(30, 0.05), // Healthy IC
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.existingIndicatorsUnderperforming).toBe(false);
	});

	test("should not trigger with only 4 consecutive decay days", async () => {
		// Create IC history with only 4 consecutive decay days
		const icHistory = createICHistory(30, (dayIndex) => {
			if (dayIndex < 4) {
				return 0.015 - dayIndex * 0.001;
			}
			return 0.03; // Higher IC breaks decay streak
		});

		const input = createBaseInput({
			regimeGapDetected: false,
			icHistory,
		});

		const result = await executeTool(input);

		// IC might still be low but decay streak is not long enough
		expect(result.conditions.icDecayDays).toBeLessThan(5);
	});

	test("should calculate rolling 30-day IC correctly", async () => {
		// Create consistent IC history
		const icHistory = createICHistory(30, 0.04);

		const input = createBaseInput({
			icHistory,
		});

		const result = await executeTool(input);

		expect(result.conditions.rollingIC30Day).toBeCloseTo(0.04, 3);
	});
});

// ============================================
// Cooldown Blocking Tests
// ============================================

describe("checkIndicatorTrigger - Cooldown Blocking", () => {
	test("should NOT trigger if < 30 days since last attempt", async () => {
		const recentAttempt = new Date();
		recentAttempt.setDate(recentAttempt.getDate() - 15);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: recentAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.daysSinceLastAttempt).toBeLessThan(30);
		expect(result.summary).toContain("Cooldown");
		expect(result.recommendation).toContain("Wait");
	});

	test("should trigger if exactly 30 days since last attempt", async () => {
		const oldAttempt = new Date();
		oldAttempt.setDate(oldAttempt.getDate() - 30);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: oldAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.conditions.daysSinceLastAttempt).toBeGreaterThanOrEqual(30);
	});

	test("should trigger if > 30 days since last attempt", async () => {
		const oldAttempt = new Date();
		oldAttempt.setDate(oldAttempt.getDate() - 45);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: oldAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.conditions.daysSinceLastAttempt).toBeGreaterThan(30);
	});

	test("should trigger when no previous attempt (null lastAttemptAt)", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: null,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.conditions.daysSinceLastAttempt).toBeGreaterThanOrEqual(30);
	});

	test("should show remaining days in recommendation when in cooldown", async () => {
		const recentAttempt = new Date();
		recentAttempt.setDate(recentAttempt.getDate() - 20);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: recentAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.recommendation).toMatch(/Wait \d+ more day/);
	});
});

// ============================================
// Capacity Blocking Tests
// ============================================

describe("checkIndicatorTrigger - Capacity Blocking", () => {
	test("should NOT trigger if at max indicator capacity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 20,
			maxIndicatorCapacity: 20,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.activeIndicatorCount).toBe(20);
		expect(result.conditions.maxIndicatorCapacity).toBe(20);
		expect(result.summary).toContain("capacity");
		expect(result.recommendation).toContain("Retire");
	});

	test("should NOT trigger if over max capacity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 25,
			maxIndicatorCapacity: 20,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.recommendation).toContain("25/20");
	});

	test("should trigger when under capacity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 15,
			maxIndicatorCapacity: 20,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
	});

	test("should use default max capacity of 20", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 15,
		});
		// Don't set maxIndicatorCapacity - should default to 20

		const result = await executeTool(input);

		expect(result.conditions.maxIndicatorCapacity).toBe(20);
		expect(result.shouldTrigger).toBe(true);
	});

	test("should respect custom max capacity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 8,
			maxIndicatorCapacity: 10,
		});

		const result = await executeTool(input);

		expect(result.conditions.maxIndicatorCapacity).toBe(10);
		expect(result.shouldTrigger).toBe(true);

		// At capacity should block
		const input2 = { ...input, activeIndicatorCount: 10 };
		const result2 = await executeTool(input2);
		expect(result2.shouldTrigger).toBe(false);
	});
});

// ============================================
// Similarity Threshold Tests
// ============================================

describe("checkIndicatorTrigger - Similarity Threshold", () => {
	test("should NOT trigger if closest indicator similarity >= 0.7", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			closestIndicatorSimilarity: 0.8,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.closestIndicatorSimilarity).toBe(0.8);
		expect(result.summary).toContain("similar");
		expect(result.recommendation).toContain("refinement");
	});

	test("should NOT trigger at exactly 0.7 similarity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			closestIndicatorSimilarity: 0.7,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
	});

	test("should trigger when similarity < 0.7", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			closestIndicatorSimilarity: 0.69,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
	});

	test("should trigger with low similarity", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			closestIndicatorSimilarity: 0.2,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
	});

	test("should default similarity to 1.0 when not provided", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
		});
		// Clear closestIndicatorSimilarity
		delete (input as Partial<CheckIndicatorTriggerInput>).closestIndicatorSimilarity;

		const result = await executeTool(input);

		expect(result.conditions.closestIndicatorSimilarity).toBe(1.0);
		expect(result.shouldTrigger).toBe(false); // Blocked by high similarity
	});
});

// ============================================
// Combined Conditions Tests
// ============================================

describe("checkIndicatorTrigger - Combined Conditions", () => {
	test("should trigger with regime gap and all blocking conditions clear", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: null,
			activeIndicatorCount: 10,
			maxIndicatorCapacity: 20,
			closestIndicatorSimilarity: 0.5,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.triggerReason).toContain("Regime gap");
	});

	test("should prioritize regime gap trigger reason over IC decay", async () => {
		// Create conditions where both regime gap AND IC decay are met
		const icHistory = createICHistory(30, (dayIndex) => {
			if (dayIndex < 6) {
				return 0.015 - dayIndex * 0.001;
			}
			return 0.03;
		});

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			icHistory,
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		// Regime gap takes priority in trigger reason
		expect(result.triggerReason).toContain("Regime gap");
	});

	test("should not trigger when trigger conditions met but blocked", async () => {
		// Regime gap detected BUT in cooldown
		const recentAttempt = new Date();
		recentAttempt.setDate(recentAttempt.getDate() - 10);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: recentAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.conditions.regimeGapDetected).toBe(true); // Condition met
		expect(result.summary).toContain("Cooldown"); // But blocked
	});

	test("should not trigger when no trigger conditions and no blocking", async () => {
		const input = createBaseInput({
			regimeGapDetected: false,
			icHistory: createICHistory(30, 0.05), // Healthy IC
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.summary).toContain("No trigger condition");
		expect(result.recommendation).toContain("Continue monitoring");
	});
});

// ============================================
// Edge Cases Tests
// ============================================

describe("checkIndicatorTrigger - Edge Cases", () => {
	test("should handle empty IC history", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			icHistory: [],
		});

		const result = await executeTool(input);

		expect(result.conditions.rollingIC30Day).toBe(0);
		expect(result.conditions.icDecayDays).toBe(0);
		expect(result.shouldTrigger).toBe(true); // Can still trigger on regime gap
	});

	test("should handle single IC entry", async () => {
		const input = createBaseInput({
			icHistory: [{ date: "2024-01-15", icValue: 0.05 }],
		});

		const result = await executeTool(input);

		expect(result.conditions.rollingIC30Day).toBe(0.05);
		expect(result.conditions.icDecayDays).toBe(0);
	});

	test("should handle very old lastAttemptAt", async () => {
		const veryOldAttempt = new Date();
		veryOldAttempt.setFullYear(veryOldAttempt.getFullYear() - 1);

		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			lastAttemptAt: veryOldAttempt.toISOString(),
		});

		const result = await executeTool(input);

		expect(result.conditions.daysSinceLastAttempt).toBeGreaterThan(300);
		expect(result.shouldTrigger).toBe(true);
	});

	test("should handle zero active indicators", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			activeIndicatorCount: 0,
		});

		const result = await executeTool(input);

		expect(result.conditions.activeIndicatorCount).toBe(0);
		expect(result.shouldTrigger).toBe(true);
	});

	test("should handle boundary IC values (exactly 0.02)", async () => {
		const input = createBaseInput({
			icHistory: createICHistory(30, 0.02), // Exactly at threshold
		});

		const result = await executeTool(input);

		// IC of exactly 0.02 should not be considered underperforming
		expect(result.conditions.rollingIC30Day).toBeCloseTo(0.02, 4);
		expect(result.conditions.existingIndicatorsUnderperforming).toBe(false);
	});

	test("should handle negative IC values", async () => {
		const input = createBaseInput({
			icHistory: createICHistory(30, -0.01),
		});

		const result = await executeTool(input);

		expect(result.conditions.rollingIC30Day).toBeLessThan(0);
		// Should still evaluate correctly
	});

	test("should handle IC values at boundary (0 similarity)", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			closestIndicatorSimilarity: 0,
		});

		const result = await executeTool(input);

		expect(result.conditions.closestIndicatorSimilarity).toBe(0);
		expect(result.shouldTrigger).toBe(true);
	});

	test("should include all conditions in output", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			regimeGapDetails: "Test details",
			closestIndicatorSimilarity: 0.4,
			activeIndicatorCount: 5,
			maxIndicatorCapacity: 15,
		});

		const result = await executeTool(input);

		// Verify all condition fields are present
		expect(result.conditions).toMatchObject({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
			regimeGapDetails: "Test details",
			closestIndicatorSimilarity: 0.4,
			activeIndicatorCount: 5,
			maxIndicatorCapacity: 15,
		});
		expect(typeof result.conditions.rollingIC30Day).toBe("number");
		expect(typeof result.conditions.icDecayDays).toBe("number");
		expect(typeof result.conditions.existingIndicatorsUnderperforming).toBe("boolean");
		expect(typeof result.conditions.daysSinceLastAttempt).toBe("number");
	});

	test("should provide actionable recommendation", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
		});

		const result = await executeTool(input);

		expect(result.recommendation).toBeTruthy();
		expect(result.recommendation.length).toBeGreaterThan(10);
		// Recommendation should mention the regime
		expect(result.recommendation).toContain("HIGH_VOL");
	});
});

// ============================================
// Output Format Tests
// ============================================

describe("checkIndicatorTrigger - Output Format", () => {
	test("should return all required output fields", async () => {
		const input = createBaseInput();
		const result = await executeTool(input);

		expect(result).toHaveProperty("shouldTrigger");
		expect(result).toHaveProperty("triggerReason");
		expect(result).toHaveProperty("conditions");
		expect(result).toHaveProperty("summary");
		expect(result).toHaveProperty("recommendation");
	});

	test("should return null triggerReason when not triggering", async () => {
		const input = createBaseInput({
			regimeGapDetected: false,
			icHistory: createICHistory(30, 0.05),
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(false);
		expect(result.triggerReason).toBeNull();
	});

	test("should return non-null triggerReason when triggering", async () => {
		const input = createBaseInput({
			regimeGapDetected: true,
			currentRegime: "HIGH_VOL",
		});

		const result = await executeTool(input);

		expect(result.shouldTrigger).toBe(true);
		expect(result.triggerReason).not.toBeNull();
		expect(typeof result.triggerReason).toBe("string");
	});
});
