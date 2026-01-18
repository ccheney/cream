"use client";

/**
 * RecentCyclesTable Component
 *
 * Simple table showing recent OODA cycles with status, timing, and decision counts.
 */

import { formatDistanceToNow, formatDuration, intervalToDuration } from "date-fns";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import type { CycleListItem } from "@/hooks/queries/useCycleHistory";

// ============================================
// Types
// ============================================

export interface RecentCyclesTableProps {
	cycles?: CycleListItem[];
	isLoading?: boolean;
}

// ============================================
// Status Badge Component
// ============================================

interface StatusBadgeProps {
	status: CycleListItem["status"];
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
	const config = {
		running: {
			icon: <Loader2 className="w-3 h-3 animate-spin" />,
			bg: "bg-amber-100 dark:bg-amber-900/30",
			text: "text-amber-700 dark:text-amber-400",
			label: "Running",
		},
		completed: {
			icon: <CheckCircle className="w-3 h-3" />,
			bg: "bg-emerald-100 dark:bg-emerald-900/30",
			text: "text-emerald-700 dark:text-emerald-400",
			label: "Completed",
		},
		failed: {
			icon: <XCircle className="w-3 h-3" />,
			bg: "bg-red-100 dark:bg-red-900/30",
			text: "text-red-700 dark:text-red-400",
			label: "Failed",
		},
	};

	const c = config[status];

	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}
		>
			{c.icon}
			{c.label}
		</span>
	);
});

// ============================================
// Skeleton Component
// ============================================

function RecentCyclesTableSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="px-5 py-4 border-b border-cream-200 dark:border-night-700">
				<div className="h-4 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
			<div className="divide-y divide-cream-100 dark:divide-night-700">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="px-5 py-3">
						<div className="h-8 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					</div>
				))}
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const RecentCyclesTable = memo(function RecentCyclesTable({
	cycles,
	isLoading = false,
}: RecentCyclesTableProps) {
	if (isLoading) {
		return <RecentCyclesTableSkeleton />;
	}

	const hasData = cycles && cycles.length > 0;

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="px-5 py-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h3 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
					Recent Cycles
				</h3>
				<Link
					href="/console"
					className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
				>
					View in Console
				</Link>
			</div>

			{hasData ? (
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="text-left text-xs text-stone-500 dark:text-night-400 uppercase tracking-wider bg-cream-50 dark:bg-night-700/50">
								<th className="px-5 py-2">ID</th>
								<th className="px-5 py-2">Status</th>
								<th className="px-5 py-2">Started</th>
								<th className="px-5 py-2">Duration</th>
								<th className="px-5 py-2">Decisions</th>
								<th className="px-5 py-2">Approved</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-cream-100 dark:divide-night-700">
							{cycles.map((cycle) => {
								const durationStr = cycle.durationMs
									? formatDuration(intervalToDuration({ start: 0, end: cycle.durationMs }), {
											format: ["minutes", "seconds"],
										})
									: "—";

								return (
									<tr
										key={cycle.id}
										className="text-sm hover:bg-cream-50 dark:hover:bg-night-700/30"
									>
										<td className="px-5 py-3">
											<span className="font-mono text-xs text-stone-600 dark:text-night-300">
												{cycle.id.slice(0, 8)}...
											</span>
										</td>
										<td className="px-5 py-3">
											<StatusBadge status={cycle.status} />
										</td>
										<td className="px-5 py-3">
											<span className="flex items-center gap-1 text-xs text-stone-500 dark:text-night-400">
												<Clock className="w-3 h-3" />
												{formatDistanceToNow(new Date(cycle.startedAt), { addSuffix: true })}
											</span>
										</td>
										<td className="px-5 py-3">
											<span className="text-xs font-mono text-stone-600 dark:text-night-300">
												{durationStr}
											</span>
										</td>
										<td className="px-5 py-3">
											<span className="font-mono text-stone-700 dark:text-night-200">
												{cycle.decisionsCount}
											</span>
										</td>
										<td className="px-5 py-3">
											<span
												className={`text-xs font-medium ${
													cycle.approved
														? "text-emerald-600 dark:text-emerald-400"
														: cycle.approved === false
															? "text-red-600 dark:text-red-400"
															: "text-stone-400 dark:text-night-500"
												}`}
											>
												{cycle.approved ? "Yes" : cycle.approved === false ? "No" : "—"}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : (
				<div className="px-5 py-8 text-center text-sm text-stone-400 dark:text-night-500">
					No cycles recorded yet
				</div>
			)}
		</div>
	);
});

export default RecentCyclesTable;
