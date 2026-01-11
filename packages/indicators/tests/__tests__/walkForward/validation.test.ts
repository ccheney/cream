/**
 * Tests for core walkForwardValidation functionality.
 */

import { describe, expect, test } from "bun:test";
import { walkForwardValidation } from "../../../src/synthesis/walkForward.js";
import { generateReturns, generateSignals } from "./fixtures.js";

describe("walkForwardValidation", () => {
  test("throws if returns and signals have different lengths", () => {
    expect(() =>
      walkForwardValidation({
        returns: [0.01, 0.02, 0.03],
        signals: [1, -1],
      })
    ).toThrow("same length");
  });

  test("throws if insufficient data for periods", () => {
    const returns = Array(50).fill(0.01);
    const signals = Array(50).fill(1);

    expect(() =>
      walkForwardValidation({
        returns,
        signals,
        nPeriods: 5,
      })
    ).toThrow("Insufficient data");
  });

  test("performs rolling walk-forward validation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
      method: "rolling",
    });

    expect(result.nPeriods).toBe(5);
    expect(result.method).toBe("rolling");
    expect(result.periods).toHaveLength(5);
    expect(result.efficiency).toBeDefined();
    expect(result.consistency).toBeGreaterThanOrEqual(0);
    expect(result.consistency).toBeLessThanOrEqual(1);
  });

  test("performs anchored walk-forward validation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
      method: "anchored",
    });

    expect(result.nPeriods).toBe(5);
    expect(result.method).toBe("anchored");
    expect(result.periods).toHaveLength(5);
  });

  test("calculates correct efficiency", () => {
    const n = 200;
    const returns = generateReturns(n, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.efficiency).toBeDefined();
    expect(typeof result.efficiency).toBe("number");
  });

  test("calculates correct consistency", () => {
    const n = 200;
    const returns = generateReturns(n, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    const manualConsistency =
      result.periods.filter((p) => p.oosPositive).length / result.periods.length;
    expect(result.consistency).toBeCloseTo(manualConsistency, 10);
  });

  test("period details are correct", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
      trainRatio: 0.8,
    });

    for (const period of result.periods) {
      expect(period.periodIndex).toBeGreaterThanOrEqual(0);
      expect(period.nInSample).toBeGreaterThan(0);
      expect(period.nOutOfSample).toBeGreaterThan(0);
      expect(typeof period.inSampleSharpe).toBe("number");
      expect(typeof period.outOfSampleSharpe).toBe("number");
    }
  });

  test("degradation is 1 - efficiency", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.degradation).toBeCloseTo(1 - result.efficiency, 10);
  });
});
