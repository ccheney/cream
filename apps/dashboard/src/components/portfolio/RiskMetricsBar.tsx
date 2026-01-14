"use client";

/**
 * RiskMetricsBar Component
 *
 * Displays 6 key risk statistics in a horizontal row.
 * Metrics: Sharpe, Sortino, Max DD, Current DD, Win Rate, Profit Factor
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PerformanceMetrics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface RiskMetricsBarProps {
	metrics?: PerformanceMetrics;
	isLoading?: boolean;
}

interface MetricConfig {
	key: string;
	label: string;
	tooltip: string;
	format: (value: number) => string;
	getValue: (metrics: PerformanceMetrics) => number;
	getVariant?: (value: number) => "default" | "positive" | "negative" | "warning";
}

// ============================================
// Formatters
// ============================================

function formatRatio(value: number): string {
	return value.toFixed(2);
}

function formatPercent(value: number): string {
	const prefix = value > 0 ? "+" : "";
	return `${prefix}${value.toFixed(1)}%`;
}

function formatPercentPositive(value: number): string {
	return `${value.toFixed(1)}%`;
}

// ============================================
// Metric Configuration
// ============================================

const METRICS: MetricConfig[] = [
	{
		key: "sharpe",
		label: "Sharpe",
		tooltip: "Risk-adjusted return (higher is better, >1 is good, >2 is excellent)",
		format: formatRatio,
		getValue: (m) => m.sharpeRatio,
		getVariant: (v) => (v >= 2 ? "positive" : v >= 1 ? "default" : "warning"),
	},
	{
		key: "sortino",
		label: "Sortino",
		tooltip: "Downside risk-adjusted return (higher is better, focuses on bad volatility)",
		format: formatRatio,
		getValue: (m) => m.sortinoRatio,
		getVariant: (v) => (v >= 2 ? "positive" : v >= 1 ? "default" : "warning"),
	},
	{
		key: "maxDD",
		label: "Max DD",
		tooltip: "Largest peak-to-trough decline (worst historical drawdown)",
		format: formatPercent,
		getValue: (m) => m.maxDrawdownPct,
		getVariant: (v) => (v <= -20 ? "negative" : v <= -10 ? "warning" : "default"),
	},
	{
		key: "currentDD",
		label: "Current DD",
		tooltip: "Current decline from peak equity",
		format: formatPercent,
		getValue: (m) => m.currentDrawdownPct,
		getVariant: (v) => (v <= -15 ? "negative" : v <= -5 ? "warning" : "default"),
	},
	{
		key: "winRate",
		label: "Win Rate",
		tooltip: "Percentage of trades that were profitable",
		format: formatPercentPositive,
		getValue: (m) => m.winRate * 100,
		getVariant: (v) => (v >= 55 ? "positive" : v >= 45 ? "default" : "warning"),
	},
	{
		key: "profitFactor",
		label: "Profit Factor",
		tooltip: "Gross profit / gross loss (>1 means profitable, >2 is excellent)",
		format: formatRatio,
		getValue: (m) => m.profitFactor,
		getVariant: (v) => (v >= 2 ? "positive" : v >= 1.5 ? "default" : "warning"),
	},
];

// ============================================
// Metric Item Component
// ============================================

interface MetricItemProps {
	config: MetricConfig;
	value: number;
	isLoading: boolean;
}

const MetricItem = memo(function MetricItem({ config, value, isLoading }: MetricItemProps) {
	const variantClasses = {
		default: "text-stone-900 dark:text-night-50",
		positive: "text-green-600 dark:text-green-400",
		negative: "text-red-600 dark:text-red-400",
		warning: "text-amber-600 dark:text-amber-400",
	};

	const variant = config.getVariant?.(value) ?? "default";

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
						{config.format(value)}
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

export const RiskMetricsBar = memo(function RiskMetricsBar({
	metrics,
	isLoading = false,
}: RiskMetricsBarProps) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Risk Metrics
			</h2>
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
				{METRICS.map((config) => (
					<MetricItem
						key={config.key}
						config={config}
						value={metrics ? config.getValue(metrics) : 0}
						isLoading={isLoading}
					/>
				))}
			</div>
		</div>
	);
});

export default RiskMetricsBar;
