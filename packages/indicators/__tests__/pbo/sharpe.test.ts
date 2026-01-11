/**
 * Tests for Sharpe ratio calculation
 */

import { describe, expect, test } from "bun:test";
import { computeSharpe } from "../../src/synthesis/pbo.js";

describe("computeSharpe", () => {
  test("returns 0 for empty array", () => {
    expect(computeSharpe([])).toBe(0);
  });

  test("returns 0 for single element", () => {
    expect(computeSharpe([0.01])).toBe(0);
  });

  test("returns 0 for constant returns", () => {
    const returns = Array(100).fill(0.001);
    expect(computeSharpe(returns)).toBe(0);
  });

  test("calculates positive Sharpe for positive drift", () => {
    const returns = Array(252)
      .fill(0)
      .map((_, i) => 0.001 + 0.02 * Math.sin(i * 0.1));
    const sharpe = computeSharpe(returns);
    expect(sharpe).toBeGreaterThan(0);
  });

  test("calculates negative Sharpe for negative drift", () => {
    const returns = Array(252)
      .fill(0)
      .map((_, i) => -0.002 + 0.02 * Math.sin(i * 0.1));
    const sharpe = computeSharpe(returns);
    expect(sharpe).toBeLessThan(0);
  });

  test("annualizes using factor", () => {
    const dailyReturns = [0.01, 0.02, -0.01, 0.015, -0.005];
    const sharpeDaily = computeSharpe(dailyReturns, 1);
    const sharpeAnnual = computeSharpe(dailyReturns, 252);
    expect(sharpeAnnual / sharpeDaily).toBeCloseTo(Math.sqrt(252), 5);
  });
});
