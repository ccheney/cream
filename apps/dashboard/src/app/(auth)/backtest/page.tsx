"use client";

/**
 * Backtest Page - Historical strategy testing
 */

import { useState } from "react";
import { BacktestListItem, BacktestProgressBar } from "@/components/backtest";
import {
  useBacktest,
  useBacktestEquity,
  useBacktests,
  useBacktestTrades,
  useCreateBacktest,
  useTheses,
} from "@/hooks/queries";
import { useBacktestProgress } from "@/hooks/useBacktestProgress";

export default function BacktestPage() {
  const [selectedBacktest, setSelectedBacktest] = useState<string | null>(null);
  const [newBacktest, setNewBacktest] = useState({
    name: "",
    symbol: "SPY",
    strategy: "sma_crossover" as const,
    startDate: "",
    endDate: "",
    initialCapital: 100000,
  });

  const STRATEGIES = [
    {
      value: "sma_crossover",
      label: "SMA Crossover",
      description: "Buy on golden cross, sell on death cross (10/30)",
    },
    {
      value: "rsi_oversold_overbought",
      label: "RSI Oversold/Overbought",
      description: "Buy oversold bounce, sell overbought (14, 30/70)",
    },
    {
      value: "bollinger_breakout",
      label: "Bollinger Breakout",
      description: "Buy upper breakout, sell lower touch (20, 2σ)",
    },
    {
      value: "macd_crossover",
      label: "MACD Crossover",
      description: "Buy MACD cross up, sell cross down (12/26/9)",
    },
  ] as const;
  const [createdBacktestId, setCreatedBacktestId] = useState<string | null>(null);

  const { data: backtests, isLoading: backtestsLoading } = useBacktests();
  const { data: theses } = useTheses();
  const { data: backtest } = useBacktest(selectedBacktest ?? "");
  const { data: trades } = useBacktestTrades(selectedBacktest ?? "");
  const { data: equity } = useBacktestEquity(selectedBacktest ?? "");
  const createBacktest = useCreateBacktest();

  const handleThesisSelect = (thesisId: string) => {
    const thesis = theses?.find((t) => t.id === thesisId);
    if (thesis) {
      // Use createdAt as start date, and expiresAt or today as end
      const createdDate = new Date(thesis.createdAt);
      const endDate = thesis.expiresAt ? new Date(thesis.expiresAt) : new Date();

      const start = createdDate.toISOString().split("T")[0];
      const end = endDate.toISOString().split("T")[0];

      setNewBacktest({
        ...newBacktest,
        name: `Thesis: ${thesis.symbol}`,
        symbol: thesis.symbol,
        startDate: start ?? "",
        endDate: end ?? "",
      });
    }
  };

  // Track progress of newly created backtest
  const { status: newBacktestStatus, progress: newBacktestProgress } =
    useBacktestProgress(createdBacktestId);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  const handleCreateBacktest = async () => {
    if (newBacktest.name && newBacktest.symbol && newBacktest.startDate && newBacktest.endDate) {
      const result = await createBacktest.mutateAsync({
        name: newBacktest.name,
        startDate: newBacktest.startDate,
        endDate: newBacktest.endDate,
        initialCapital: newBacktest.initialCapital,
        universe: [newBacktest.symbol.toUpperCase()],
        config: {
          strategy: { type: newBacktest.strategy },
        },
      });
      setCreatedBacktestId(result.id);
      setNewBacktest({
        name: "",
        symbol: "SPY",
        strategy: "sma_crossover",
        startDate: "",
        endDate: "",
        initialCapital: 100000,
      });
    }
  };

  // Clear created backtest ID when it completes
  if (createdBacktestId && (newBacktestStatus === "completed" || newBacktestStatus === "error")) {
    // Give user a moment to see the final state before clearing
    setTimeout(() => setCreatedBacktestId(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Backtest</h1>
      </div>

      {/* Backtest Configuration */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">New Backtest</h2>
          {theses && theses.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-500 dark:text-night-300">From thesis:</span>
              <select
                onChange={(e) => e.target.value && handleThesisSelect(e.target.value)}
                className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-2 py-1 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
                defaultValue=""
              >
                <option value="">Select a thesis...</option>
                {theses.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.symbol} - {t.status} ({new Date(t.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-6 gap-4">
          <div>
            <label
              htmlFor="backtest-name"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
            >
              Name
            </label>
            <input
              id="backtest-name"
              type="text"
              value={newBacktest.name}
              onChange={(e) => setNewBacktest({ ...newBacktest, name: e.target.value })}
              placeholder="Strategy name"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-symbol"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
            >
              Symbol
            </label>
            <input
              id="backtest-symbol"
              type="text"
              value={newBacktest.symbol}
              onChange={(e) => setNewBacktest({ ...newBacktest, symbol: e.target.value })}
              placeholder="SPY"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50 uppercase"
            />
          </div>
          <div className="col-span-2">
            <label
              htmlFor="backtest-strategy"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
            >
              Strategy
            </label>
            <select
              id="backtest-strategy"
              value={newBacktest.strategy}
              onChange={(e) =>
                setNewBacktest({
                  ...newBacktest,
                  strategy: e.target.value as typeof newBacktest.strategy,
                })
              }
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-400 dark:text-night-400">
              {STRATEGIES.find((s) => s.value === newBacktest.strategy)?.description}
            </p>
          </div>
          <div>
            <label
              htmlFor="backtest-start"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
            >
              Start Date
            </label>
            <input
              id="backtest-start"
              type="date"
              value={newBacktest.startDate}
              onChange={(e) => setNewBacktest({ ...newBacktest, startDate: e.target.value })}
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-end"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
            >
              End Date
            </label>
            <input
              id="backtest-end"
              type="date"
              value={newBacktest.endDate}
              onChange={(e) => setNewBacktest({ ...newBacktest, endDate: e.target.value })}
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-capital"
              className="block text-sm text-stone-500 dark:text-night-300 mb-1"
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
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCreateBacktest}
              disabled={createBacktest.isPending || newBacktestStatus === "running"}
              className="w-full px-4 py-1.5 bg-stone-700 dark:bg-night-200 text-cream-50 dark:text-night-900 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createBacktest.isPending ? "Creating..." : "Run Backtest"}
            </button>
          </div>
        </div>

        {/* Progress bar for newly created backtest */}
        {createdBacktestId && newBacktestStatus !== "idle" && (
          <div className="mt-4 pt-4 border-t border-cream-200 dark:border-night-700">
            <BacktestProgressBar
              progressPct={newBacktestProgress?.progress ?? 0}
              status={newBacktestStatus}
              showPhase
              showValue
              size="md"
            />
          </div>
        )}
      </div>

      {/* Backtest List */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Backtests</h2>
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
              <BacktestListItem
                key={bt.id}
                backtest={bt}
                isSelected={selectedBacktest === bt.id}
                onSelect={setSelectedBacktest}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 text-stone-400 dark:text-night-400">No backtests yet</div>
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
            <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
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
              <div className="h-64 flex items-center justify-center text-stone-400 dark:text-night-400">
                No equity data
              </div>
            )}
          </div>

          {/* Trade Log */}
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
            <div className="p-4 border-b border-cream-200 dark:border-night-700">
              <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
                Trade Log ({trades?.length ?? 0} trades)
              </h2>
            </div>
            {trades && trades.length > 0 ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full">
                  <thead className="bg-cream-50 dark:bg-night-750 sticky top-0">
                    <tr className="text-left text-sm text-stone-500 dark:text-night-300">
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
                        <td className="px-4 py-2 text-sm text-stone-500 dark:text-night-300">
                          {new Date(trade.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-medium text-stone-900 dark:text-night-50">
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
                        <td className="px-4 py-2 text-right font-mono text-stone-900 dark:text-night-50">
                          {trade.qty}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-stone-900 dark:text-night-50">
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
              <div className="p-4 text-stone-400 dark:text-night-400">No trades</div>
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
      <div className="text-sm text-stone-500 dark:text-night-300">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          valueColor ?? "text-stone-900 dark:text-night-50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
