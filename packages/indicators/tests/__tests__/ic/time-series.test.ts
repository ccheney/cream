/**
 * Tests for time-series IC calculation
 */

import { describe, expect, test } from "bun:test";
import { timeSeriesIC } from "../../../src/synthesis/ic/index.js";

describe("timeSeriesIC", () => {
  test("calculates rolling IC correctly", () => {
    // Create 100 data points with consistent relationship
    const n = 100;
    const signals: number[] = [];
    const returns: number[] = [];

    for (let i = 0; i < n; i++) {
      signals.push(i);
      returns.push(i * 0.001); // Perfectly correlated
    }

    const icValues = timeSeriesIC(signals, returns, 20);

    // Should have n - window + 1 = 81 IC values
    expect(icValues).toHaveLength(n - 20 + 1);

    // All ICs should be ~1 (perfect correlation)
    const validICs = icValues.filter((v) => v.isValid);
    expect(validICs.length).toBeGreaterThan(0);
    for (const ic of validICs) {
      expect(ic.ic).toBeCloseTo(1, 5);
    }
  });

  test("handles window larger than data", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
    const icValues = timeSeriesIC(signals, returns, 10);

    expect(icValues).toHaveLength(0);
  });
});
