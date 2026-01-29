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
import { AllocationDonut } from "@/components/portfolio/AllocationDonut";
import { EquityCurveChart } from "@/components/portfolio/EquityCurveChart";
import { OptionsPositionsWidget } from "@/components/portfolio/OptionsPositionsWidget";
import { OrderHistoryWidget } from "@/components/portfolio/OrderHistoryWidget";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import { PositionsPanel } from "@/components/portfolio/PositionsPanel";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { RiskMetricsBar } from "@/components/portfolio/RiskMetricsBar";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import {
	useAccount,
	useClosedTrades,
	usePerformanceMetrics,
	usePortfolioHistory,
	usePortfolioSummary,
	usePositions,
} from "@/hooks/queries";
import { useAccountStreaming } from "@/hooks/useAccountStreaming";
import { usePortfolioStreaming } from "@/hooks/usePortfolioStreaming";
import { useRiskMetricsStreaming } from "@/hooks/useRiskMetricsStreaming";
import type { PortfolioHistoryPeriod } from "@/lib/api/types";

// ============================================
// Main Page Component
// ============================================

export default function PortfolioPage() {
	const [chartPeriod, setChartPeriod] = useState<PortfolioHistoryPeriod>("1M");
	const { data: account, isLoading: isAccountLoading } = useAccount();
	const { data: summary } = usePortfolioSummary();
	const { data: performanceMetrics, isLoading: isPerformanceLoading } = usePerformanceMetrics();
	const { data: portfolioHistory, isLoading: isHistoryLoading } = usePortfolioHistory(chartPeriod);
	const { data: positions, isLoading: isPositionsLoading } = usePositions();
	const { data: closedTradesData } = useClosedTrades();
	const accountStreaming = useAccountStreaming(account);
	const { streamingPositions, state: portfolioState } = usePortfolioStreaming({
		positions: positions ?? [],
		cash: summary?.cash,
		enabled: true,
	});

	// Stream risk metrics in real-time using portfolio state
	const streamingRiskMetrics = useRiskMetricsStreaming({
		performanceMetrics,
		portfolioState,
		initialEquity: account?.equity ?? 100000,
	});

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
			{/* Portfolio Summary */}
			<PortfolioSummary
				state={portfolioState}
				cash={summary?.cash ?? 0}
				isLoading={isPositionsLoading}
			/>

			{/* Header with NAV */}
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
				<div className="text-right">
					<span className="text-sm text-stone-500 dark:text-night-400">NAV</span>
					<div className="text-2xl font-semibold text-stone-900 dark:text-night-50 font-mono">
						{formatCurrency(nav)}
					</div>
				</div>
			</div>

			{/* Account Summary + Equity Curve - 2-up row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<QueryErrorBoundary title="Failed to load account summary">
					<AccountSummaryCard
						account={account}
						isLoading={isAccountLoading}
						isStreaming={accountStreaming.isStreaming}
						performanceMetrics={performanceMetrics}
						isPerformanceLoading={isPerformanceLoading}
						liveDayPnl={portfolioState.liveDayPnl}
						liveDayPnlPct={portfolioState.liveDayPnlPct}
						tradeStats={
							closedTradesData
								? {
										totalRealizedPnl: closedTradesData.totalRealizedPnl,
										winCount: closedTradesData.winCount,
										lossCount: closedTradesData.lossCount,
										winRate: closedTradesData.winRate,
									}
								: undefined
						}
					/>
				</QueryErrorBoundary>

				<QueryErrorBoundary title="Failed to load equity curve">
					<EquityCurveChart
						data={portfolioHistory}
						period={chartPeriod}
						onPeriodChange={setChartPeriod}
						isLoading={isHistoryLoading}
						liveEquity={portfolioState.liveNav}
						isStreaming={portfolioState.isStreaming}
					/>
				</QueryErrorBoundary>
			</div>

			{/* Main Content Row: Positions + Risk (2/3) + Allocation (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Streaming Positions Table + Risk Metrics - 2/3 width on large screens */}
				<div className="lg:col-span-2 space-y-6">
					<QueryErrorBoundary title="Failed to load positions">
						<PositionsPanel
							positions={streamingPositions}
							isStreaming={portfolioState.isStreaming}
							isLoading={isPositionsLoading}
						/>
					</QueryErrorBoundary>

					<QueryErrorBoundary title="Failed to load options positions">
						<OptionsPositionsWidget showAggregateGreeks />
					</QueryErrorBoundary>
				</div>

				{/* Allocation + Risk Metrics - 1/3 width on large screens */}
				<div className="lg:col-span-1 space-y-6">
					<QueryErrorBoundary title="Failed to load allocation">
						<AllocationDonut
							positions={streamingPositions}
							account={account}
							isStreaming={portfolioState.isStreaming}
							isLoading={isPositionsLoading || isAccountLoading}
						/>
					</QueryErrorBoundary>

					<QueryErrorBoundary title="Failed to load risk metrics">
						<RiskMetricsBar
							metrics={performanceMetrics}
							streamingMetrics={streamingRiskMetrics}
							isLoading={isPerformanceLoading}
						/>
					</QueryErrorBoundary>
				</div>
			</div>

			{/* Order History - Full width */}
			<QueryErrorBoundary title="Failed to load order history">
				<OrderHistoryWidget limit={100} />
			</QueryErrorBoundary>

			{/* === Unused Components Preview (temporary) === */}
			<div className="border-t-2 border-dashed border-amber-400 pt-6 space-y-6">
				<h2 className="text-xl font-semibold text-amber-600">Unused Components Preview</h2>

				<div>
					<h3 className="text-sm font-medium text-stone-500 mb-2">PositionsTable</h3>
					<PositionsTable positions={streamingPositions} isLoading={isPositionsLoading} />
				</div>
			</div>
		</div>
	);
}
