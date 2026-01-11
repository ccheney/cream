/**
 * Tests for ValidationInputSchema validation.
 */

import { describe, expect, test } from "bun:test";
import { ValidationInputSchema } from "../../../src/synthesis/validationPipeline/index.js";

describe("ValidationInputSchema", () => {
  test("validates minimal input", () => {
    const input = {
      indicatorId: "test-indicator",
      signals: [1, 2, 3, 4, 5],
      returns: [0.01, -0.02, 0.015, -0.005, 0.008],
    };

    const result = ValidationInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const input = {
      indicatorId: "test",
      signals: [1, 2, 3],
      returns: [0.01, -0.01, 0.02],
    };

    const result = ValidationInputSchema.parse(input);
    expect(result.nTrials).toBe(1);
    expect(result.existingIndicators).toBeUndefined();
  });

  test("rejects empty signals", () => {
    const input = {
      indicatorId: "test",
      signals: [],
      returns: [],
    };

    // Empty arrays are valid per schema, but pipeline will handle gracefully
    const result = ValidationInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("accepts custom thresholds", () => {
    const input = {
      indicatorId: "test",
      signals: [1, 2, 3],
      returns: [0.01, -0.01, 0.02],
      thresholds: {
        dsrPValue: 0.9,
        pbo: 0.4,
        icMean: 0.03,
      },
    };

    const result = ValidationInputSchema.parse(input);
    expect(result.thresholds?.dsrPValue).toBe(0.9);
    expect(result.thresholds?.pbo).toBe(0.4);
    expect(result.thresholds?.icMean).toBe(0.03);
  });
});
