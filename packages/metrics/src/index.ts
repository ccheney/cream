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
  // Types
  type MetricsConfig,
  type PerformanceMetrics,
  type MetricsWindow,

  // Constants
  DEFAULT_METRICS_CONFIG,
  DEFAULT_WINDOWS,

  // Statistical helpers
  mean,
  stdDev,
  downsideDeviation,

  // Return calculations
  calculateReturns,
  cumulativeReturn,
  calculateRawReturn,

  // Drawdown calculations
  calculateMaxDrawdown,
  calculateCurrentDrawdown,

  // Risk-adjusted ratios
  calculateSharpe,
  calculateSortino,
  calculateCalmar,

  // Window-based metrics
  calculateMetricsForWindow,
  calculateAllMetrics,

  // Rolling metrics
  rollingSharpE,
  rollingSortino,
  rollingMaxDrawdown,

  // Utility functions
  isAcceptablePerformance,
  gradePerformance,
} from "./risk-adjusted";
