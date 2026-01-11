/**
 * Tests for walk-forward edge cases.
 */

import { describe, expect, test } from "bun:test";
import { walkForwardValidation } from "../../../src/synthesis/walkForward.js";
import { generateReturns, generateSignals } from "./fixtures.js";

describe("edge cases", () => {
  test("handles all positive returns", () => {
    const n = 200;
    const returns = Array(n)
      .fill(0)
      .map(() => 0.01 + Math.random() * 0.005);
    const signals = Array(n).fill(1);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
    expect(Number.isNaN(result.efficiency)).toBe(false);
  });

  test("handles all negative returns", () => {
    const n = 200;
    const returns = Array(n)
      .fill(0)
      .map(() => -0.01 - Math.random() * 0.005);
    const signals = Array(n).fill(-1);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
    expect(Number.isNaN(result.efficiency)).toBe(false);
  });

  test("handles alternating signals", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = returns.map((_, i) => (i % 2 === 0 ? 1 : -1));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
  });

  test("handles minimum viable data", () => {
    const n = 100;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
    });

    expect(result.nPeriods).toBeGreaterThan(0);
  });
});
