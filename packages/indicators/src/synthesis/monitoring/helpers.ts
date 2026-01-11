/**
 * Indicator Monitoring Helpers
 *
 * Utility functions for monitoring operations.
 */

export function generateId(): string {
  return `icm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function std(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
