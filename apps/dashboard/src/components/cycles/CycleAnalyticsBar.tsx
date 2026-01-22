"use client";

/**
 * CycleAnalyticsBar Component
 *
 * Displays 6 key cycle metrics in a horizontal row.
 * Metrics: Completion, Approval, Execution, Avg Duration, Decisions, Orders
 */

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CycleAnalyticsSummary, DecisionAnalytics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface CycleAnalyticsBarProps {
	cycleMetrics?: CycleAnalyticsSummary;
	decisionMetrics?: DecisionAnalytics;
	isLoading?: boolean;
}

interface MetricConfig {
	key: string;
	label: string;
	tooltip: string;
	format: (cycleMetrics?: CycleAnalyticsSummary, decisionMetrics?: DecisionAnalytics) => string;
	getVariant?: (
		cycleMetrics?: CycleAnalyticsSummary,
		decisionMetrics?: DecisionAnalytics,
	) => "default" | "positive" | "negative" | "warning";
}

// ============================================
// Formatters
// ============================================

function formatPercent(value: number | undefined | null): string {
	if (value == null) {
		return "N/A";
	}
	return `${value.toFixed(1)}%`;
}

function formatDuration(ms: number | null | undefined): string {
	if (ms == null) {
		return "N/A";
	}
	if (ms < 1000) {
		return `${ms}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(value: number | undefined): string {
	if (value == null) {
		return "0";
	}
	return value.toLocaleString();
}

// ============================================
// Metric Configuration
// ============================================

const METRICS: MetricConfig[] = [
	{
		key: "completion",
		label: "Completion",
		tooltip: "Percentage of cycles that completed successfully (vs failed/running)",
		format: (c) => formatPercent(c?.completionRate),
		getVariant: (c) =>
			(c?.completionRate ?? 0) >= 90
				? "positive"
				: (c?.completionRate ?? 0) >= 70
					? "default"
					: "warning",
	},
	{
		key: "approval",
		label: "Approval",
		tooltip: "Percentage of completed cycles that were approved for execution",
		format: (c) => formatPercent(c?.approvalRate),
		getVariant: (c) =>
			(c?.approvalRate ?? 0) >= 80
				? "positive"
				: (c?.approvalRate ?? 0) >= 50
					? "default"
					: "warning",
	},
	{
		key: "execution",
		label: "Execution",
		tooltip: "Percentage of decisions that were executed or approved",
		format: (_, d) => formatPercent(d?.executionRate),
		getVariant: (_, d) =>
			(d?.executionRate ?? 0) >= 70
				? "positive"
				: (d?.executionRate ?? 0) >= 40
					? "default"
					: "warning",
	},
	{
		key: "duration",
		label: "Avg Duration",
		tooltip: "Average time to complete a cycle",
		format: (c) => formatDuration(c?.avgDurationMs),
		getVariant: (c) =>
			(c?.avgDurationMs ?? 0) <= 60000
				? "positive"
				: (c?.avgDurationMs ?? 0) <= 300000
					? "default"
					: "warning",
	},
	{
		key: "decisions",
		label: "Decisions",
		tooltip: "Total number of trading decisions generated",
		format: (c) => formatNumber(c?.totalDecisions),
		getVariant: () => "default",
	},
	{
		key: "orders",
		label: "Orders",
		tooltip: "Total number of orders submitted",
		format: (c) => formatNumber(c?.totalOrders),
		getVariant: () => "default",
	},
];

// ============================================
// Metric Item Component
// ============================================

interface MetricItemProps {
	config: MetricConfig;
	cycleMetrics?: CycleAnalyticsSummary;
	decisionMetrics?: DecisionAnalytics;
	isLoading: boolean;
}

const MetricItem = memo(function MetricItem({
	config,
	cycleMetrics,
	decisionMetrics,
	isLoading,
}: MetricItemProps) {
	const variantClasses = {
		default: "text-stone-900 dark:text-night-50",
		positive: "text-green-600 dark:text-green-400",
		negative: "text-red-600 dark:text-red-400",
		warning: "text-amber-600 dark:text-amber-400",
	};

	const variant = config.getVariant?.(cycleMetrics, decisionMetrics) ?? "default";

	if (isLoading) {
		return (
			<div className="text-center space-y-1">
				<div className="h-3 w-12 mx-auto bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-6 w-16 mx-auto bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="text-center space-y-1 cursor-help">
					<span className="text-xs text-stone-400 dark:text-night-500">{config.label}</span>
					<div className={`text-lg font-semibold font-mono ${variantClasses[variant]}`}>
						{config.format(cycleMetrics, decisionMetrics)}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent position="top">{config.tooltip}</TooltipContent>
		</Tooltip>
	);
});

// ============================================
// Main Component
// ============================================

export const CycleAnalyticsBar = memo(function CycleAnalyticsBar({
	cycleMetrics,
	decisionMetrics,
	isLoading = false,
}: CycleAnalyticsBarProps) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Cycle Metrics
			</h2>
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
				{METRICS.map((config) => (
					<MetricItem
						key={config.key}
						config={config}
						cycleMetrics={cycleMetrics}
						decisionMetrics={decisionMetrics}
						isLoading={isLoading}
					/>
				))}
			</div>
		</div>
	);
});

export default CycleAnalyticsBar;
