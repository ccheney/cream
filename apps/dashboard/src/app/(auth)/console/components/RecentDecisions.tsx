import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type React from "react";
import { LiveDataIndicator } from "@/components/ui/RefreshIndicator";
import type { DecisionAction, DecisionStatus } from "@/lib/api/types/trading";
import type { RecentDecisionsProps } from "../types";

function getActionColor(action: DecisionAction): string {
	switch (action) {
		case "BUY":
			return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
		case "SELL":
		case "CLOSE":
			return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
		default:
			return "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";
	}
}

function getStatusColor(status: DecisionStatus): string {
	switch (status) {
		case "EXECUTED":
			return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
		case "PENDING":
		case "APPROVED":
			return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
		case "REJECTED":
		case "FAILED":
			return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
		default:
			return "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";
	}
}

export function RecentDecisions({
	decisions,
	isLoading,
	isFetching,
}: RecentDecisionsProps): React.JSX.Element {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Recent Decisions</h2>
				<LiveDataIndicator
					isRefreshing={isFetching}
					lastUpdated={decisions?.[0]?.createdAt}
					className="text-stone-500 dark:text-night-300"
				/>
			</div>
			{isLoading ? (
				<div className="space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			) : decisions && decisions.length > 0 ? (
				<div className="space-y-2">
					{decisions.map((decision) => (
						<Link
							key={decision.id}
							href={`/decisions?cycle=${decision.cycleId}`}
							className="flex items-center justify-between py-2 border-b border-cream-100 dark:border-night-700 last:border-0 hover:bg-cream-50 dark:hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors"
						>
							<div className="flex items-center gap-3">
								<span
									className={`px-2 py-0.5 text-xs font-medium rounded ${getActionColor(decision.action)}`}
								>
									{decision.action}
								</span>
								<span className="font-medium text-stone-900 dark:text-night-50">
									{decision.symbol}
								</span>
								<span className="text-sm text-stone-500 dark:text-night-300">
									{decision.size} {decision.sizeUnit.toLowerCase()}
								</span>
							</div>
							<div className="flex items-center gap-3">
								<span
									className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(decision.status)}`}
								>
									{decision.status}
								</span>
								<span className="text-sm text-stone-500 dark:text-night-300">
									{formatDistanceToNow(new Date(decision.createdAt), {
										addSuffix: true,
									})}
								</span>
							</div>
						</Link>
					))}
				</div>
			) : (
				<p className="text-stone-500 dark:text-night-300">No decisions yet</p>
			)}
		</div>
	);
}
