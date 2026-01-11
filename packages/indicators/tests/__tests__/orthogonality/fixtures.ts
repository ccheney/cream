/**
 * Shared test fixtures and data generators for orthogonality tests.
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
 * Generate random indicator values.
 */
export function generateIndicator(n: number, mean = 0, std = 1): number[] {
  return Array.from({ length: n }, () => mean + std * randn());
}

/**
 * Generate correlated indicator based on source.
 */
export function generateCorrelated(source: number[], correlation: number): number[] {
  const noiseCoeff = Math.sqrt(1 - correlation * correlation);
  return source.map((x) => correlation * x + noiseCoeff * randn());
}
