/**
 * Tests for individual validation gates: DSR, PBO, IC, Walk-Forward, Orthogonality.
 */

import { describe, expect, test } from "bun:test";
import { runValidationPipeline } from "../../../src/synthesis/validationPipeline/index.js";
import {
  DEFAULT_N,
  generatePredictiveSignals,
  generateRandomSignals,
  generateReturns,
} from "./fixtures.js";

describe("DSR Gate", () => {
  test("penalizes many trials", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result1 = runValidationPipeline({
      indicatorId: "few-trials",
      signals,
      returns,
      nTrials: 1,
    });

    const result100 = runValidationPipeline({
      indicatorId: "many-trials",
      signals,
      returns,
      nTrials: 100,
    });

    expect(result1.dsr.pValue).toBeLessThanOrEqual(result100.dsr.pValue);
  });

  test("reports failure reason", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generateRandomSignals(DEFAULT_N);

    const result = runValidationPipeline({
      indicatorId: "low-dsr",
      signals,
      returns,
      nTrials: 50,
    });

    if (!result.dsr.passed) {
      expect(result.dsr.reason).toBeDefined();
      expect(result.dsr.reason).toContain("DSR");
    }
  });
});

describe("PBO Gate", () => {
  test("uses CSCV method", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "pbo-test",
      signals,
      returns,
    });

    expect(result.pbo.nSplits).toBe(8);
    expect(result.pbo.nCombinations).toBe(70);
  });

  test("value between 0 and 1", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generateRandomSignals(DEFAULT_N);

    const result = runValidationPipeline({
      indicatorId: "pbo-bounds",
      signals,
      returns,
    });

    expect(result.pbo.value).toBeGreaterThanOrEqual(0);
    expect(result.pbo.value).toBeLessThanOrEqual(1);
  });
});

describe("IC Gate", () => {
  test("computes IC statistics", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "ic-test",
      signals,
      returns,
    });

    expect(result.ic.mean).toBeDefined();
    expect(result.ic.std).toBeDefined();
    expect(result.ic.icir).toBeDefined();
    expect(result.ic.hitRate).toBeDefined();
    expect(result.ic.hitRate).toBeGreaterThanOrEqual(0);
    expect(result.ic.hitRate).toBeLessThanOrEqual(1);
  });

  test("uses forward returns when provided", () => {
    const returns = generateReturns(DEFAULT_N);
    const forwardReturns = returns.slice(1).concat([0]);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "ic-forward",
      signals,
      returns,
      forwardReturns,
    });

    expect(result.ic.nObservations).toBeGreaterThan(0);
  });
});

describe("Walk-Forward Gate", () => {
  test("computes efficiency metrics", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "wf-test",
      signals,
      returns,
    });

    expect(result.walkForward.efficiency).toBeDefined();
    expect(result.walkForward.consistency).toBeDefined();
    expect(result.walkForward.degradation).toBeDefined();
    expect(result.walkForward.nPeriods).toBeGreaterThan(0);
  });

  test("degradation is 1 - efficiency", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "wf-degradation",
      signals,
      returns,
    });

    expect(result.walkForward.degradation).toBeCloseTo(1 - result.walkForward.efficiency, 5);
  });
});

describe("Orthogonality Gate", () => {
  test("passes with no existing indicators", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "orth-empty",
      signals,
      returns,
      existingIndicators: {},
    });

    expect(result.orthogonality.passed).toBe(true);
    expect(result.orthogonality.nExistingIndicators).toBe(0);
  });

  test("detects high correlation", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);
    const correlated = signals.map((s) => s * 1.1 + 0.01);

    const result = runValidationPipeline({
      indicatorId: "orth-correlated",
      signals,
      returns,
      existingIndicators: { correlated },
    });

    expect(result.orthogonality.maxCorrelation).toBeGreaterThan(0.9);
    expect(result.orthogonality.correlatedWith).toBe("correlated");
    expect(result.orthogonality.passed).toBe(false);
  });

  test("accepts uncorrelated signals", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);
    const uncorrelated = generateRandomSignals(DEFAULT_N);

    const result = runValidationPipeline({
      indicatorId: "orth-uncorrelated",
      signals,
      returns,
      existingIndicators: { uncorrelated },
    });

    expect(Math.abs(result.orthogonality.maxCorrelation)).toBeLessThan(0.7);
    expect(result.orthogonality.passed).toBe(true);
  });
});
