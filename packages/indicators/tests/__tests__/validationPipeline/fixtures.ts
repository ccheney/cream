/**
 * Shared fixtures and helper functions for validation pipeline tests.
 */

/**
 * Generate random normal values using Box-Muller transform.
 */
export function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generate random returns with optional drift.
 */
export function generateReturns(n: number, drift = 0.0001, volatility = 0.02): number[] {
  return Array.from({ length: n }, () => drift + volatility * randn());
}

/**
 * Generate predictive signals correlated with forward returns.
 */
export function generatePredictiveSignals(returns: number[], correlation: number): number[] {
  const forwardReturns = returns.slice(1).concat([0]);
  const noiseCoeff = Math.sqrt(1 - correlation * correlation);

  return forwardReturns.map((r) => correlation * r + noiseCoeff * randn() * 0.02);
}

/**
 * Generate random signals (no predictive power).
 */
export function generateRandomSignals(n: number): number[] {
  return Array.from({ length: n }, () => randn());
}

/**
 * Default number of observations for tests.
 */
export const DEFAULT_N = 252;
