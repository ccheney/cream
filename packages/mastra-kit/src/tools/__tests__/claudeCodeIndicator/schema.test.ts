/**
 * Schema tests for Claude Code Indicator
 *
 * Tests for ImplementIndicatorInputSchema and ImplementIndicatorOutputSchema validation.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "PAPER";
process.env.CREAM_BROKER = "ALPACA";

import { describe, expect, test } from "bun:test";
import {
  ImplementIndicatorInputSchema,
  ImplementIndicatorOutputSchema,
} from "../../claudeCodeIndicator.js";
import { createMockHypothesis, mockExistingPatterns } from "./fixtures.js";

describe("ImplementIndicatorInputSchema", () => {
  test("parses valid input with minimal fields", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hypothesis.name).toBe("sector_rotation_momentum");
      expect(result.data.existingPatterns).toBe(mockExistingPatterns);
    }
  });

  test("parses valid input with config overrides", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        model: "claude-opus-4-20250514",
        maxTurns: 30,
        timeout: 300000,
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config?.model).toBe("claude-opus-4-20250514");
      expect(result.data.config?.maxTurns).toBe(30);
      expect(result.data.config?.timeout).toBe(300000);
    }
  });

  test("rejects maxTurns below minimum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        maxTurns: 2, // Below min of 5
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects maxTurns above maximum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        maxTurns: 100, // Above max of 50
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects timeout below minimum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        timeout: 10000, // Below min of 30000
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects timeout above maximum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        timeout: 1000000, // Above max of 600000
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects missing hypothesis", () => {
    const input = {
      existingPatterns: mockExistingPatterns,
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects missing existingPatterns", () => {
    const input = {
      hypothesis: createMockHypothesis(),
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("ImplementIndicatorOutputSchema", () => {
  test("parses successful output", () => {
    const output = {
      success: true,
      indicatorPath: "packages/indicators/src/custom/test_indicator.ts",
      testPath: "packages/indicators/src/custom/test_indicator.test.ts",
      astSimilarity: 0.25,
      turnsUsed: 15,
      testsPassed: true,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.astSimilarity).toBe(0.25);
    }
  });

  test("parses failed output with error", () => {
    const output = {
      success: false,
      error: "Claude Agent SDK not installed",
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe("Claude Agent SDK not installed");
    }
  });

  test("rejects astSimilarity below 0", () => {
    const output = {
      success: true,
      astSimilarity: -0.1,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test("rejects astSimilarity above 1", () => {
    const output = {
      success: true,
      astSimilarity: 1.5,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
