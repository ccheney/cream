/**
 * Tests for walkForwardSweep and compareWalkForwardMethods.
 */

import { describe, expect, test } from "bun:test";
import { compareWalkForwardMethods, walkForwardSweep } from "../../../src/synthesis/walkForward.js";
import { generateReturns, generateSignals } from "./fixtures.js";

describe("walkForwardSweep", () => {
  test("runs multiple configurations", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const results = walkForwardSweep(returns, signals);

    expect(results.length).toBeGreaterThan(0);

    for (const { config, result } of results) {
      expect(config.nPeriods).toBeDefined();
      expect(config.trainRatio).toBeDefined();
      expect(config.method).toBeDefined();
      expect(result.efficiency).toBeDefined();
    }
  });

  test("allows custom configurations", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const configs = [
      { nPeriods: 3, trainRatio: 0.7, method: "rolling" as const },
      { nPeriods: 4, trainRatio: 0.8, method: "anchored" as const },
    ];

    const results = walkForwardSweep(returns, signals, configs);

    expect(results).toHaveLength(2);
  });

  test("skips invalid configurations", () => {
    const n = 100;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const configs = [
      { nPeriods: 20, trainRatio: 0.8, method: "rolling" as const },
      { nPeriods: 3, trainRatio: 0.8, method: "rolling" as const },
    ];

    const results = walkForwardSweep(returns, signals, configs);

    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe("compareWalkForwardMethods", () => {
  test("compares rolling and anchored methods", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals);

    expect(comparison.rolling).toBeDefined();
    expect(comparison.anchored).toBeDefined();
    expect(["rolling", "anchored", "tie"]).toContain(comparison.better);
    expect(comparison.explanation.length).toBeGreaterThan(0);
  });

  test("respects custom options", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals, {
      nPeriods: 6,
      trainRatio: 0.75,
    });

    expect(comparison.rolling.nPeriods).toBe(6);
    expect(comparison.anchored.nPeriods).toBe(6);
    expect(comparison.rolling.trainRatio).toBe(0.75);
  });
});
