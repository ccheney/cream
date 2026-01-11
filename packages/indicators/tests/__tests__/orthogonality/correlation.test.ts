/**
 * Correlation Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import {
  computePairwiseCorrelations,
  pearsonCorrelation,
} from "../../../src/synthesis/orthogonality.js";
import { generateCorrelated, generateIndicator } from "./fixtures.js";

describe("pearsonCorrelation", () => {
  test("returns 1 for identical arrays", () => {
    const x = [1, 2, 3, 4, 5];
    const { correlation, n } = pearsonCorrelation(x, x);
    expect(correlation).toBeCloseTo(1.0, 10);
    expect(n).toBe(5);
  });

  test("returns -1 for perfectly negatively correlated", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 4, 3, 2, 1];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBeCloseTo(-1.0, 10);
  });

  test("returns ~0 for uncorrelated data", () => {
    const x = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    const y = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBeCloseTo(-1.0, 5);
  });

  test("handles NaN values by excluding them", () => {
    const x = [1, Number.NaN, 3, 4, 5];
    const y = [1, 2, Number.NaN, 4, 5];
    const { correlation, n } = pearsonCorrelation(x, y);
    expect(n).toBe(3);
    expect(correlation).toBeCloseTo(1.0, 10);
  });

  test("returns 0 for arrays with < 2 valid points", () => {
    const x = [1, Number.NaN, Number.NaN];
    const y = [Number.NaN, 2, Number.NaN];
    const { correlation, n } = pearsonCorrelation(x, y);
    expect(n).toBe(0);
    expect(correlation).toBe(0);
  });

  test("returns 0 for constant arrays", () => {
    const x = [5, 5, 5, 5, 5];
    const y = [1, 2, 3, 4, 5];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBe(0);
  });

  test("throws for mismatched lengths", () => {
    const x = [1, 2, 3];
    const y = [1, 2];
    expect(() => pearsonCorrelation(x, y)).toThrow();
  });
});

describe("computePairwiseCorrelations", () => {
  test("computes correlations with multiple indicators", () => {
    const n = 100;
    const base = generateIndicator(n);
    const highCorr = generateCorrelated(base, 0.9);
    const lowCorr = generateCorrelated(base, 0.2);

    const results = computePairwiseCorrelations(base, {
      highCorrelated: highCorr,
      lowCorrelated: lowCorr,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.name).toBe("highCorrelated");
    expect(Math.abs(results[0]!.correlation)).toBeGreaterThan(0.7);
    expect(Math.abs(results[1]!.correlation)).toBeLessThan(0.5);
  });

  test("marks high correlations as unacceptable", () => {
    const n = 100;
    const base = generateIndicator(n);
    const highCorr = generateCorrelated(base, 0.9);

    const results = computePairwiseCorrelations(
      base,
      { correlated: highCorr },
      { maxCorrelation: 0.7 }
    );

    expect(results[0]!.isAcceptable).toBe(false);
  });

  test("marks moderate correlations as warnings", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const modCorr = [6, 3, 7, 4, 8, 5, 9, 6, 10, 7];

    const results = computePairwiseCorrelations(
      base,
      { moderate: modCorr },
      { maxCorrelation: 0.7, correlationWarning: 0.5, minObservations: 5 }
    );

    const absCorr = Math.abs(results[0]!.correlation);
    expect(absCorr).toBeGreaterThanOrEqual(0.5);
    expect(absCorr).toBeLessThan(0.7);
    expect(results[0]!.isAcceptable).toBe(true);
    expect(results[0]!.isWarning).toBe(true);
  });

  test("handles empty existing indicators", () => {
    const base = generateIndicator(50);
    const results = computePairwiseCorrelations(base, {});
    expect(results).toHaveLength(0);
  });

  test("handles different length indicators by truncating", () => {
    const newInd = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const existing = [1, 2, 3, 4, 5];

    const results = computePairwiseCorrelations(newInd, { short: existing });

    expect(results).toHaveLength(1);
    expect(results[0]!.nObservations).toBe(5);
  });
});
