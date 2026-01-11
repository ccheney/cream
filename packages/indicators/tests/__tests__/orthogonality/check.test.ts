/**
 * Main Orthogonality Check Tests
 */

import { describe, expect, test } from "bun:test";
import { checkOrthogonality } from "../../../src/synthesis/orthogonality.js";
import { generateCorrelated, generateIndicator } from "./fixtures.js";

describe("checkOrthogonality", () => {
  test("accepts independent indicator", () => {
    const n = 100;
    const existing = { ind1: generateIndicator(n), ind2: generateIndicator(n) };
    const newInd = generateIndicator(n);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: existing,
    });

    expect(result.isOrthogonal).toBe(true);
    expect(Math.abs(result.maxCorrelationFound)).toBeLessThan(0.7);
    expect(result.summary).toContain("orthogonal");
  });

  test("rejects highly correlated indicator", () => {
    const n = 100;
    const source = generateIndicator(n);
    const highlyCorrelated = generateCorrelated(source, 0.9);

    const result = checkOrthogonality({
      newIndicator: highlyCorrelated,
      existingIndicators: { source },
      maxCorrelation: 0.7,
    });

    expect(result.isOrthogonal).toBe(false);
    expect(result.mostCorrelatedWith).toBe("source");
    expect(result.summary).toContain("correlation");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test("rejects high VIF indicator", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    const ind2 = generateIndicator(n);
    const linearCombination = ind1.map((v, i) => v + ind2[i]!);

    const result = checkOrthogonality({
      newIndicator: linearCombination,
      existingIndicators: { ind1, ind2 },
      maxVIF: 5,
    });

    expect(result.isOrthogonal).toBe(false);
    expect(result.vif).not.toBeNull();
    expect(result.vif!.vif).toBeGreaterThan(5);
  });

  test("handles empty existing indicators", () => {
    const newInd = generateIndicator(50);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: {},
    });

    expect(result.isOrthogonal).toBe(true);
    expect(result.correlations).toHaveLength(0);
    expect(result.vif).toBeNull();
  });

  test("handles single existing indicator (no VIF)", () => {
    const n = 100;
    const existing = generateIndicator(n);
    const newInd = generateIndicator(n);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: { existing },
    });

    expect(result.vif).toBeNull();
    expect(result.correlations).toHaveLength(1);
  });

  test("includes thresholds in result", () => {
    const result = checkOrthogonality({
      newIndicator: [1, 2, 3, 4, 5],
      existingIndicators: {},
      maxCorrelation: 0.6,
      maxVIF: 4.0,
      minObservations: 20,
    });

    expect(result.thresholds.maxCorrelation).toBe(0.6);
    expect(result.thresholds.maxVIF).toBe(4.0);
    expect(result.thresholds.minObservations).toBe(20);
  });
});
