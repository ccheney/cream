/**
 * Tests for synthetic data generation
 */

import { describe, expect, test } from "bun:test";
import { generateSyntheticReturns, generateSyntheticSignals } from "../../src/synthesis/pbo.js";

describe("generateSyntheticReturns", () => {
  test("generates correct number of returns", () => {
    const returns = generateSyntheticReturns(100);
    expect(returns).toHaveLength(100);
  });

  test("returns have approximately correct mean", () => {
    const drift = 0.001;
    const returns = generateSyntheticReturns(10000, drift, 0.02);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

    const se = 0.02 / Math.sqrt(10000);
    expect(Math.abs(mean - drift)).toBeLessThan(3 * se);
  });

  test("returns have approximately correct volatility", () => {
    const volatility = 0.02;
    const returns = generateSyntheticReturns(10000, 0, volatility);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.map((r) => (r - mean) ** 2).reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(variance);

    expect(Math.abs(std - volatility) / volatility).toBeLessThan(0.1);
  });
});

describe("generateSyntheticSignals", () => {
  test("generates correct number of signals", () => {
    const returns = generateSyntheticReturns(100);
    const signals = generateSyntheticSignals(returns);
    expect(signals).toHaveLength(100);
  });

  test("signals have some correlation with returns for positive IC", () => {
    const returns = generateSyntheticReturns(1000, 0, 0.02);
    const signals = generateSyntheticSignals(returns, 0.3);

    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
    const meanS = signals.reduce((a, b) => a + b, 0) / signals.length;

    let cov = 0;
    let varR = 0;
    let varS = 0;
    for (let i = 0; i < returns.length; i++) {
      const rVal = returns[i] ?? 0;
      const sVal = signals[i] ?? 0;
      cov += (rVal - meanR) * (sVal - meanS);
      varR += (rVal - meanR) ** 2;
      varS += (sVal - meanS) ** 2;
    }

    const corr = cov / Math.sqrt(varR * varS);

    expect(corr).toBeGreaterThan(0);
  });
});
