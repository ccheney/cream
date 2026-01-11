/**
 * Tests for walk-forward helper functions.
 */

import { describe, expect, test } from "bun:test";
import {
  evaluateWalkForward,
  isWalkForwardRobust,
  minimumWalkForwardLength,
  WF_DEFAULTS,
} from "../../../src/synthesis/walkForward.js";
import { createMarginalResult, createOverfitResult, createRobustResult } from "./fixtures.js";

describe("isWalkForwardRobust", () => {
  test("returns true when thresholds pass", () => {
    const result = createRobustResult();
    expect(isWalkForwardRobust(result)).toBe(true);
  });

  test("returns false when efficiency is low", () => {
    const result = createRobustResult({
      efficiency: 0.3,
      degradation: 0.7,
      meanOutOfSampleSharpe: 0.45,
      interpretation: "overfit",
      passed: false,
    });
    expect(isWalkForwardRobust(result)).toBe(false);
  });

  test("respects custom thresholds", () => {
    const result = createMarginalResult();

    expect(isWalkForwardRobust(result)).toBe(false);
    expect(isWalkForwardRobust(result, { minEfficiency: 0.3, minConsistency: 0.4 })).toBe(true);
  });
});

describe("evaluateWalkForward", () => {
  test("provides accept for robust", () => {
    const result = createRobustResult();
    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("robust");
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("provides review for marginal", () => {
    const result = createMarginalResult();
    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("review");
  });

  test("provides reject for overfit", () => {
    const result = createOverfitResult();
    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.summary).toContain("overfit");
  });

  test("includes all relevant details", () => {
    const result = createRobustResult({
      efficiency: 0.6,
      degradation: 0.4,
      consistency: 0.7,
      meanOutOfSampleSharpe: 0.9,
    });
    const evaluation = evaluateWalkForward(result);

    expect(evaluation.details.some((d) => d.includes("Method:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Periods:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Efficiency:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Consistency:"))).toBe(true);
  });
});

describe("minimumWalkForwardLength", () => {
  test("returns correct default minimum", () => {
    const minLength = minimumWalkForwardLength();
    expect(minLength).toBe(WF_DEFAULTS.nPeriods * WF_DEFAULTS.minObservationsPerPeriod);
  });

  test("scales with nPeriods", () => {
    expect(minimumWalkForwardLength(10)).toBe(10 * WF_DEFAULTS.minObservationsPerPeriod);
  });

  test("scales with minObsPerPeriod", () => {
    expect(minimumWalkForwardLength(5, 30)).toBe(5 * 30);
  });
});
