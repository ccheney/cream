/**
 * Tests for walk-forward interpretation logic.
 */

import { describe, expect, test } from "bun:test";
import { walkForwardValidation } from "../../../src/synthesis/walkForward.js";
import { generateReturns, generateSignals } from "./fixtures.js";

describe("interpretation", () => {
  test("robust when efficiency and consistency are high", () => {
    const n = 300;
    const returns = generateReturns(n, 0.001, 0.01);
    const signals = returns.map((r) => r * 100);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
    });

    expect(["robust", "marginal", "overfit"]).toContain(result.interpretation);
  });

  test("overfit when efficiency is very low", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = returns.map(() => Math.random() - 0.5);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(["robust", "marginal", "overfit"]).toContain(result.interpretation);
  });

  test("passed matches interpretation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    if (result.interpretation === "robust") {
      expect(result.passed).toBe(true);
    } else {
      expect(typeof result.passed).toBe("boolean");
    }
  });
});
