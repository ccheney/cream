/**
 * Shared test fixtures for walk-forward validation tests.
 */

import type { WalkForwardResult } from "../../../src/synthesis/walkForward.js";

/**
 * Generate synthetic returns for testing using Box-Muller transform.
 */
export function generateReturns(n: number, drift = 0.0001, volatility = 0.02): number[] {
  const returns: number[] = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    returns.push(drift + volatility * z);
  }
  return returns;
}

/**
 * Generate synthetic signals correlated with returns.
 */
export function generateSignals(returns: number[], correlation = 0.5): number[] {
  return returns.map((r) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return correlation * r + (1 - correlation) * noise * 0.02;
  });
}

/**
 * Create a robust walk-forward result for testing.
 */
export function createRobustResult(overrides?: Partial<WalkForwardResult>): WalkForwardResult {
  return {
    efficiency: 0.7,
    degradation: 0.3,
    consistency: 0.8,
    meanInSampleSharpe: 1.5,
    meanOutOfSampleSharpe: 1.05,
    stdInSampleSharpe: 0.3,
    stdOutOfSampleSharpe: 0.4,
    nPeriods: 5,
    method: "rolling",
    trainRatio: 0.8,
    interpretation: "robust",
    passed: true,
    periods: [],
    ...overrides,
  };
}

/**
 * Create a marginal walk-forward result for testing.
 */
export function createMarginalResult(overrides?: Partial<WalkForwardResult>): WalkForwardResult {
  return {
    efficiency: 0.4,
    degradation: 0.6,
    consistency: 0.5,
    meanInSampleSharpe: 1.5,
    meanOutOfSampleSharpe: 0.6,
    stdInSampleSharpe: 0.3,
    stdOutOfSampleSharpe: 0.4,
    nPeriods: 5,
    method: "rolling",
    trainRatio: 0.8,
    interpretation: "marginal",
    passed: false,
    periods: [],
    ...overrides,
  };
}

/**
 * Create an overfit walk-forward result for testing.
 */
export function createOverfitResult(overrides?: Partial<WalkForwardResult>): WalkForwardResult {
  return {
    efficiency: 0.2,
    degradation: 0.8,
    consistency: 0.3,
    meanInSampleSharpe: 2.0,
    meanOutOfSampleSharpe: 0.4,
    stdInSampleSharpe: 0.3,
    stdOutOfSampleSharpe: 0.5,
    nPeriods: 5,
    method: "rolling",
    trainRatio: 0.8,
    interpretation: "overfit",
    passed: false,
    periods: [],
    ...overrides,
  };
}
