"use client";

/**
 * Backtest Page - Historical strategy testing
 */

import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  useBacktest,
  useBacktestEquity,
  useBacktests,
  useBacktestTrades,
  useCreateBacktest,
} from "@/hooks/queries";

export default function BacktestPage() {
  const [selectedBacktest, setSelectedBacktest] = useState<string | null>(null);
  const [newBacktest, setNewBacktest] = useState({
    name: "",
    startDate: "",
    endDate: "",
    initialCapital: 100000,
  });

  const { data: backtests, isLoading: backtestsLoading } = useBacktests();
  const { data: backtest } = useBacktest(selectedBacktest ?? "");
  const { data: trades } = useBacktestTrades(selectedBacktest ?? "");
  const { data: equity } = useBacktestEquity(selectedBacktest ?? "");
  const createBacktest = useCreateBacktest();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  const handleCreateBacktest = () => {
    if (newBacktest.name && newBacktest.startDate && newBacktest.endDate) {
      createBacktest.mutate(newBacktest);
      setNewBacktest({ name: "", startDate: "", endDate: "", initialCapital: 100000 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Backtest</h1>
      </div>

      {/* Backtest Configuration */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          New Backtest
        </h2>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label
              htmlFor="backtest-name"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Name
            </label>
            <input
              id="backtest-name"
              type="text"
              value={newBacktest.name}
              onChange={(e) => setNewBacktest({ ...newBacktest, name: e.target.value })}
              placeholder="Strategy name"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-start"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Start Date
            </label>
            <input
              id="backtest-start"
              type="date"
              value={newBacktest.startDate}
              onChange={(e) => setNewBacktest({ ...newBacktest, startDate: e.target.value })}
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-end"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              End Date
            </label>
            <input
              id="backtest-end"
              type="date"
              value={newBacktest.endDate}
              onChange={(e) => setNewBacktest({ ...newBacktest, endDate: e.target.value })}
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-capital"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Initial Capital
            </label>
            <input
              id="backtest-capital"
              type="number"
              value={newBacktest.initialCapital}
              onChange={(e) =>
                setNewBacktest({ ...newBacktest, initialCapital: Number(e.target.value) })
              }
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCreateBacktest}
              disabled={createBacktest.isPending}
              className="w-full px-4 py-1.5 bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createBacktest.isPending ? "Creating..." : "Run Backtest"}
            </button>
          </div>
        </div>
      </div>

      {/* Backtest List */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Backtests</h2>
        </div>
        {backtestsLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : backtests && backtests.length > 0 ? (
          <div className="divide-y divide-cream-100 dark:divide-night-700">
            {backtests.map((bt) => (
              <div
                key={bt.id}
                className={`flex items-center p-4 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors ${
                  selectedBacktest === bt.id ? "bg-cream-50 dark:bg-night-750" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedBacktest(bt.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-cream-900 dark:text-cream-100">
                        {bt.name}
                      </span>
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs font-medium rounded ${
                          bt.status === "completed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : bt.status === "running"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : bt.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                        }`}
                      >
                        {bt.status}
                      </span>
                    </div>
                    <span className="text-sm text-cream-500 dark:text-cream-400">
                      {formatDistanceToNow(new Date(bt.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-cream-500 dark:text-cream-400">
                    {bt.startDate} to {bt.endDate} | {formatCurrency(bt.initialCapital)}
                  </div>
                </button>
                <Link
                  href={`/backtest/${bt.id}`}
                  className="ml-4 p-2 rounded-md text-cream-400 hover:text-cream-600 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
                  title="View details"
                >
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-cream-400">No backtests yet</div>
        )}
      </div>

      {/* Selected Backtest Results */}
      {selectedBacktest && backtest && (
        <>
          {/* Metrics */}
          {backtest.metrics && (
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label="Total Return"
                value={formatPct(backtest.metrics.totalReturnPct)}
                valueColor={
                  backtest.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"
                }
              />
              <MetricCard label="Sharpe Ratio" value={backtest.metrics.sharpeRatio.toFixed(2)} />
              <MetricCard
                label="Max Drawdown"
                value={formatPct(-backtest.metrics.maxDrawdownPct)}
                valueColor="text-red-600"
              />
              <MetricCard label="Win Rate" value={formatPct(backtest.metrics.winRate * 100)} />
            </div>
          )}

          {/* Equity Curve */}
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
              Equity Curve
            </h2>
            {equity && equity.length > 0 ? (
              <div className="h-64 relative">
                <div className="absolute inset-0 flex items-end gap-px">
                  {equity.map((point) => {
                    const min = Math.min(...equity.map((p) => p.nav));
                    const max = Math.max(...equity.map((p) => p.nav));
                    const range = max - min || 1;
                    const height = ((point.nav - min) / range) * 100;
                    return (
                      <div
                        key={point.timestamp}
                        className="flex-1 bg-blue-500 dark:bg-blue-400 rounded-t"
                        style={{ height: `${height}%` }}
                        title={`${new Date(point.timestamp).toLocaleDateString()}: ${formatCurrency(point.nav)}`}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-cream-400">
                No equity data
              </div>
            )}
          </div>

          {/* Trade Log */}
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
            <div className="p-4 border-b border-cream-200 dark:border-night-700">
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
                      <th className="px-4 py-2 font-medium text-right">Qty</th>
                      <th className="px-4 py-2 font-medium text-right">Price</th>
                      <th className="px-4 py-2 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100 dark:divide-night-700">
                    {trades.map((trade) => (
                      <tr key={trade.id}>
                        <td className="px-4 py-2 text-sm text-cream-500 dark:text-cream-400">
                          {new Date(trade.timestamp).toLocaleString()}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-cream-400">No trades</div>
            )}
          </div>
        </>
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
        className={`mt-1 text-2xl font-semibold ${
          valueColor ?? "text-cream-900 dark:text-cream-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
