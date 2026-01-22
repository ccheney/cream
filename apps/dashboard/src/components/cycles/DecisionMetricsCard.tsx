"use client";

/**
 * DecisionMetricsCard Component
 *
 * Displays decision execution metrics including execution rate,
 * status distribution, and average confidence/risk scores.
 */

import { memo } from "react";
import type { DecisionAnalytics } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface DecisionMetricsCardProps {
	metrics?: DecisionAnalytics;
	isLoading?: boolean;
}

// ============================================
// Status Colors
// ============================================

const statusColors: Record<string, string> = {
	pending: "bg-amber-500",
	approved: "bg-green-500",
	rejected: "bg-red-500",
	executed: "bg-blue-500",
	cancelled: "bg-stone-400",
	expired: "bg-stone-300",
};

// ============================================
// Skeleton Component
// ============================================

function DecisionMetricsCardSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="h-4 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
			<div className="space-y-4">
				<div className="h-8 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-4 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="grid grid-cols-2 gap-4">
					<div className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const DecisionMetricsCard = memo(function DecisionMetricsCard({
	metrics,
	isLoading = false,
}: DecisionMetricsCardProps) {
	if (isLoading) {
		return <DecisionMetricsCardSkeleton />;
	}

	const statusEntries = Object.entries(metrics?.statusDistribution ?? {}).toSorted(
		([, a], [, b]) => b - a,
	);
	const total = metrics?.totalDecisions ?? 0;

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h3 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Decision Metrics
			</h3>

			{/* Execution Rate */}
			<div className="mb-4">
				<div className="flex items-baseline justify-between mb-1">
					<span className="text-xs text-stone-500 dark:text-night-400">Execution Rate</span>
					<span className="text-2xl font-semibold font-mono text-stone-900 dark:text-night-50">
						{metrics?.executionRate != null ? `${metrics.executionRate.toFixed(1)}%` : "N/A"}
					</span>
				</div>
				<div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden">
					<div
						className="h-full bg-green-500 transition-all duration-300"
						style={{ width: `${metrics?.executionRate ?? 0}%` }}
					/>
				</div>
			</div>

			{/* Status Distribution Bar */}
			<div className="mb-4">
				<span className="text-xs text-stone-500 dark:text-night-400 block mb-2">
					Status Distribution
				</span>
				{total > 0 ? (
					<>
						<div className="h-3 flex rounded-full overflow-hidden">
							{statusEntries.map(([status, count]) => (
								<div
									key={status}
									className={`${statusColors[status] ?? "bg-stone-400"} transition-all duration-300`}
									style={{ width: `${(count / total) * 100}%` }}
									title={`${status}: ${count} (${((count / total) * 100).toFixed(1)}%)`}
								/>
							))}
						</div>
						<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
							{statusEntries.map(([status, count]) => (
								<div key={status} className="flex items-center gap-1 text-xs">
									<div
										className={`w-2 h-2 rounded-full ${statusColors[status] ?? "bg-stone-400"}`}
									/>
									<span className="text-stone-600 dark:text-night-300 capitalize">{status}</span>
									<span className="text-stone-400 dark:text-night-500 font-mono">{count}</span>
								</div>
							))}
						</div>
					</>
				) : (
					<div className="text-sm text-stone-400 dark:text-night-500">No decisions</div>
				)}
			</div>

			{/* Average Scores */}
			<div className="grid grid-cols-2 gap-4">
				<div className="bg-cream-50 dark:bg-night-700/50 rounded-lg p-3">
					<span className="text-xs text-stone-500 dark:text-night-400 block mb-1">
						Avg Confidence
					</span>
					<span className="text-xl font-semibold font-mono text-stone-900 dark:text-night-50">
						{metrics?.avgConfidence != null
							? `${(metrics.avgConfidence * 100).toFixed(0)}%`
							: "N/A"}
					</span>
				</div>
				<div className="bg-cream-50 dark:bg-night-700/50 rounded-lg p-3">
					<span className="text-xs text-stone-500 dark:text-night-400 block mb-1">Avg Risk</span>
					<span className="text-xl font-semibold font-mono text-stone-900 dark:text-night-50">
						{metrics?.avgRisk != null ? `${(metrics.avgRisk * 100).toFixed(0)}%` : "N/A"}
					</span>
				</div>
			</div>
		</div>
	);
});

export default DecisionMetricsCard;
