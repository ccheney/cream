import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardHeaderProps } from "../types";

function SystemControls({
	status,
	isLoading,
	onStart,
	onStop,
	onPause,
	isStarting,
	isStopping,
	isPausing,
}: DashboardHeaderProps["systemControls"]): React.JSX.Element {
	const systemStatus = status?.status;

	// Default to showing Start enabled when status unknown (but not during initial load)
	const canStart = !systemStatus || systemStatus === "STOPPED" || systemStatus === "PAUSED";
	const canPause = systemStatus === "ACTIVE";
	const canStop = systemStatus === "ACTIVE" || systemStatus === "PAUSED";

	return (
		<>
			<button
				type="button"
				onClick={onPause}
				disabled={!canPause || isPausing || isLoading}
				className="px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-stone-600 dark:text-night-300 bg-cream-100 hover:bg-cream-200 dark:bg-night-700 dark:hover:bg-night-600 border border-cream-200 dark:border-night-600"
			>
				{isPausing ? "Pausing..." : "Pause"}
			</button>
			<button
				type="button"
				onClick={onStop}
				disabled={!canStop || isStopping || isLoading}
				className="px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-red-700 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800"
			>
				{isStopping ? "Stopping..." : "Stop"}
			</button>
			<button
				type="button"
				onClick={onStart}
				disabled={!canStart || isStarting || isLoading}
				className="px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-emerald-700 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800"
			>
				{isStarting ? "Starting..." : systemStatus === "PAUSED" ? "Resume" : "Start"}
			</button>
		</>
	);
}

export function DashboardHeader({
	connected: _connected,
	statusFetching: _statusFetching,
	nextCycleDisplay,
	systemControls,
}: DashboardHeaderProps): React.JSX.Element {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-3">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Console</h1>
			</div>
			<div className="flex items-center gap-4">
				<Tooltip>
					<TooltipTrigger>
						<span className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400 cursor-help">
							Next cycle in: {nextCycleDisplay}
						</span>
					</TooltipTrigger>
					<TooltipContent>Time until next OODA trading cycle starts</TooltipContent>
				</Tooltip>
				<div className="flex items-center gap-2">
					<SystemControls {...systemControls} />
				</div>
			</div>
		</div>
	);
}
