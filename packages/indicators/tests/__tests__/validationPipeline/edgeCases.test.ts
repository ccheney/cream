/**
 * Tests for edge cases in the validation pipeline.
 */

import { describe, expect, test } from "bun:test";
import { runValidationPipeline } from "../../../src/synthesis/validationPipeline/index.js";
import { generatePredictiveSignals, generateRandomSignals, generateReturns } from "./fixtures.js";

describe("Edge Cases", () => {
  test("handles short time series", () => {
    const n = 50;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "short-series",
      signals,
      returns,
    });

    expect(result).toBeDefined();
    expect(result.indicatorId).toBe("short-series");
  });

  test("handles constant signals", () => {
    const n = 100;
    const returns = generateReturns(n);
    const signals = Array(n).fill(1);

    const result = runValidationPipeline({
      indicatorId: "constant",
      signals,
      returns,
    });

    expect(result).toBeDefined();
    expect(result.ic.mean).toBe(0);
  });

  test("handles zero returns", () => {
    const n = 100;
    const returns = Array(n).fill(0);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "zero-returns",
      signals,
      returns,
    });

    expect(result).toBeDefined();
  });

  test("many existing indicators for VIF check", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const existingIndicators: Record<string, number[]> = {};
    for (let i = 0; i < 5; i++) {
      existingIndicators[`existing_${i}`] = generateRandomSignals(n);
    }

    const result = runValidationPipeline({
      indicatorId: "vif-test",
      signals,
      returns,
      existingIndicators,
    });

    expect(result.orthogonality.nExistingIndicators).toBe(5);
    expect(result.orthogonality.vif).toBeDefined();
  });
});
