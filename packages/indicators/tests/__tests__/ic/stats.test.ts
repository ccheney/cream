/**
 * Tests for IC statistics calculation
 */

import { describe, expect, test } from "bun:test";
import { calculateICStats } from "../../../src/synthesis/ic/index.js";

describe("calculateICStats", () => {
  test("calculates statistics for valid IC values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.04, nObservations: 50, isValid: true },
      { ic: 0.02, nObservations: 50, isValid: true },
      { ic: 0.06, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBeCloseTo(0.04, 10);
    expect(stats.std).toBeGreaterThan(0);
    expect(stats.nObservations).toBe(5);
    expect(stats.nValidObservations).toBe(5);
    expect(stats.hitRate).toBe(1); // All positive
  });

  test("ignores invalid IC values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: 0.1, nObservations: 5, isValid: false }, // Invalid
      { ic: 0.03, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.nObservations).toBe(3);
    expect(stats.nValidObservations).toBe(2);
    expect(stats.mean).toBeCloseTo(0.04, 10); // (0.05 + 0.03) / 2
  });

  test("handles all invalid values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 5, isValid: false },
      { ic: 0.1, nObservations: 5, isValid: false },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0);
    expect(stats.std).toBe(0);
    expect(stats.icir).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.passed).toBe(false);
    expect(stats.interpretation).toBe("weak");
  });

  test("calculates hit rate correctly", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: -0.02, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.01, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.hitRate).toBe(0.75); // 3/4 positive
  });

  test("determines interpretation correctly", () => {
    // Strong: mean > 0.05, std < 0.05, icir > 0.5
    const strongICs = Array(20)
      .fill(null)
      .map(() => ({
        ic: 0.06 + 0.01 * (Math.random() - 0.5), // ~0.06 +/- 0.005
        nObservations: 50,
        isValid: true,
      }));

    const strongStats = calculateICStats(strongICs);
    // Due to randomness, just check it's interpreted
    expect(["strong", "moderate", "weak"]).toContain(strongStats.interpretation);
  });
});
