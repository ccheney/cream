"use client";

/**
 * Portfolio Page - Position management and P&L tracking
 *
 * Layout structure for portfolio dashboard with placeholder slots for child components.
 * Child components are built in subsequent beads:
 * - AccountSummaryCard (cream-h3xmf)
 * - PerformanceGrid (cream-sakhh)
 * - EquityCurveChart (cream-lgaxe)
 * - StreamingPositionsTable (cream-kzy8g)
 * - AllocationDonut (cream-g6svw)
 * - RiskMetricsBar (cream-yaq2r)
 * - OptionsPositionsWidget (cream-9lhy7)
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { useState } from "react";
import { AccountSummaryCard } from "@/components/portfolio/AccountSummaryCard";
import { EquityCurveChart } from "@/components/portfolio/EquityCurveChart";
import { LiveIndicator } from "@/components/portfolio/LiveIndicator";
import { PerformanceGrid } from "@/components/portfolio/PerformanceGrid";
import { RiskMetricsBar } from "@/components/portfolio/RiskMetricsBar";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import {
  useAccount,
  usePerformanceMetrics,
  usePortfolioHistory,
  usePortfolioSummary,
} from "@/hooks/queries";
import { useAccountStreaming } from "@/hooks/useAccountStreaming";
import type { PortfolioHistoryPeriod } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Placeholder Components
// ============================================

/**
 * Placeholder for StreamingPositionsTable component (cream-kzy8g)
 * Real-time positions table with streaming prices
 */
function StreamingPositionsTablePlaceholder() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
          Open Positions
        </h2>
        <span className="text-xs text-stone-400 dark:text-night-500">0 positions</span>
      </div>
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-cream-50 dark:bg-night-750 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for AllocationDonut component (cream-g6svw)
 * Donut chart with sector list
 */
function AllocationDonutPlaceholder() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
      <h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
        Allocation
      </h2>
      <div className="flex flex-col items-center gap-4">
        <div className="h-32 w-32 rounded-full border-8 border-cream-100 dark:border-night-700 flex items-center justify-center">
          <span className="text-stone-400 dark:text-night-500 text-sm">Chart</span>
        </div>
        <div className="w-full space-y-2">
          {["Technology", "Healthcare", "Financials", "Other"].map((sector) => (
            <div key={sector} className="flex items-center justify-between text-sm">
              <span className="text-stone-600 dark:text-night-300">{sector}</span>
              <div className="h-4 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function PortfolioPage() {
  const [chartPeriod, setChartPeriod] = useState<PortfolioHistoryPeriod>("1M");
  const { data: account, isLoading: isAccountLoading } = useAccount();
  const { data: summary } = usePortfolioSummary();
  const { data: performanceMetrics, isLoading: isPerformanceLoading } = usePerformanceMetrics();
  const { data: portfolioHistory, isLoading: isHistoryLoading } = usePortfolioHistory(chartPeriod);
  const accountStreaming = useAccountStreaming(account);
  const { connected } = useWebSocketContext();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const nav = summary?.nav ?? account?.equity ?? 0;

  return (
    <div className="space-y-6">
      {/* Header with NAV and Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
            Portfolio Overview
          </h1>
          {summary?.lastUpdated && (
            <span className="text-sm text-stone-500 dark:text-night-400">
              Last updated: {new Date(summary.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-sm text-stone-500 dark:text-night-400">NAV</span>
            <div className="text-2xl font-semibold text-stone-900 dark:text-night-50 font-mono">
              {formatCurrency(nav)}
            </div>
          </div>
          <LiveIndicator
            isStreaming={accountStreaming.isStreaming}
            isConnected={connected}
            lastUpdated={accountStreaming.lastUpdated}
          />
        </div>
      </div>

      {/* Account Summary - 8 metrics in 2x4 grid */}
      <QueryErrorBoundary title="Failed to load account summary">
        <AccountSummaryCard
          account={account}
          isLoading={isAccountLoading}
          isStreaming={accountStreaming.isStreaming}
        />
      </QueryErrorBoundary>

      {/* Performance Grid - 6 timeframe tabs */}
      <QueryErrorBoundary title="Failed to load performance data">
        <PerformanceGrid metrics={performanceMetrics} isLoading={isPerformanceLoading} />
      </QueryErrorBoundary>

      {/* Equity Curve Chart */}
      <QueryErrorBoundary title="Failed to load equity curve">
        <EquityCurveChart
          data={portfolioHistory}
          period={chartPeriod}
          onPeriodChange={setChartPeriod}
          isLoading={isHistoryLoading}
        />
      </QueryErrorBoundary>

      {/* Main Content Row: Positions Table (2/3) + Allocation (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Streaming Positions Table - 2/3 width on large screens */}
        <div className="lg:col-span-2">
          <QueryErrorBoundary title="Failed to load positions">
            <StreamingPositionsTablePlaceholder />
          </QueryErrorBoundary>
        </div>

        {/* Allocation Donut - 1/3 width on large screens */}
        <div className="lg:col-span-1">
          <QueryErrorBoundary title="Failed to load allocation">
            <AllocationDonutPlaceholder />
          </QueryErrorBoundary>
        </div>
      </div>

      {/* Risk Metrics Bar */}
      <QueryErrorBoundary title="Failed to load risk metrics">
        <RiskMetricsBar metrics={performanceMetrics} isLoading={isPerformanceLoading} />
      </QueryErrorBoundary>
    </div>
  );
}
