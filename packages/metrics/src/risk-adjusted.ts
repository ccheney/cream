/**
 * Risk-Adjusted Performance Metrics
 *
 * Implements Sharpe, Sortino, and Calmar ratios for evaluating
 * trading strategy performance.
 *
 * @see docs/plans/11-configuration.md lines 1039-1079, 1301-1313
 */

// ============================================
// Types
// ============================================

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

// ============================================
// Statistical Helpers
// ============================================

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate sample standard deviation
 */
export function stdDev(values: number[], meanValue?: number): number {
  if (values.length < 2) {
    return 0;
  }

  const avg = meanValue ?? mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  const result = Math.sqrt(variance);

  // Handle floating point precision - treat very small values as 0
  return result < 1e-10 ? 0 : result;
}

/**
 * Calculate downside deviation (only negative returns)
 *
 * Formula: sqrt(sum((min(return - target, 0))^2) / n)
 */
export function downsideDeviation(returns: number[], targetReturn = 0): number {
  if (returns.length === 0) {
    return 0;
  }

  const downsideReturns = returns.map((r) => Math.min(r - targetReturn, 0));
  const squaredDownside = downsideReturns.map((r) => r ** 2);
  const avgSquared = squaredDownside.reduce((sum, v) => sum + v, 0) / returns.length;

  return Math.sqrt(avgSquared);
}

// ============================================
// Return Calculations
// ============================================

/**
 * Calculate returns from a price/equity series
 *
 * @param values Array of prices or equity values
 * @returns Array of period returns (decimal, e.g., 0.01 = 1%)
 */
export function calculateReturns(values: number[]): number[] {
  if (values.length < 2) {
    return [];
  }

  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const current = values[i];
    const prev = values[i - 1];
    if (current === undefined || prev === undefined || prev === 0) {
      returns.push(0);
    } else {
      returns.push((current - prev) / prev);
    }
  }

  return returns;
}

/**
 * Calculate cumulative return from a returns series
 *
 * @param returns Array of period returns (decimal)
 * @returns Cumulative return (decimal, e.g., 0.10 = 10%)
 */
export function cumulativeReturn(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  let cumulative = 1;
  for (const r of returns) {
    cumulative *= 1 + r;
  }

  return cumulative - 1;
}

/**
 * Calculate raw return from equity series
 *
 * @param equity Array of equity values
 * @returns Total return percentage (e.g., 0.10 = 10%)
 */
export function calculateRawReturn(equity: number[]): number {
  if (equity.length < 2) {
    return 0;
  }
  const first = equity[0];
  const last = equity[equity.length - 1];
  if (first === undefined || last === undefined || first === 0) {
    return 0;
  }
  return (last - first) / first;
}

// ============================================
// Maximum Drawdown
// ============================================

/**
 * Calculate maximum drawdown from equity curve
 *
 * @param equity Array of equity values
 * @returns Maximum drawdown as positive decimal (e.g., 0.20 = 20% drawdown)
 */
export function calculateMaxDrawdown(equity: number[]): number {
  if (equity.length < 2) {
    return 0;
  }

  const firstValue = equity[0];
  if (firstValue === undefined) {
    return 0;
  }

  let maxDrawdown = 0;
  let peak = firstValue;

  for (const value of equity) {
    if (value > peak) {
      peak = value;
    }

    if (peak === 0) {
      continue;
    }

    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Calculate current drawdown from equity curve
 *
 * @param equity Array of equity values
 * @returns Current drawdown as positive decimal
 */
export function calculateCurrentDrawdown(equity: number[]): number {
  if (equity.length < 2) {
    return 0;
  }

  const peak = Math.max(...equity);
  const current = equity[equity.length - 1];

  if (current === undefined || peak === 0) {
    return 0;
  }
  return (peak - current) / peak;
}

// ============================================
// Risk-Adjusted Ratios
// ============================================

/**
 * Calculate Sharpe Ratio
 *
 * Formula: (Return - Risk-Free Rate) / Std Dev
 * Annualized: Multiply by sqrt(periods per year)
 *
 * Developed by William Sharpe (1966), Nobel Prize winner.
 * Industry standard, penalizes both up/down volatility equally.
 *
 * Target: >1.0 acceptable, >2.0 professional, >3.0 exceptional
 *
 * @param returns Array of period returns (decimal)
 * @param config Metrics configuration
 * @returns Annualized Sharpe ratio, or null if insufficient data
 */
export function calculateSharpe(
  returns: number[],
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): number | null {
  if (returns.length < 2) {
    return null;
  }

  const meanReturn = mean(returns);
  const std = stdDev(returns, meanReturn);

  if (std === 0) {
    return null; // Zero volatility case
  }

  // Convert annual risk-free rate to per-period
  const periodRiskFreeRate = config.riskFreeRate / config.periodsPerYear;

  // Calculate per-period excess return
  const excessReturn = meanReturn - periodRiskFreeRate;

  // Sharpe ratio (not yet annualized)
  const periodSharpe = excessReturn / std;

  // Annualize: multiply by sqrt(periods per year)
  return periodSharpe * Math.sqrt(config.periodsPerYear);
}

/**
 * Calculate Sortino Ratio
 *
 * Formula: (Return - Target) / Downside Deviation
 * Annualized: Multiply by sqrt(periods per year)
 *
 * Developed by Frank Sortino.
 * Only penalizes downside volatility (what traders actually fear).
 * Better for asymmetric return distributions.
 *
 * Target: >1.0 acceptable, >2.0 good, >3.0 exceptional
 *
 * @param returns Array of period returns (decimal)
 * @param config Metrics configuration
 * @returns Annualized Sortino ratio, or null if insufficient data
 */
export function calculateSortino(
  returns: number[],
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): number | null {
  if (returns.length < 2) {
    return null;
  }

  const meanReturn = mean(returns);
  const downDev = downsideDeviation(returns, config.targetReturn / config.periodsPerYear);

  if (downDev === 0) {
    return null; // No downside volatility case
  }

  // Convert annual target to per-period
  const periodTarget = config.targetReturn / config.periodsPerYear;

  // Excess return over target
  const excessReturn = meanReturn - periodTarget;

  // Sortino ratio (not yet annualized)
  const periodSortino = excessReturn / downDev;

  // Annualize
  return periodSortino * Math.sqrt(config.periodsPerYear);
}

/**
 * Calculate Calmar Ratio
 *
 * Formula: Annual Return / Max Drawdown
 *
 * Developed by Terry Young (1991).
 * Addresses maximum loss exposure directly.
 * Best for understanding worst-case scenarios.
 *
 * Target: >1.0 acceptable, >2.0 elite, >3.0 exceptional
 *
 * @param returns Array of period returns (decimal)
 * @param equity Array of equity values (for drawdown calculation)
 * @param config Metrics configuration
 * @returns Calmar ratio, or null if insufficient data or no drawdown
 */
export function calculateCalmar(
  returns: number[],
  equity: number[],
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): number | null {
  if (returns.length < 2 || equity.length < 2) {
    return null;
  }

  const maxDD = calculateMaxDrawdown(equity);
  if (maxDD === 0) {
    return null; // No drawdown case (all gains)
  }

  // Calculate annualized return
  const totalReturn = cumulativeReturn(returns);
  const periods = returns.length;
  const years = periods / config.periodsPerYear;

  // Annualized return (CAGR formula)
  const annualizedReturn = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : totalReturn;

  // Calmar ratio
  return annualizedReturn / maxDD;
}

// ============================================
// Window-Based Metrics
// ============================================

/**
 * Calculate all performance metrics for a given window
 *
 * @param equity Full equity curve
 * @param window Window configuration
 * @param config Metrics configuration
 * @returns Performance metrics for the window
 */
export function calculateMetricsForWindow(
  equity: number[],
  window: MetricsWindow,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): PerformanceMetrics {
  // Get the last N periods for this window
  const windowEquity =
    equity.length <= window.period ? equity : equity.slice(equity.length - window.period);

  // Calculate returns from equity
  const returns = calculateReturns(windowEquity);

  // Calculate all metrics
  return {
    rawReturn: calculateRawReturn(windowEquity),
    sharpe: calculateSharpe(returns, config),
    sortino: calculateSortino(returns, config),
    calmar: calculateCalmar(returns, windowEquity, config),
    window: window.label,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate metrics for all configured windows
 *
 * @param equity Full equity curve
 * @param windows Array of window configurations
 * @param config Metrics configuration
 * @returns Array of performance metrics for each window
 */
export function calculateAllMetrics(
  equity: number[],
  windows: MetricsWindow[] = DEFAULT_WINDOWS,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): PerformanceMetrics[] {
  return windows.map((window) => calculateMetricsForWindow(equity, window, config));
}

// ============================================
// Rolling Metrics
// ============================================

/**
 * Calculate rolling Sharpe ratio
 *
 * @param returns Array of period returns
 * @param windowSize Rolling window size
 * @param config Metrics configuration
 * @returns Array of rolling Sharpe values (null for insufficient data periods)
 */
export function rollingSharpE(
  returns: number[],
  windowSize: number,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < returns.length; i++) {
    if (i < windowSize - 1) {
      result.push(null);
    } else {
      const windowReturns = returns.slice(i - windowSize + 1, i + 1);
      result.push(calculateSharpe(windowReturns, config));
    }
  }

  return result;
}

/**
 * Calculate rolling Sortino ratio
 *
 * @param returns Array of period returns
 * @param windowSize Rolling window size
 * @param config Metrics configuration
 * @returns Array of rolling Sortino values
 */
export function rollingSortino(
  returns: number[],
  windowSize: number,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < returns.length; i++) {
    if (i < windowSize - 1) {
      result.push(null);
    } else {
      const windowReturns = returns.slice(i - windowSize + 1, i + 1);
      result.push(calculateSortino(windowReturns, config));
    }
  }

  return result;
}

/**
 * Calculate rolling max drawdown
 *
 * @param equity Array of equity values
 * @param windowSize Rolling window size
 * @returns Array of rolling max drawdown values
 */
export function rollingMaxDrawdown(equity: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < equity.length; i++) {
    if (i < windowSize - 1) {
      result.push(0);
    } else {
      const windowEquity = equity.slice(i - windowSize + 1, i + 1);
      result.push(calculateMaxDrawdown(windowEquity));
    }
  }

  return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if metrics indicate acceptable performance
 *
 * Based on industry standards:
 * - Sharpe > 1.0 acceptable
 * - Sortino > 1.0 acceptable
 * - Calmar > 1.0 acceptable
 */
export function isAcceptablePerformance(metrics: PerformanceMetrics): boolean {
  const { sharpe, sortino, calmar } = metrics;

  // All metrics must be above 1.0 threshold
  const sharpeOk = sharpe === null || sharpe >= 1.0;
  const sortinoOk = sortino === null || sortino >= 1.0;
  const calmarOk = calmar === null || calmar >= 1.0;

  return sharpeOk && sortinoOk && calmarOk;
}

/**
 * Grade performance based on metrics
 *
 * @returns "exceptional" (>3.0), "elite" (>2.0), "acceptable" (>1.0), or "poor"
 */
export function gradePerformance(
  metrics: PerformanceMetrics
): "exceptional" | "elite" | "acceptable" | "poor" {
  const { sharpe, sortino, calmar } = metrics;

  // Get minimum non-null metric
  const values = [sharpe, sortino, calmar].filter((v) => v !== null) as number[];
  if (values.length === 0) {
    return "poor";
  }

  const minMetric = Math.min(...values);

  if (minMetric >= 3.0) {
    return "exceptional";
  }
  if (minMetric >= 2.0) {
    return "elite";
  }
  if (minMetric >= 1.0) {
    return "acceptable";
  }
  return "poor";
}
