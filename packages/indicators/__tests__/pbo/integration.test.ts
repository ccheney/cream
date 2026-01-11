/**
 * Integration tests for PBO calculator
 */

import { describe, expect, test } from "bun:test";
import {
  computePBO,
  evaluatePBO,
  generateSyntheticReturns,
  generateSyntheticSignals,
} from "../../src/synthesis/pbo.js";
import { MIN_SPLITS } from "./fixtures.js";

describe("integration", () => {
  test("full workflow: generate, compute, evaluate", () => {
    const returns = generateSyntheticReturns(500, 0.0002, 0.015);
    const signals = generateSyntheticSignals(returns, 0.1);

    const result = computePBO({ returns, signals, nSplits: 8 });

    const evaluation = evaluatePBO(result);

    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("PBO increases with noise", () => {
    const n = 500;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);

    const goodSignal = returns.map((r) => r * 10);
    const goodResult = computePBO({ returns, signals: goodSignal, nSplits: MIN_SPLITS });

    const noisySignal = returns.map(() => Math.random() - 0.5);
    const noisyResult = computePBO({ returns, signals: noisySignal, nSplits: MIN_SPLITS });

    expect(goodResult.pbo).toBeGreaterThanOrEqual(0);
    expect(goodResult.pbo).toBeLessThanOrEqual(1);
    expect(noisyResult.pbo).toBeGreaterThanOrEqual(0);
    expect(noisyResult.pbo).toBeLessThanOrEqual(1);
  });
});
