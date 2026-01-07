// biome-ignore-all lint/suspicious/noArrayIndexKey: Equity chart bars use time-ordered indices
"use client";

/**
 * Portfolio Page - Position management and P&L tracking
 */

import Link from "next/link";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { useEquityCurve, usePortfolioSummary, usePositions } from "@/hooks/queries";

export default function PortfolioPage() {
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: equity, isLoading: equityLoading } = useEquityCurve(30);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Portfolio</h1>
        {summary && (
          <span className="text-sm text-cream-500 dark:text-cream-400">
            Last updated: {new Date(summary.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Portfolio Summary */}
      <QueryErrorBoundary title="Failed to load portfolio summary">
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Total NAV"
            value={summaryLoading ? "--" : formatCurrency(summary?.nav ?? 0)}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Cash"
            value={summaryLoading ? "--" : formatCurrency(summary?.cash ?? 0)}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Unrealized P&L"
            value={summaryLoading ? "--" : formatCurrency(summary?.totalPnl ?? 0)}
            change={summaryLoading ? undefined : formatPct(summary?.totalPnlPct ?? 0)}
            valueColor={(summary?.totalPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Day P&L"
            value={summaryLoading ? "--" : formatCurrency(summary?.todayPnl ?? 0)}
            change={summaryLoading ? undefined : formatPct(summary?.todayPnlPct ?? 0)}
            valueColor={(summary?.todayPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
            isLoading={summaryLoading}
          />
        </div>
      </QueryErrorBoundary>

      {/* Positions Table */}
      <QueryErrorBoundary title="Failed to load positions">
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
          <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
              Open Positions
            </h2>
            {positions && (
              <span className="text-sm text-cream-500 dark:text-cream-400">
                {positions.length} positions
              </span>
            )}
          </div>

          {positionsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse"
                />
              ))}
            </div>
          ) : positions && positions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-cream-50 dark:bg-night-750">
                  <tr className="text-left text-sm text-cream-500 dark:text-cream-400">
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Avg Entry</th>
                    <th className="px-4 py-3 font-medium text-right">Current</th>
                    <th className="px-4 py-3 font-medium text-right">Market Value</th>
                    <th className="px-4 py-3 font-medium text-right">P&L</th>
                    <th className="px-4 py-3 font-medium text-right">P&L %</th>
                    <th className="px-4 py-3 font-medium text-right">Days Held</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100 dark:divide-night-700">
                  {positions.map((position) => (
                    <tr
                      key={position.id}
                      className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-cream-900 dark:text-cream-100">
                        <Link
                          href={`/portfolio/positions/${position.id}`}
                          className="hover:text-blue-600"
                        >
                          {position.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            position.side === "LONG"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {position.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
                        {position.qty}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
                        ${position.avgEntry.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
                        ${position.currentPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-cream-100">
                        {formatCurrency(position.marketValue)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          position.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {position.unrealizedPnl >= 0 ? "+" : ""}
                        {formatCurrency(position.unrealizedPnl)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          position.unrealizedPnlPct >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatPct(position.unrealizedPnlPct)}
                      </td>
                      <td className="px-4 py-3 text-right text-cream-500 dark:text-cream-400">
                        {position.daysHeld}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-cream-400">No positions</div>
          )}
        </div>
      </QueryErrorBoundary>

      {/* Equity Curve Chart */}
      <QueryErrorBoundary title="Failed to load equity curve">
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Equity Curve (30 Days)
          </h2>
          {equityLoading ? (
            <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          ) : equity && equity.length > 0 ? (
            <div className="h-64 relative">
              {/* Simple sparkline visualization */}
              <div className="absolute inset-0 flex items-end gap-px">
                {equity.map((point, i) => {
                  const min = Math.min(...equity.map((p) => p.nav));
                  const max = Math.max(...equity.map((p) => p.nav));
                  const range = max - min || 1;
                  const height = ((point.nav - min) / range) * 100;
                  return (
                    <div
                      key={`equity-${i}`}
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
              No equity data available
            </div>
          )}
        </div>
      </QueryErrorBoundary>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  valueColor,
  isLoading,
}: {
  label: string;
  value: string;
  change?: string;
  valueColor?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className="flex items-baseline gap-2">
        <div
          className={`mt-1 text-2xl font-semibold ${
            valueColor ?? "text-cream-900 dark:text-cream-100"
          }`}
        >
          {value}
        </div>
        {change && <span className={`text-sm ${valueColor ?? "text-cream-500"}`}>{change}</span>}
      </div>
    </div>
  );
}
