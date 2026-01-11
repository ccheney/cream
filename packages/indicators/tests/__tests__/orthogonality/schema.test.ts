/**
 * Schema Validation Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import { OrthogonalityInputSchema } from "../../../src/synthesis/orthogonality.js";

describe("OrthogonalityInputSchema", () => {
  test("validates minimal input", () => {
    const input = {
      newIndicator: [1, 2, 3, 4, 5],
      existingIndicators: {
        indicator1: [5, 4, 3, 2, 1],
      },
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
    };

    const result = OrthogonalityInputSchema.parse(input);
    expect(result.maxCorrelation).toBe(0.7);
    expect(result.maxVIF).toBe(5.0);
    expect(result.minObservations).toBe(30);
  });

  test("rejects invalid correlation threshold", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
      maxCorrelation: 1.5,
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects negative VIF threshold", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
      maxVIF: -1,
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
