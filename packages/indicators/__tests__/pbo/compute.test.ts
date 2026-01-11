/**
 * Tests for core PBO calculation
 */

import { describe, expect, test } from "bun:test";
import {
  computePBO,
  generateSyntheticReturns,
  generateSyntheticSignals,
  PBO_DEFAULTS,
} from "../../src/synthesis/pbo.js";
import { MIN_SPLITS, STANDARD_DATA_SIZE } from "./fixtures.js";

describe("computePBO", () => {
  test("throws if returns and signals have different lengths", () => {
    expect(() =>
      computePBO({
        returns: [0.01, 0.02, 0.03],
        signals: [1, -1],
      })
    ).toThrow("same length");
  });

  test("throws if insufficient data for splits", () => {
    const returns = Array(100).fill(0.01);
    const signals = Array(100).fill(1);

    expect(() => computePBO({ returns, signals })).toThrow("Insufficient data");
  });

  test("calculates PBO for sufficient data", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals });

    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
    expect(result.nCombinations).toBe(70);
  });

  test("returns correct number of combinations for different splits", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result4 = computePBO({ returns, signals, nSplits: 4 });
    expect(result4.nCombinations).toBe(6);

    const result6 = computePBO({ returns, signals, nSplits: 6 });
    expect(result6.nCombinations).toBe(20);
  });

  test("includes combination details when requested", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS }, true);

    expect(result.combinations).toBeDefined();
    expect(result.combinations).toHaveLength(6);
    expect(result.combinations?.[0]).toHaveProperty("trainIndices");
    expect(result.combinations?.[0]).toHaveProperty("testIndices");
  });

  test("calculates correct underperform count", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS }, true);

    const manualCount = result.combinations?.filter((c) => c.underperformed).length ?? 0;
    expect(result.nUnderperformed).toBe(manualCount);
    expect(result.pbo).toBeCloseTo(manualCount / 6, 10);
  });
});

describe("PBO interpretation", () => {
  test("low_risk when PBO < 0.30", () => {
    const n = STANDARD_DATA_SIZE;
    const returns = generateSyntheticReturns(n, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    if (result.pbo < 0.3) {
      expect(result.interpretation).toBe("low_risk");
    }
  });

  test("high_risk when PBO >= 0.50", () => {
    const n = STANDARD_DATA_SIZE;
    const returns = generateSyntheticReturns(n, 0, 0.02);
    const signals = returns.map(() => (Math.random() > 0.5 ? 1 : -1));

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    if (result.pbo >= 0.5) {
      expect(result.interpretation).toBe("high_risk");
    }
  });

  test("passed is true when PBO < threshold", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    expect(result.passed).toBe(result.pbo < PBO_DEFAULTS.acceptableThreshold);
  });

  test("degradation is calculated correctly", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    const expectedDegradation =
      result.meanInSampleSharpe !== 0
        ? 1 - result.meanOutOfSampleSharpe / result.meanInSampleSharpe
        : 0;

    expect(result.degradation).toBeCloseTo(expectedDegradation, 10);
  });
});
