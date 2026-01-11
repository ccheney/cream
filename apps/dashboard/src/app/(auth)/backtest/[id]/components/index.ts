/**
 * Backtest Detail Page Components
 *
 * Re-exports all components for the backtest detail page.
 */

export { EquityCurveSection, MonthlyReturnsHeatmap, TradeLog } from "./BacktestChart";
export {
  BacktestHeader,
  BacktestParameters,
  BacktestProgressSection,
} from "./BacktestHeader";
export {
  BacktestMetricsGrid,
  BenchmarkComparison,
  BestWorstTrades,
  MetricCard,
} from "./BacktestMetrics";
export { formatCurrency, formatPct, useEquityChartData, useMonthlyReturns } from "./hooks";
export type * from "./types";
