/**
 * Tests for correlation functions (Pearson and Spearman)
 */

import { describe, expect, test } from "bun:test";
import { pearsonCorrelation, spearmanCorrelation } from "../../../src/synthesis/ic/index.js";

describe("pearsonCorrelation", () => {
  test("returns 1 for perfectly correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10]; // y = 2x
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(1, 10);
  });

  test("returns -1 for perfectly anti-correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2]; // y = -2x + 12
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(-1, 10);
  });

  test("returns 0 for uncorrelated data", () => {
    // x and x^2 centered around mean are uncorrelated
    const x = [-2, -1, 0, 1, 2];
    const y = [4, 1, 0, 1, 4]; // y = x^2, uncorrelated with x for symmetric range
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(0, 10);
  });

  test("returns 0 for single element", () => {
    const x = [1];
    const y = [2];
    expect(pearsonCorrelation(x, y)).toBe(0);
  });

  test("returns 0 for constant arrays", () => {
    const x = [5, 5, 5, 5];
    const y = [3, 3, 3, 3];
    expect(pearsonCorrelation(x, y)).toBe(0);
  });
});

describe("spearmanCorrelation", () => {
  test("returns 1 for monotonically increasing relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 4, 9, 16, 25]; // y = x^2, monotonically increasing
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeCloseTo(1, 10);
  });

  test("returns -1 for monotonically decreasing relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [100, 50, 25, 10, 1]; // Decreasing
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeCloseTo(-1, 10);
  });

  test("handles tied values correctly", () => {
    const x = [1, 2, 2, 3, 4];
    const y = [1, 2, 3, 4, 5];
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeGreaterThan(0.8);
    expect(corr).toBeLessThan(1);
  });

  test("throws if arrays have different lengths", () => {
    const x = [1, 2, 3];
    const y = [1, 2];
    expect(() => spearmanCorrelation(x, y)).toThrow("same length");
  });
});
