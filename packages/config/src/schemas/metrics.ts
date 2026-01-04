/**
 * Metrics Configuration Schema
 *
 * Defines configuration for performance metrics calculation.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Metric Types
// ============================================

/**
 * Available performance metrics
 */
export const MetricName = z.enum(["raw_return", "sharpe", "sortino", "calmar"]);
export type MetricName = z.infer<typeof MetricName>;

// ============================================
// Metrics Window Configuration
// ============================================

/**
 * Metrics calculation window
 */
export const MetricsWindowSchema = z.object({
  /**
   * Window period in hours
   */
  period: z.number().int().positive(),

  /**
   * Human-readable label for the window
   */
  label: z.string().min(1),
});
export type MetricsWindow = z.infer<typeof MetricsWindowSchema>;

// ============================================
// Complete Metrics Configuration
// ============================================

/**
 * Complete metrics configuration
 */
export const MetricsConfigSchema = z.object({
  /**
   * Enabled metrics
   *
   * - raw_return: Absolute return percentage
   * - sharpe: Return per unit of total volatility (Sharpe Ratio)
   * - sortino: Return per unit of downside volatility (Sortino Ratio)
   * - calmar: Return per unit of max drawdown (Calmar Ratio)
   */
  enabled: z.array(MetricName).default(["raw_return", "sharpe", "sortino", "calmar"]),

  /**
   * Calculation windows
   *
   * Default: 1 day, 1 week, 1 month
   */
  windows: z.array(MetricsWindowSchema).default([
    { period: 20, label: "1d" },
    { period: 100, label: "1w" },
    { period: 500, label: "1m" },
  ]),

  /**
   * Risk-free rate for Sharpe/Sortino calculations
   *
   * Annualized rate (e.g., 0.05 = 5%)
   */
  risk_free_rate: z.number().min(0).max(1).default(0.05),

  /**
   * Target return for Sortino calculation
   *
   * Returns below this are considered "downside"
   * Default: 0 (any negative return is downside)
   */
  sortino_target: z.number().default(0),
});
export type MetricsConfig = z.infer<typeof MetricsConfigSchema>;
