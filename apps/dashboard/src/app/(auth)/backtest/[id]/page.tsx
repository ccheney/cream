"use client";

/**
 * Backtest Detail Page
 *
 * Displays detailed backtest results including:
 * - Parameters summary
 * - Equity curve chart
 * - Performance metrics (Sharpe, drawdown, win rate)
 * - Trade log table
 * - Comparison with benchmark
 *
 * @see docs/plans/ui/03-views.md lines 736-804
 */

import { format } from "date-fns";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EquityCurve, type EquityDataPoint } from "@/components/charts/EquityCurve";
import { Button } from "@/components/ui/button";
import {
  useBacktest,
  useBacktestEquity,
  useBacktestTrades,
  useDeleteBacktest,
} from "@/hooks/queries";

export default function BacktestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: backtest, isLoading: backtestLoading } = useBacktest(id);
  const { data: trades } = useBacktestTrades(id);
  const { data: equity } = useBacktestEquity(id);
  const deleteBacktest = useDeleteBacktest();

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Transform equity data for chart
  const equityChartData: EquityDataPoint[] = useMemo(() => {
    if (!equity) {
      return [];
    }
    return equity.map((point) => ({
      time: format(new Date(point.timestamp), "MMM d"),
      value: point.nav,
      drawdown: point.drawdownPct / 100,
    }));
  }, [equity]);

  // Calculate monthly returns for heatmap
  const monthlyReturns = useMemo(() => {
    if (!equity || equity.length < 2) {
      return [];
    }

    const monthlyData: { month: string; returnPct: number }[] = [];
    let prevValue = equity[0]?.nav ?? 0;
    let currentMonth = "";

    for (const point of equity) {
      const date = new Date(point.timestamp);
      const month = format(date, "MMM yyyy");

      if (month !== currentMonth) {
        if (currentMonth && prevValue > 0) {
          const returnPct = ((point.nav - prevValue) / prevValue) * 100;
          monthlyData.push({ month: currentMonth, returnPct });
        }
        currentMonth = month;
        prevValue = point.nav;
      }
    }

    // Add last month
    if (equity.length > 0 && currentMonth) {
      const lastNav = equity[equity.length - 1]?.nav ?? 0;
      const returnPct = prevValue > 0 ? ((lastNav - prevValue) / prevValue) * 100 : 0;
      monthlyData.push({ month: currentMonth, returnPct });
    }

    return monthlyData;
  }, [equity]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteBacktest.mutateAsync(id);
      router.push("/backtest");
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  };

  const handleExportCSV = () => {
    if (!trades || trades.length === 0) {
      return;
    }

    const headers = [
      "Timestamp",
      "Symbol",
      "Action",
      "Side",
      "Qty",
      "Price",
      "P&L",
      "Cumulative P&L",
    ];
    const rows = trades.map((trade) => [
      trade.timestamp,
      trade.symbol,
      trade.action,
      trade.side,
      trade.qty.toString(),
      trade.price.toFixed(2),
      trade.pnl?.toFixed(2) ?? "",
      trade.cumulativePnl.toFixed(2),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backtest-${id}-trades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (backtestLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!backtest) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-cream-500 dark:text-cream-400">Backtest not found</p>
        <Link href="/backtest" className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
          ← Back to backtests
        </Link>
      </div>
    );
  }

  const metrics = backtest.metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/backtest"
            className="p-2 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
              {backtest.name}
            </h1>
            <p className="text-sm text-cream-500 dark:text-cream-400">
              {backtest.startDate} to {backtest.endDate}
            </p>
          </div>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${
              backtest.status === "completed"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : backtest.status === "running"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                  : backtest.status === "failed"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
            }`}
          >
            {backtest.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCSV}
            disabled={!trades?.length}
          >
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button
            variant={deleteConfirm ? "destructive" : "secondary"}
            size="sm"
            onClick={handleDelete}
            disabled={deleteBacktest.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {deleteConfirm ? "Confirm Delete" : "Delete"}
          </Button>
        </div>
      </div>

      {/* Parameters Summary */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Parameters</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-cream-500 dark:text-cream-400">Initial Capital</div>
            <div className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              {formatCurrency(backtest.initialCapital)}
            </div>
          </div>
          <div>
            <div className="text-sm text-cream-500 dark:text-cream-400">Period</div>
            <div className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              {backtest.startDate} - {backtest.endDate}
            </div>
          </div>
          <div>
            <div className="text-sm text-cream-500 dark:text-cream-400">Final NAV</div>
            <div className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              {metrics ? formatCurrency(metrics.finalNav) : "--"}
            </div>
          </div>
          <div>
            <div className="text-sm text-cream-500 dark:text-cream-400">Total Trades</div>
            <div className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              {metrics?.totalTrades ?? "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard
            label="Total Return"
            value={formatPct(metrics.totalReturnPct)}
            valueColor={metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}
          />
          <MetricCard label="Sharpe Ratio" value={metrics.sharpeRatio.toFixed(2)} />
          <MetricCard label="Sortino Ratio" value={metrics.sortinoRatio.toFixed(2)} />
          <MetricCard
            label="Max Drawdown"
            value={formatPct(-metrics.maxDrawdownPct)}
            valueColor="text-red-600"
          />
          <MetricCard label="Win Rate" value={formatPct(metrics.winRate * 100)} />
          <MetricCard label="Profit Factor" value={metrics.profitFactor.toFixed(2)} />
        </div>
      )}

      {/* Equity Curve */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Equity Curve
        </h2>
        {equityChartData.length > 0 ? (
          <EquityCurve data={equityChartData} height={300} />
        ) : (
          <div className="h-64 flex items-center justify-center text-cream-400">No equity data</div>
        )}
      </div>

      {/* Monthly Returns Heatmap */}
      {monthlyReturns.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Monthly Returns
          </h2>
          <div className="flex flex-wrap gap-2">
            {monthlyReturns.map(({ month, returnPct }) => (
              <div
                key={month}
                className={`px-3 py-2 rounded text-sm font-mono ${
                  returnPct >= 5
                    ? "bg-green-500 text-white"
                    : returnPct >= 2
                      ? "bg-green-400 text-white"
                      : returnPct >= 0
                        ? "bg-green-200 text-green-900"
                        : returnPct >= -2
                          ? "bg-red-200 text-red-900"
                          : returnPct >= -5
                            ? "bg-red-400 text-white"
                            : "bg-red-500 text-white"
                }`}
                title={`${month}: ${formatPct(returnPct)}`}
              >
                <div className="text-xs opacity-75">{month}</div>
                <div className="font-semibold">{formatPct(returnPct)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best/Worst Trades */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-2">
              Best Trade
            </h2>
            <div className="flex items-center justify-between">
              <span className="font-medium text-cream-900 dark:text-cream-100">
                {metrics.bestTrade.symbol}
              </span>
              <span className="text-green-600 font-mono font-semibold">
                {formatCurrency(metrics.bestTrade.pnl)}
              </span>
            </div>
          </div>
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-2">
              Worst Trade
            </h2>
            <div className="flex items-center justify-between">
              <span className="font-medium text-cream-900 dark:text-cream-100">
                {metrics.worstTrade.symbol}
              </span>
              <span className="text-red-600 font-mono font-semibold">
                {formatCurrency(metrics.worstTrade.pnl)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Trade Log */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Trade Log ({trades?.length ?? 0} trades)
          </h2>
        </div>
        {trades && trades.length > 0 ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full">
              <thead className="bg-cream-50 dark:bg-night-750 sticky top-0">
                <tr className="text-left text-sm text-cream-500 dark:text-cream-400">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Symbol</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Side</th>
                  <th className="px-4 py-2 font-medium text-right">Qty</th>
                  <th className="px-4 py-2 font-medium text-right">Price</th>
                  <th className="px-4 py-2 font-medium text-right">P&L</th>
                  <th className="px-4 py-2 font-medium text-right">Cumulative</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100 dark:divide-night-700">
                {trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-cream-50 dark:hover:bg-night-750">
                    <td className="px-4 py-2 text-sm text-cream-500 dark:text-cream-400">
                      {format(new Date(trade.timestamp), "MMM d, HH:mm")}
                    </td>
                    <td className="px-4 py-2 font-medium text-cream-900 dark:text-cream-100">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          trade.action === "BUY"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {trade.action}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          trade.side === "LONG"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-cream-900 dark:text-cream-100">
                      {trade.qty}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-cream-900 dark:text-cream-100">
                      ${trade.price.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        (trade.pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {trade.pnl !== null ? formatCurrency(trade.pnl) : "--"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        trade.cumulativePnl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(trade.cumulativePnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-cream-400">No trades</div>
        )}
      </div>

      {/* Benchmark Comparison (placeholder) */}
      {metrics && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Benchmark Comparison
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-cream-500 dark:text-cream-400 mb-1">Strategy</div>
              <div
                className={`text-2xl font-semibold ${metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatPct(metrics.totalReturnPct)}
              </div>
            </div>
            <div>
              <div className="text-sm text-cream-500 dark:text-cream-400 mb-1">SPY (B&H)</div>
              <div className="text-2xl font-semibold text-cream-400">--</div>
              <div className="text-xs text-cream-400">Benchmark data not available</div>
            </div>
            <div>
              <div className="text-sm text-cream-500 dark:text-cream-400 mb-1">Alpha</div>
              <div className="text-2xl font-semibold text-cream-400">--</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${valueColor ?? "text-cream-900 dark:text-cream-100"}`}
      >
        {value}
      </div>
    </div>
  );
}
