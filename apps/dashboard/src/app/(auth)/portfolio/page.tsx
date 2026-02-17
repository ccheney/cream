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

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);

export default function PortfolioPage() {
	const {
		account,
		accountStreaming,
		chartPeriod,
		closedTradesData,
		loading,
		performanceMetrics,
		portfolioHistory,
		portfolioState,
		setChartPeriod,
		streamingPositions,
		streamingRiskMetrics,
		summary,
	} = usePortfolioPageState();

	return (
		<div className="space-y-6">
			<PortfolioSummary
				state={portfolioState}
				cash={summary?.cash ?? 0}
				isLoading={loading.positions}
			/>
			<PortfolioHeader
				nav={summary?.nav ?? account?.equity ?? 0}
				lastUpdated={summary?.lastUpdated}
			/>
			<PortfolioSummaryAndCharts
				account={account}
				accountStreaming={accountStreaming}
				chartPeriod={chartPeriod}
				closedTradesData={closedTradesData}
				loading={loading}
				performanceMetrics={performanceMetrics}
				portfolioHistory={portfolioHistory}
				portfolioState={portfolioState}
				setChartPeriod={setChartPeriod}
			/>
			<PortfolioMainGrid
				account={account}
				loading={loading}
				performanceMetrics={performanceMetrics}
				portfolioState={portfolioState}
				streamingPositions={streamingPositions}
				streamingRiskMetrics={streamingRiskMetrics}
			/>
			<QueryErrorBoundary title="Failed to load order history">
				<OrderHistoryWidget limit={100} />
			</QueryErrorBoundary>
		</div>
	);
}

function usePortfolioPageState() {
	const [chartPeriod, setChartPeriod] = useState<PortfolioHistoryPeriod>("1M");
	const {
		account,
		summary,
		performanceMetrics,
		portfolioHistory,
		positions,
		closedTradesData,
		loading,
	} = usePortfolioData(chartPeriod);
	const accountStreaming = useAccountStreaming(account);
	const { streamingPositions, state: portfolioState } = usePortfolioStreaming({
		positions,
		cash: summary?.cash,
		enabled: true,
	});
	const streamingRiskMetrics = useRiskMetricsStreaming({
		performanceMetrics,
		portfolioState,
		initialEquity: account?.equity ?? 100000,
	});

	return {
		account,
		accountStreaming: accountStreaming.isStreaming,
		chartPeriod,
		closedTradesData,
		loading,
		performanceMetrics,
		portfolioHistory,
		portfolioState,
		setChartPeriod,
		streamingPositions,
		streamingRiskMetrics,
		summary,
	};
}

function usePortfolioData(chartPeriod: PortfolioHistoryPeriod) {
	const { data: account, isLoading: isAccountLoading } = useAccount();
	const { data: summary } = usePortfolioSummary();
	const { data: performanceMetrics, isLoading: isPerformanceLoading } = usePerformanceMetrics();
	const { data: portfolioHistory, isLoading: isHistoryLoading } = usePortfolioHistory(chartPeriod);
	const { data: positions, isLoading: isPositionsLoading } = usePositions();
	const { data: closedTradesData } = useClosedTrades();

	return {
		account,
		summary,
		performanceMetrics,
		portfolioHistory,
		positions: positions ?? [],
		closedTradesData,
		loading: {
			account: isAccountLoading,
			performance: isPerformanceLoading,
			history: isHistoryLoading,
			positions: isPositionsLoading,
		},
	};
}

function PortfolioHeader({ nav, lastUpdated }: { nav: number; lastUpdated?: string }) {
	return (
		<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Portfolio Overview
				</h1>
				{lastUpdated && (
					<span className="text-sm text-stone-500 dark:text-night-400">
						Last updated: {new Date(lastUpdated).toLocaleTimeString()}
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
	);
}

function PortfolioSummaryAndCharts({
	account,
	accountStreaming,
	chartPeriod,
	closedTradesData,
	loading,
	performanceMetrics,
	portfolioHistory,
	portfolioState,
	setChartPeriod,
}: {
	account: Awaited<ReturnType<typeof useAccount>>["data"];
	accountStreaming: boolean;
	chartPeriod: PortfolioHistoryPeriod;
	closedTradesData: Awaited<ReturnType<typeof useClosedTrades>>["data"];
	loading: { account: boolean; performance: boolean; history: boolean; positions: boolean };
	performanceMetrics: Awaited<ReturnType<typeof usePerformanceMetrics>>["data"];
	portfolioHistory: Awaited<ReturnType<typeof usePortfolioHistory>>["data"];
	portfolioState: ReturnType<typeof usePortfolioStreaming>["state"];
	setChartPeriod: (period: PortfolioHistoryPeriod) => void;
}) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<QueryErrorBoundary title="Failed to load account summary">
				<AccountSummaryCard
					account={account}
					isLoading={loading.account}
					isStreaming={accountStreaming}
					performanceMetrics={performanceMetrics}
					isPerformanceLoading={loading.performance}
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
					isLoading={loading.history}
					liveEquity={portfolioState.liveNav}
					isStreaming={portfolioState.isStreaming}
				/>
			</QueryErrorBoundary>
		</div>
	);
}

function PortfolioMainGrid({
	account,
	loading,
	performanceMetrics,
	portfolioState,
	streamingPositions,
	streamingRiskMetrics,
}: {
	account: Awaited<ReturnType<typeof useAccount>>["data"];
	loading: { account: boolean; performance: boolean; history: boolean; positions: boolean };
	performanceMetrics: Awaited<ReturnType<typeof usePerformanceMetrics>>["data"];
	portfolioState: ReturnType<typeof usePortfolioStreaming>["state"];
	streamingPositions: ReturnType<typeof usePortfolioStreaming>["streamingPositions"];
	streamingRiskMetrics: ReturnType<typeof useRiskMetricsStreaming>;
}) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<div className="lg:col-span-2 space-y-6">
				<QueryErrorBoundary title="Failed to load positions">
					<PositionsPanel
						positions={streamingPositions}
						isStreaming={portfolioState.isStreaming}
						isLoading={loading.positions}
					/>
				</QueryErrorBoundary>
				<QueryErrorBoundary title="Failed to load options positions">
					<OptionsPositionsWidget showAggregateGreeks />
				</QueryErrorBoundary>
			</div>
			<div className="lg:col-span-1 space-y-6">
				<QueryErrorBoundary title="Failed to load allocation">
					<AllocationDonut
						positions={streamingPositions}
						account={account}
						isStreaming={portfolioState.isStreaming}
						isLoading={loading.positions || loading.account}
					/>
				</QueryErrorBoundary>
				<QueryErrorBoundary title="Failed to load risk metrics">
					<RiskMetricsBar
						metrics={performanceMetrics}
						streamingMetrics={streamingRiskMetrics}
						isLoading={loading.performance}
					/>
				</QueryErrorBoundary>
			</div>
		</div>
	);
}
