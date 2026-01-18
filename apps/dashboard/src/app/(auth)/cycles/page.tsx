"use client";

/**
 * Cycles Analytics Page
 *
 * Dashboard view for cycle-level analytics, decision metrics,
 * confidence calibration, and strategy performance.
 */

import { useState } from "react";
import {
	ActionDistributionCard,
	ConfidenceCalibrationChart,
	CycleAnalyticsBar,
	DecisionMetricsCard,
	RecentCyclesTable,
	StrategyBreakdownTable,
} from "@/components/cycles";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import {
	type CycleAnalyticsFilters,
	useConfidenceCalibration,
	useCycleAnalyticsSummary,
	useCycleHistory,
	useDecisionAnalytics,
	useStrategyBreakdown,
} from "@/hooks/queries";
import type { AnalyticsPeriod } from "@/lib/api/types";

// ============================================
// Period Selector
// ============================================

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
	{ value: "1D", label: "1D" },
	{ value: "1W", label: "1W" },
	{ value: "1M", label: "1M" },
	{ value: "3M", label: "3M" },
	{ value: "1Y", label: "1Y" },
	{ value: "ALL", label: "All" },
];

interface PeriodSelectorProps {
	value: AnalyticsPeriod;
	onChange: (period: AnalyticsPeriod) => void;
}

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
	return (
		<div className="flex items-center gap-1 bg-cream-100 dark:bg-night-700 rounded-lg p-1">
			{PERIODS.map((period) => (
				<button
					key={period.value}
					type="button"
					onClick={() => onChange(period.value)}
					className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
						value === period.value
							? "bg-white dark:bg-night-600 text-stone-900 dark:text-night-50 shadow-sm"
							: "text-stone-600 dark:text-night-300 hover:text-stone-900 dark:hover:text-night-50"
					}`}
				>
					{period.label}
				</button>
			))}
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export default function CyclesPage() {
	const [period, setPeriod] = useState<AnalyticsPeriod>("1M");

	const filters: CycleAnalyticsFilters = { period };

	const { data: cycleMetrics, isLoading: cycleLoading } = useCycleAnalyticsSummary(filters);
	const { data: decisionMetrics, isLoading: decisionLoading } = useDecisionAnalytics(filters);
	const { data: calibrationData, isLoading: calibrationLoading } =
		useConfidenceCalibration(filters);
	const { data: strategyData, isLoading: strategyLoading } = useStrategyBreakdown(filters);
	const { data: cyclesData, isLoading: cyclesLoading } = useCycleHistory({ pageSize: 10 });

	const isMetricsLoading = cycleLoading || decisionLoading;

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Cycle Analytics
				</h1>
				<PeriodSelector value={period} onChange={setPeriod} />
			</div>

			{/* Metrics Bar */}
			<QueryErrorBoundary title="Failed to load cycle metrics">
				<CycleAnalyticsBar
					cycleMetrics={cycleMetrics}
					decisionMetrics={decisionMetrics}
					isLoading={isMetricsLoading}
				/>
			</QueryErrorBoundary>

			{/* Decision Metrics & Action Distribution Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<QueryErrorBoundary title="Failed to load decision metrics">
					<DecisionMetricsCard metrics={decisionMetrics} isLoading={decisionLoading} />
				</QueryErrorBoundary>

				<QueryErrorBoundary title="Failed to load action distribution">
					<ActionDistributionCard metrics={decisionMetrics} isLoading={decisionLoading} />
				</QueryErrorBoundary>
			</div>

			{/* Calibration & Strategy Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<QueryErrorBoundary title="Failed to load confidence calibration">
					<ConfidenceCalibrationChart data={calibrationData} isLoading={calibrationLoading} />
				</QueryErrorBoundary>

				<QueryErrorBoundary title="Failed to load strategy breakdown">
					<StrategyBreakdownTable data={strategyData} isLoading={strategyLoading} />
				</QueryErrorBoundary>
			</div>

			{/* Recent Cycles Table */}
			<QueryErrorBoundary title="Failed to load recent cycles">
				<RecentCyclesTable cycles={cyclesData?.data} isLoading={cyclesLoading} />
			</QueryErrorBoundary>
		</div>
	);
}
