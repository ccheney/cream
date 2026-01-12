"use client";

import { formatCurrency, formatPct } from "./hooks";
import type {
  BacktestMetricsGridProps,
  BenchmarkComparisonProps,
  BestWorstTradesProps,
  MetricCardProps,
} from "./types";

export function MetricCard({ label, value, valueColor }: MetricCardProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-stone-500 dark:text-night-300">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${valueColor ?? "text-stone-900 dark:text-night-50"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function BacktestMetricsGrid({
  totalReturnPct,
  sharpeRatio,
  sortinoRatio,
  maxDrawdownPct,
  winRate,
  profitFactor,
}: BacktestMetricsGridProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <MetricCard
        label="Total Return"
        value={formatPct(totalReturnPct)}
        valueColor={totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}
      />
      <MetricCard label="Sharpe Ratio" value={sharpeRatio.toFixed(2)} />
      <MetricCard label="Sortino Ratio" value={sortinoRatio.toFixed(2)} />
      <MetricCard
        label="Max Drawdown"
        value={formatPct(-maxDrawdownPct)}
        valueColor="text-red-600"
      />
      <MetricCard label="Win Rate" value={formatPct(winRate * 100)} />
      <MetricCard label="Profit Factor" value={profitFactor.toFixed(2)} />
    </div>
  );
}

export function BestWorstTrades({
  bestTrade,
  worstTrade,
}: BestWorstTradesProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-2">Best Trade</h2>
        <div className="flex items-center justify-between">
          <span className="font-medium text-stone-900 dark:text-night-50">{bestTrade.symbol}</span>
          <span className="text-green-600 font-mono font-semibold">
            {formatCurrency(bestTrade.pnl)}
          </span>
        </div>
      </div>
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-2">Worst Trade</h2>
        <div className="flex items-center justify-between">
          <span className="font-medium text-stone-900 dark:text-night-50">{worstTrade.symbol}</span>
          <span className="text-red-600 font-mono font-semibold">
            {formatCurrency(worstTrade.pnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BenchmarkComparison({
  totalReturnPct,
}: BenchmarkComparisonProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
        Benchmark Comparison
      </h2>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className="text-sm text-stone-500 dark:text-night-300 mb-1">Strategy</div>
          <div
            className={`text-2xl font-semibold ${totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {formatPct(totalReturnPct)}
          </div>
        </div>
        <div>
          <div className="text-sm text-stone-500 dark:text-night-300 mb-1">SPY (B&H)</div>
          <div className="text-2xl font-semibold text-stone-400 dark:text-night-400">--</div>
          <div className="text-xs text-stone-400 dark:text-night-400">
            Benchmark data not available
          </div>
        </div>
        <div>
          <div className="text-sm text-stone-500 dark:text-night-300 mb-1">Alpha</div>
          <div className="text-2xl font-semibold text-stone-400 dark:text-night-400">--</div>
        </div>
      </div>
    </div>
  );
}
