/**
 * Tests for PBO edge cases and error handling
 */

import { describe, expect, test } from "bun:test";
import { computePBO, generateSyntheticReturns } from "../../src/synthesis/pbo.js";
import { MIN_SPLITS, STANDARD_DATA_SIZE } from "./fixtures.js";

describe("edge cases", () => {
  test("handles all positive returns", () => {
    const returns = Array(STANDARD_DATA_SIZE).fill(0.01);
    const signals = Array(STANDARD_DATA_SIZE).fill(1);

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });

  test("handles all negative returns", () => {
    const returns = Array(STANDARD_DATA_SIZE).fill(-0.01);
    const signals = Array(STANDARD_DATA_SIZE).fill(-1);

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });

  test("handles mixed positive and negative signals", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE);
    const signals = returns.map((_, i) => (i % 2 === 0 ? 1 : -1));

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    expect(result.pbo).toBeDefined();
    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
  });

  test("handles very small signals", () => {
    const returns = generateSyntheticReturns(STANDARD_DATA_SIZE);
    const signals = returns.map(() => 0.0001 * (Math.random() - 0.5));

    const result = computePBO({ returns, signals, nSplits: MIN_SPLITS });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });
});
