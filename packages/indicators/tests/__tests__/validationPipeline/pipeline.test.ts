/**
 * Tests for validation pipeline integration.
 */

import { describe, expect, test } from "bun:test";
import { runValidationPipeline } from "../../../src/synthesis/validationPipeline/index.js";
import {
  DEFAULT_N,
  generatePredictiveSignals,
  generateRandomSignals,
  generateReturns,
} from "./fixtures.js";

describe("runValidationPipeline", () => {
  test("returns complete validation result", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "test-indicator",
      signals,
      returns,
      nTrials: 10,
    });

    expect(result.indicatorId).toBe("test-indicator");
    expect(result.timestamp).toBeDefined();
    expect(result.dsr).toBeDefined();
    expect(result.pbo).toBeDefined();
    expect(result.ic).toBeDefined();
    expect(result.walkForward).toBeDefined();
    expect(result.orthogonality).toBeDefined();
    expect(result.trials).toBeDefined();
    expect(typeof result.overallPassed).toBe("boolean");
    expect(result.gatesPassed).toBeGreaterThanOrEqual(0);
    expect(result.gatesPassed).toBeLessThanOrEqual(result.totalGates);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
    expect(result.summary).toBeDefined();
    expect(result.recommendations).toBeInstanceOf(Array);
  });

  test("random signals fail validation", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generateRandomSignals(DEFAULT_N);

    const result = runValidationPipeline({
      indicatorId: "random-signals",
      signals,
      returns,
      nTrials: 100,
    });

    expect(result.dsr.nTrials).toBe(100);
    expect(result.passRate).toBeLessThan(1);
  });

  test("handles single trial", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.5);

    const result = runValidationPipeline({
      indicatorId: "single-trial",
      signals,
      returns,
      nTrials: 1,
    });

    expect(result.trials.attempted).toBe(1);
    expect(result.trials.multipleTestingPenalty).toBe(0);
  });

  test("includes existing indicators in orthogonality check", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.3);
    const existingSignals = generatePredictiveSignals(returns, 0.4);

    const result = runValidationPipeline({
      indicatorId: "with-existing",
      signals,
      returns,
      existingIndicators: {
        existing1: existingSignals,
      },
    });

    expect(result.orthogonality.nExistingIndicators).toBe(1);
  });

  test("uses custom thresholds when provided", () => {
    const returns = generateReturns(DEFAULT_N);
    const signals = generatePredictiveSignals(returns, 0.2);

    const result = runValidationPipeline({
      indicatorId: "custom-thresholds",
      signals,
      returns,
      thresholds: {
        dsrPValue: 0.5,
        pbo: 0.9,
        icMean: 0.001,
        icStd: 0.5,
        wfEfficiency: 0.1,
      },
    });

    expect(result).toBeDefined();
  });
});
