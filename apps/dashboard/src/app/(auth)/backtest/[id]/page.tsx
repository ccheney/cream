"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  useBacktest,
  useBacktestEquity,
  useBacktestTrades,
  useDeleteBacktest,
} from "@/hooks/queries";
import { useBacktestProgress } from "@/hooks/useBacktestProgress";
import {
  BacktestHeader,
  BacktestMetricsGrid,
  BacktestParameters,
  BacktestProgressSection,
  BenchmarkComparison,
  BestWorstTrades,
  EquityCurveSection,
  MonthlyReturnsHeatmap,
  TradeLog,
  useEquityChartData,
  useMonthlyReturns,
} from "./components/index";

function LoadingSkeleton(): React.ReactElement {
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

function NotFound(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-cream-500 dark:text-cream-400">Backtest not found</p>
      <Link href="/backtest" className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
        Back to backtests
      </Link>
    </div>
  );
}

export default function BacktestDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: backtest, isLoading: backtestLoading } = useBacktest(id);
  const { data: trades } = useBacktestTrades(id);
  const { data: equity } = useBacktestEquity(id);
  const deleteBacktest = useDeleteBacktest();

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isRunning = backtest?.status === "running" || backtest?.status === "pending";
  const { status: wsStatus, progress } = useBacktestProgress(isRunning ? id : null);

  const equityChartData = useEquityChartData(equity);
  const monthlyReturns = useMonthlyReturns(equity);

  async function handleDelete(): Promise<void> {
    if (deleteConfirm) {
      await deleteBacktest.mutateAsync(id);
      router.push("/backtest");
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  }

  function handleExportCSV(): void {
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
  }

  if (backtestLoading) {
    return <LoadingSkeleton />;
  }

  if (!backtest) {
    return <NotFound />;
  }

  const metrics = backtest.metrics;

  return (
    <div className="space-y-6">
      <BacktestHeader
        name={backtest.name}
        startDate={backtest.startDate}
        endDate={backtest.endDate}
        status={backtest.status}
        onExportCSV={handleExportCSV}
        onDelete={handleDelete}
        deleteConfirm={deleteConfirm}
        deleteDisabled={deleteBacktest.isPending}
        exportDisabled={!trades?.length}
      />

      {isRunning && wsStatus === "running" && progress && (
        <BacktestProgressSection
          progressPct={progress.progress}
          barsProcessed={progress.barsProcessed}
          totalBars={progress.totalBars}
        />
      )}

      <BacktestParameters
        initialCapital={backtest.initialCapital}
        startDate={backtest.startDate}
        endDate={backtest.endDate}
        finalNav={metrics?.finalNav ?? null}
        totalTrades={metrics?.totalTrades ?? null}
      />

      {metrics && (
        <BacktestMetricsGrid
          totalReturnPct={metrics.totalReturnPct}
          sharpeRatio={metrics.sharpeRatio}
          sortinoRatio={metrics.sortinoRatio}
          maxDrawdownPct={metrics.maxDrawdownPct}
          winRate={metrics.winRate}
          profitFactor={metrics.profitFactor}
        />
      )}

      <EquityCurveSection data={equityChartData} />

      <MonthlyReturnsHeatmap monthlyReturns={monthlyReturns} />

      {metrics && <BestWorstTrades bestTrade={metrics.bestTrade} worstTrade={metrics.worstTrade} />}

      <TradeLog trades={trades} />

      {metrics && <BenchmarkComparison totalReturnPct={metrics.totalReturnPct} />}
    </div>
  );
}
