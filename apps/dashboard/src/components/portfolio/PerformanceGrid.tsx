"use client";

/**
 * PerformanceGrid Component
 *
 * Displays multi-timeframe returns as compact display cards.
 * 6 periods: Today, Week, Month, 3M, YTD, All-Time
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { memo } from "react";
import type { PerformanceMetrics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export type PerformancePeriod = "today" | "week" | "month" | "threeMonth" | "ytd" | "total";

export interface PerformanceGridProps {
	metrics?: PerformanceMetrics;
	isLoading?: boolean;
}

interface PeriodConfig {
	key: PerformancePeriod;
	label: string;
}

// ============================================
// Constants
// ============================================

const PERIODS: PeriodConfig[] = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "Week" },
	{ key: "month", label: "Month" },
	{ key: "threeMonth", label: "3M" },
	{ key: "ytd", label: "YTD" },
	{ key: "total", label: "All" },
];

// ============================================
// Formatters
// ============================================

function formatCurrency(value: number): string {
	const prefix = value >= 0 ? "+" : "";
	return (
		prefix +
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(value)
	);
}

function formatPercent(value: number): string {
	const prefix = value >= 0 ? "+" : "";
	return `${prefix}${value.toFixed(1)}%`;
}

// ============================================
// Period Card Component
// ============================================

interface PeriodCardProps {
	period: PeriodConfig;
	returnValue: number;
	returnPct: number;
	isLoading: boolean;
}

const PeriodCard = memo(function PeriodCard({
	period,
	returnValue,
	returnPct,
	isLoading,
}: PeriodCardProps) {
	const isZero = returnValue === 0;
	const isPositive = returnValue > 0;
	const valueColor = isZero
		? "text-stone-400 dark:text-night-400"
		: isPositive
			? "text-green-600 dark:text-green-400"
			: "text-red-600 dark:text-red-400";

	if (isLoading) {
		return (
			<div className="flex flex-col items-center px-2 py-1.5 rounded border border-cream-200 dark:border-night-600 bg-cream-50 dark:bg-night-700">
				<div className="h-2.5 w-8 bg-cream-100 dark:bg-night-600 rounded animate-pulse mb-1" />
				<div className="h-3.5 w-10 bg-cream-100 dark:bg-night-600 rounded animate-pulse mb-0.5" />
				<div className="h-3 w-8 bg-cream-100 dark:bg-night-600 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center px-2 py-1.5 rounded border border-cream-200 dark:border-night-600 bg-cream-50 dark:bg-night-700">
			<span className="text-[10px] font-medium text-stone-400 dark:text-night-400 mb-0.5">
				{period.label}
			</span>
			<span className={`text-xs font-semibold font-mono ${valueColor}`}>
				{formatCurrency(returnValue)}
			</span>
			<span className={`text-[10px] font-mono ${valueColor}`}>{formatPercent(returnPct)}</span>
		</div>
	);
});

// ============================================
// Main Component
// ============================================

export const PerformanceGrid = memo(function PerformanceGrid({
	metrics,
	isLoading = false,
}: PerformanceGridProps) {
	return (
		<div className="flex gap-1.5 flex-wrap">
			{PERIODS.map((period) => {
				const periodData = metrics?.periods?.[period.key];
				return (
					<PeriodCard
						key={period.key}
						period={period}
						returnValue={periodData?.return ?? 0}
						returnPct={periodData?.returnPct ?? 0}
						isLoading={isLoading}
					/>
				);
			})}
		</div>
	);
});

export default PerformanceGrid;
