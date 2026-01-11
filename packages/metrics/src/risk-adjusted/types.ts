/**
 * Type definitions for risk-adjusted performance metrics
 */

/**
 * Configuration for performance metrics calculation
 */
export interface MetricsConfig {
  /** Risk-free rate (annual, decimal) */
  riskFreeRate: number;
  /** Target return for Sortino (decimal) */
  targetReturn: number;
  /** Periods per year for annualization (e.g., 252 for daily, 24*252 for hourly) */
  periodsPerYear: number;
}

/**
 * Default configuration
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  riskFreeRate: 0.05, // 5% annual risk-free rate
  targetReturn: 0, // 0% target for Sortino
  periodsPerYear: 252 * 24, // Hourly data, 252 trading days
};

/**
 * Calculated performance metrics
 */
export interface PerformanceMetrics {
  /** Raw return (cumulative %) */
  rawReturn: number;
  /** Sharpe ratio (annualized) */
  sharpe: number | null;
  /** Sortino ratio (annualized) */
  sortino: number | null;
  /** Calmar ratio (annualized return / max drawdown) */
  calmar: number | null;
  /** Window label (e.g., "1d", "1w", "1m") */
  window: string;
  /** Calculation timestamp */
  timestamp: string;
}

/**
 * Window configuration
 */
export interface MetricsWindow {
  /** Period in hours */
  period: number;
  /** Human-readable label */
  label: string;
}

/**
 * Default windows for metrics calculation
 */
export const DEFAULT_WINDOWS: MetricsWindow[] = [
  { period: 20, label: "1d" }, // ~1 trading day
  { period: 100, label: "1w" }, // ~1 week
  { period: 500, label: "1m" }, // ~1 month
];
