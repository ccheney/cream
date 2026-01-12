"use client";

import { format } from "date-fns";
import { EquityCurve, type EquityDataPoint } from "@/components/charts/EquityCurve";
import type { BacktestTrade } from "@/lib/api/types";
import { formatCurrency, formatPct } from "./hooks";
import type { MonthlyReturn } from "./types";

interface EquityCurveSectionProps {
  data: EquityDataPoint[];
}

interface MonthlyReturnsHeatmapProps {
  monthlyReturns: MonthlyReturn[];
}

interface TradeLogProps {
  trades: BacktestTrade[] | undefined;
}

function getReturnColorClass(returnPct: number): string {
  if (returnPct >= 5) {
    return "bg-green-500 text-white";
  }
  if (returnPct >= 2) {
    return "bg-green-400 text-white";
  }
  if (returnPct >= 0) {
    return "bg-green-200 text-green-900";
  }
  if (returnPct >= -2) {
    return "bg-red-200 text-red-900";
  }
  if (returnPct >= -5) {
    return "bg-red-400 text-white";
  }
  return "bg-red-500 text-white";
}

export function EquityCurveSection({ data }: EquityCurveSectionProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">Equity Curve</h2>
      {data.length > 0 ? (
        <EquityCurve data={data} height={300} />
      ) : (
        <div className="h-64 flex items-center justify-center text-stone-400 dark:text-night-400">
          No equity data
        </div>
      )}
    </div>
  );
}

export function MonthlyReturnsHeatmap({
  monthlyReturns,
}: MonthlyReturnsHeatmapProps): React.ReactElement | null {
  if (monthlyReturns.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
        Monthly Returns
      </h2>
      <div className="flex flex-wrap gap-2">
        {monthlyReturns.map(({ month, returnPct }) => (
          <div
            key={month}
            className={`px-3 py-2 rounded text-sm font-mono ${getReturnColorClass(returnPct)}`}
            title={`${month}: ${formatPct(returnPct)}`}
          >
            <div className="text-xs opacity-75">{month}</div>
            <div className="font-semibold">{formatPct(returnPct)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TradeLog({ trades }: TradeLogProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
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
                <th className="px-4 py-2 font-medium">Side</th>
                <th className="px-4 py-2 font-medium text-right">Qty</th>
                <th className="px-4 py-2 font-medium text-right">Price</th>
                <th className="px-4 py-2 font-medium text-right">P&L</th>
                <th className="px-4 py-2 font-medium text-right">Cumulative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100 dark:divide-night-700">
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 text-stone-400 dark:text-night-400">No trades</div>
      )}
    </div>
  );
}

interface TradeRowProps {
  trade: BacktestTrade;
}

function TradeRow({ trade }: TradeRowProps): React.ReactElement {
  const actionClass =
    trade.action === "BUY"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  const sideClass =
    trade.side === "LONG"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";

  const pnlClass = (trade.pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600";
  const cumulativeClass = trade.cumulativePnl >= 0 ? "text-green-600" : "text-red-600";

  return (
    <tr className="hover:bg-cream-50 dark:hover:bg-night-750">
      <td className="px-4 py-2 text-sm text-stone-500 dark:text-night-300">
        {format(new Date(trade.timestamp), "MMM d, HH:mm")}
      </td>
      <td className="px-4 py-2 font-medium text-stone-900 dark:text-night-50">{trade.symbol}</td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${actionClass}`}>
          {trade.action}
        </span>
      </td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${sideClass}`}>{trade.side}</span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-stone-900 dark:text-night-50">
        {trade.qty}
      </td>
      <td className="px-4 py-2 text-right font-mono text-stone-900 dark:text-night-50">
        ${trade.price.toFixed(2)}
      </td>
      <td className={`px-4 py-2 text-right font-mono ${pnlClass}`}>
        {trade.pnl !== null ? formatCurrency(trade.pnl) : "--"}
      </td>
      <td className={`px-4 py-2 text-right font-mono ${cumulativeClass}`}>
        {formatCurrency(trade.cumulativePnl)}
      </td>
    </tr>
  );
}
