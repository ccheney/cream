/**
 * Integration tests for walk-forward validation workflow.
 */

import { describe, expect, test } from "bun:test";
import {
  compareWalkForwardMethods,
  evaluateWalkForward,
  type WalkForwardResult,
  walkForwardValidation,
} from "../../../src/synthesis/walkForward.js";
import { generateReturns, generateSignals } from "./fixtures.js";

describe("integration", () => {
  test("full workflow: generate, validate, evaluate", () => {
    const n = 300;
    const returns = generateReturns(n, 0.0002, 0.015);
    const signals = generateSignals(returns, 0.4);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 6,
      trainRatio: 0.75,
      method: "rolling",
    });

    const evaluation = evaluateWalkForward(result);

    expect(result.efficiency).toBeDefined();
    expect(result.periods.length).toBeGreaterThan(0);
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("compare and select best method", () => {
    const n = 300;
    const returns = generateReturns(n, 0.0001, 0.02);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals);

    let bestResult: WalkForwardResult;
    if (comparison.better === "rolling") {
      bestResult = comparison.rolling;
    } else if (comparison.better === "anchored") {
      bestResult = comparison.anchored;
    } else {
      bestResult = comparison.rolling;
    }

    expect(bestResult.efficiency).toBeDefined();
    expect(bestResult.consistency).toBeDefined();
  });
});
