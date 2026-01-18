"use client";

/**
 * ActionDistributionCard Component
 *
 * Displays action (BUY/SELL/HOLD/CLOSE) and direction (LONG/SHORT/FLAT)
 * distributions as visual bars.
 */

import { memo } from "react";
import type { DecisionAnalytics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface ActionDistributionCardProps {
	metrics?: DecisionAnalytics;
	isLoading?: boolean;
}

// ============================================
// Colors
// ============================================

const actionColors: Record<string, string> = {
	BUY: "bg-green-500",
	SELL: "bg-red-500",
	HOLD: "bg-amber-500",
	CLOSE: "bg-blue-500",
	INCREASE: "bg-green-400",
	REDUCE: "bg-red-400",
	NO_TRADE: "bg-stone-400",
};

const directionColors: Record<string, string> = {
	LONG: "bg-green-500",
	SHORT: "bg-red-500",
	FLAT: "bg-stone-400",
};

// ============================================
// Distribution Bar Component
// ============================================

interface DistributionBarProps {
	title: string;
	data: Record<string, number>;
	colors: Record<string, string>;
}

const DistributionBar = memo(function DistributionBar({
	title,
	data,
	colors,
}: DistributionBarProps) {
	const entries = Object.entries(data).toSorted(([, a], [, b]) => b - a);
	const total = entries.reduce((sum, [, count]) => sum + count, 0);

	if (total === 0) {
		return (
			<div>
				<span className="text-xs text-stone-500 dark:text-night-400 block mb-2">{title}</span>
				<div className="text-sm text-stone-400 dark:text-night-500">No data</div>
			</div>
		);
	}

	return (
		<div>
			<span className="text-xs text-stone-500 dark:text-night-400 block mb-2">{title}</span>
			<div className="h-6 flex rounded overflow-hidden mb-2">
				{entries.map(([key, count]) => {
					const pct = (count / total) * 100;
					if (pct < 1) {
						return null;
					}
					return (
						<div
							key={key}
							className={`${colors[key] ?? "bg-stone-400"} flex items-center justify-center text-xs text-white font-medium transition-all duration-300`}
							style={{ width: `${pct}%` }}
							title={`${key}: ${count} (${pct.toFixed(1)}%)`}
						>
							{pct >= 10 ? key : ""}
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1">
				{entries.map(([key, count]) => (
					<div key={key} className="flex items-center gap-1 text-xs">
						<div className={`w-2 h-2 rounded-full ${colors[key] ?? "bg-stone-400"}`} />
						<span className="text-stone-600 dark:text-night-300">{key}</span>
						<span className="text-stone-400 dark:text-night-500 font-mono">{count}</span>
						<span className="text-stone-400 dark:text-night-500">
							({((count / total) * 100).toFixed(0)}%)
						</span>
					</div>
				))}
			</div>
		</div>
	);
});

// ============================================
// Skeleton Component
// ============================================

function ActionDistributionCardSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="h-4 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
			<div className="space-y-6">
				<div className="h-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const ActionDistributionCard = memo(function ActionDistributionCard({
	metrics,
	isLoading = false,
}: ActionDistributionCardProps) {
	if (isLoading) {
		return <ActionDistributionCardSkeleton />;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h3 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Action Distribution
			</h3>

			<div className="space-y-6">
				<DistributionBar
					title="By Action"
					data={metrics?.actionDistribution ?? {}}
					colors={actionColors}
				/>

				<DistributionBar
					title="By Direction"
					data={metrics?.directionDistribution ?? {}}
					colors={directionColors}
				/>
			</div>
		</div>
	);
});

export default ActionDistributionCard;
