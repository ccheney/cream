/**
 * Tests for PBO helper functions
 */

import { describe, expect, test } from "bun:test";
import { evaluatePBO, isPBOAcceptable, minimumBacktestLength } from "../../src/synthesis/pbo.js";
import {
  createPBOResult,
  HIGH_RISK_RESULT,
  LOW_RISK_RESULT,
  MODERATE_RISK_RESULT,
} from "./fixtures.js";

describe("minimumBacktestLength", () => {
  test("returns at least 252 days", () => {
    expect(minimumBacktestLength(1)).toBeGreaterThanOrEqual(252);
    expect(minimumBacktestLength(5)).toBeGreaterThanOrEqual(252);
  });

  test("increases with more trials", () => {
    const len10 = minimumBacktestLength(10);
    const len100 = minimumBacktestLength(100);
    expect(len100).toBeGreaterThanOrEqual(len10);
  });

  test("increases for lower target Sharpe", () => {
    const highSharpe = minimumBacktestLength(10, 2.0);
    const lowSharpe = minimumBacktestLength(10, 0.5);
    expect(lowSharpe).toBeGreaterThan(highSharpe);
  });
});

describe("isPBOAcceptable", () => {
  test("returns true for low PBO", () => {
    const result = createPBOResult({
      pbo: 0.25,
      nUnderperformed: 17,
      meanOutOfSampleSharpe: 1.2,
      degradation: 0.2,
      interpretation: "low_risk",
    });

    expect(isPBOAcceptable(result)).toBe(true);
  });

  test("returns false for high PBO", () => {
    const result = createPBOResult({
      pbo: 0.65,
      nUnderperformed: 45,
      meanOutOfSampleSharpe: 0.5,
      degradation: 0.67,
      interpretation: "high_risk",
      passed: false,
    });

    expect(isPBOAcceptable(result)).toBe(false);
  });

  test("respects custom threshold", () => {
    const result = createPBOResult();

    expect(isPBOAcceptable(result, 0.3)).toBe(false);
    expect(isPBOAcceptable(result, 0.4)).toBe(true);
  });
});

describe("evaluatePBO", () => {
  test("provides accept recommendation for low_risk", () => {
    const evaluation = evaluatePBO(LOW_RISK_RESULT);
    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("low overfitting risk");
  });

  test("provides review recommendation for moderate_risk", () => {
    const evaluation = evaluatePBO(MODERATE_RISK_RESULT);
    expect(evaluation.recommendation).toBe("review");
    expect(evaluation.summary).toContain("moderate overfitting risk");
  });

  test("provides reject recommendation for high_risk", () => {
    const evaluation = evaluatePBO(HIGH_RISK_RESULT);
    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.summary).toContain("high overfitting risk");
  });

  test("includes relevant details", () => {
    const result = createPBOResult();

    const evaluation = evaluatePBO(result);

    expect(evaluation.details.some((d) => d.includes("PBO:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Combinations tested:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Mean IS Sharpe:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Mean OOS Sharpe:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("degradation"))).toBe(true);
  });
});
