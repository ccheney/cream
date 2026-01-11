/**
 * Integration tests for IC calculator
 */

import { describe, expect, test } from "bun:test";
import { analyzeIC, calculateICStats, evaluateIC } from "../../../src/synthesis/ic/index.js";
import { REALISTIC_IC_VALUES } from "./fixtures.js";

describe("integration", () => {
  test("full workflow: generate data, analyze, evaluate", () => {
    // Generate mock data with some signal
    const nTime = 60;
    const nAssets = 20;

    const signals: number[][] = [];
    const forwardReturns: number[][] = [];
    const returns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        const signal = Math.random() * 2 - 1;
        // Add some predictive power
        const ret = signal * 0.001 + (Math.random() - 0.5) * 0.02;
        sigRow.push(signal);
        retRow.push(ret);
      }
      signals.push(sigRow);
      forwardReturns.push(retRow);
      returns.push(retRow);
    }

    // Analyze
    const result = analyzeIC(signals, forwardReturns, {
      includeDecay: true,
      returns,
      horizons: [1, 5, 10],
    });

    // Evaluate
    const evaluation = evaluateIC(result);

    // Check complete workflow
    expect(result.stats.mean).toBeDefined();
    expect(result.stats.icir).toBeDefined();
    expect(result.decay).toBeDefined();
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("realistic factor IC values", () => {
    // In practice, good factors have IC of 0.02-0.10
    const stats = calculateICStats(REALISTIC_IC_VALUES);

    // Expected for a decent factor
    expect(stats.mean).toBeGreaterThan(0.02);
    expect(stats.mean).toBeLessThan(0.05);
    expect(stats.hitRate).toBeGreaterThan(0.8);
  });
});
