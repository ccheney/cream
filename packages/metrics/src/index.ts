/**
 * @cream/metrics - Performance and Risk Metrics
 *
 * This package provides risk-adjusted performance metrics
 * for evaluating trading strategy performance.
 */

export const PACKAGE_NAME = "@cream/metrics";
export const VERSION = "0.0.1";

// ============================================
// Risk-Adjusted Metrics
// ============================================

export {
  calculateAllMetrics,
  calculateCalmar,
  calculateCurrentDrawdown,
  // Drawdown calculations
  calculateMaxDrawdown,
  // Window-based metrics
  calculateMetricsForWindow,
  calculateRawReturn,
  // Return calculations
  calculateReturns,
  // Risk-adjusted ratios
  calculateSharpe,
  calculateSortino,
  cumulativeReturn,
  // Constants
  DEFAULT_METRICS_CONFIG,
  DEFAULT_WINDOWS,
  downsideDeviation,
  gradePerformance,
  // Utility functions
  isAcceptablePerformance,
  // Types
  type MetricsConfig,
  type MetricsWindow,
  // Statistical helpers
  mean,
  type PerformanceMetrics,
  rollingMaxDrawdown,
  // Rolling metrics
  rollingSharpE,
  rollingSortino,
  stdDev,
} from "./risk-adjusted";
