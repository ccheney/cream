/**
 * Backtest Detail Page Components
 *
 * Re-exports all components for the backtest detail page.
 */

export { EquityCurveSection, MonthlyReturnsHeatmap, TradeLog } from "./BacktestChart.js";
export {
  BacktestHeader,
  BacktestParameters,
  BacktestProgressSection,
} from "./BacktestHeader.js";
export {
  BacktestMetricsGrid,
  BenchmarkComparison,
  BestWorstTrades,
  MetricCard,
} from "./BacktestMetrics.js";
export { formatCurrency, formatPct, useEquityChartData, useMonthlyReturns } from "./hooks.js";
export type * from "./types.js";
