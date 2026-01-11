/**
 * Tests for edge cases in IC calculations
 */

import { describe, expect, test } from "bun:test";
import { calculateICStats } from "../../../src/synthesis/ic/index.js";
import { createMockICValues } from "./fixtures.js";

describe("edge cases", () => {
  test("handles empty arrays", () => {
    const stats = calculateICStats([]);
    expect(stats.mean).toBe(0);
    expect(stats.nValidObservations).toBe(0);
  });

  test("handles single observation", () => {
    const icValues = [{ ic: 0.05, nObservations: 50, isValid: true }];
    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0.05);
    expect(stats.std).toBe(0); // Single observation has 0 variance
    expect(stats.nValidObservations).toBe(1);
  });

  test("handles all zeros IC", () => {
    const icValues = createMockICValues(10, { ic: 0 });

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0);
    expect(stats.std).toBe(0);
    expect(stats.icir).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  test("handles negative ICs correctly", () => {
    const icValues = [
      { ic: -0.05, nObservations: 50, isValid: true },
      { ic: -0.03, nObservations: 50, isValid: true },
      { ic: -0.04, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBeCloseTo(-0.04, 10);
    expect(stats.hitRate).toBe(0); // All negative
  });
});
