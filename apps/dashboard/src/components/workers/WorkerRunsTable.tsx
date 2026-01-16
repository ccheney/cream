/**
 * Worker Runs Table
 *
 * Dense table showing recent runs across all services.
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { memo } from "react";
import type { WorkerRun, WorkerService } from "@/hooks/queries";
import { cn } from "@/lib/utils";

// ============================================
// Service Display Names
// ============================================

const serviceDisplayNames: Record<WorkerService, string> = {
	macro_watch: "Macro Watch",
	newspaper: "Newspaper",
	filings_sync: "Filings Sync",
	short_interest: "Short Interest",
	sentiment: "Sentiment",
	corporate_actions: "Corporate Actions",
	fundamentals: "Fundamentals",
};

// ============================================
// Status Badge Component
// ============================================

type RunStatus = "pending" | "running" | "completed" | "failed";

const statusStyles: Record<RunStatus, string> = {
	pending: "bg-stone-100 dark:bg-night-700 text-stone-600 dark:text-night-300",
	running: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
	completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
	failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

const statusDots: Record<RunStatus, string> = {
	pending: "bg-stone-400 dark:bg-night-500",
	running: "bg-amber-500 animate-pulse",
	completed: "bg-emerald-500",
	failed: "bg-red-500",
};

function StatusBadge({ status }: { status: RunStatus }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium",
				statusStyles[status]
			)}
		>
			<span className={cn("w-1.5 h-1.5 rounded-full", statusDots[status])} />
			{status.charAt(0).toUpperCase() + status.slice(1)}
		</span>
	);
}

// ============================================
// Duration Formatter
// ============================================

function formatDuration(seconds: number | null): string {
	if (seconds === null) {
		return "--";
	}
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

// ============================================
// Loading Skeleton
// ============================================

function WorkerRunsTableSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700">
				<div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
			<div className="p-4 space-y-3">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="h-10 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		</div>
	);
}

// ============================================
// Props Interface
// ============================================

export interface WorkerRunsTableProps {
	runs: WorkerRun[] | undefined;
	isLoading: boolean;
	isFetching?: boolean;
	onRefresh: () => void;
}

// ============================================
// Main Component
// ============================================

function WorkerRunsTableComponent({
	runs,
	isLoading,
	isFetching = false,
	onRefresh,
}: WorkerRunsTableProps) {
	if (isLoading) {
		return <WorkerRunsTableSkeleton />;
	}

	if (!runs || runs.length === 0) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
				<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
					<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Recent Runs</h3>
					<button
						type="button"
						onClick={onRefresh}
						disabled={isFetching}
						className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
					>
						<RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
					</button>
				</div>
				<div className="flex h-32 items-center justify-center text-stone-500 dark:text-night-400">
					No recent runs
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Recent Runs</h3>
				<button
					type="button"
					onClick={onRefresh}
					disabled={isFetching}
					className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
				>
					<RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
				</button>
			</div>

			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-cream-200 dark:divide-night-700">
					<thead className="bg-cream-50 dark:bg-night-750">
						<tr>
							<th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
								Service
							</th>
							<th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
								Status
							</th>
							<th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
								Started
							</th>
							<th className="px-4 py-2 text-right text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
								Duration
							</th>
							<th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
								Result
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-cream-100 dark:divide-night-700">
						{runs.map((run) => (
							<tr
								key={run.id}
								className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors"
							>
								<td className="px-4 py-3 text-sm text-stone-900 dark:text-night-50 font-medium">
									{serviceDisplayNames[run.service]}
								</td>
								<td className="px-4 py-3">
									<StatusBadge status={run.status} />
								</td>
								<td className="px-4 py-3 text-sm text-stone-500 dark:text-night-300">
									{formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
								</td>
								<td className="px-4 py-3 text-right font-mono text-sm text-stone-600 dark:text-night-200">
									{formatDuration(run.duration)}
								</td>
								<td className="px-4 py-3 text-sm text-stone-500 dark:text-night-300 max-w-xs truncate">
									{run.result ?? run.error ?? "--"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export const WorkerRunsTable = memo(WorkerRunsTableComponent);
