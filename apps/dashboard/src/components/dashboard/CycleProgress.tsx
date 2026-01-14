"use client";

import { useMemo } from "react";
import { type CycleStatus, useCycleProgress } from "@/hooks/useCycleProgress";
import type { CyclePhase } from "@/lib/api/types";

export interface CycleProgressProps {
	/** Cycle ID to track */
	cycleId: string;
	/** Called when cycle completes */
	onComplete?: () => void;
	/** Called when cycle fails */
	onError?: (error: string) => void;
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

const phaseLabels: Record<CyclePhase | string, string> = {
	OBSERVE: "Observing",
	ORIENT: "Orienting",
	DECIDE: "Deciding",
	ACT: "Acting",
	COMPLETE: "Complete",
};

const phaseDescriptions: Record<CyclePhase | string, string> = {
	OBSERVE: "Gathering market data, candles, and news",
	ORIENT: "Processing indicators and regime detection",
	DECIDE: "Agent network deliberating on positions",
	ACT: "Executing approved orders",
	COMPLETE: "Cycle finished",
};

const statusColors: Record<CycleStatus, { bar: string; bg: string; text: string }> = {
	idle: {
		bar: "bg-stone-400 dark:bg-stone-500",
		bg: "bg-stone-200 dark:bg-stone-700",
		text: "text-stone-600 dark:text-stone-400",
	},
	running: {
		bar: "bg-blue-500 dark:bg-blue-400",
		bg: "bg-blue-100 dark:bg-blue-900/30",
		text: "text-blue-600 dark:text-blue-400",
	},
	completed: {
		bar: "bg-green-500 dark:bg-green-400",
		bg: "bg-green-100 dark:bg-green-900/30",
		text: "text-green-600 dark:text-green-400",
	},
	failed: {
		bar: "bg-red-500 dark:bg-red-400",
		bg: "bg-red-100 dark:bg-red-900/30",
		text: "text-red-600 dark:text-red-400",
	},
};

export function CycleProgress({ cycleId, onComplete, onError }: CycleProgressProps) {
	const { status, progress, phase, currentStep, error, result } = useCycleProgress(cycleId);

	useMemo(() => {
		if (status === "completed" && onComplete) {
			onComplete();
		}
		if (status === "failed" && error && onError) {
			onError(error);
		}
	}, [status, error, onComplete, onError]);

	const colors = statusColors[status];
	const percentage = progress?.progress ?? 0;
	const phaseLabel = phase ? (phaseLabels[phase] ?? phase) : "Starting";
	const phaseDescription = phase
		? (phaseDescriptions[phase] ?? currentStep ?? "Processing...")
		: "Initializing cycle...";

	return (
		<div className="space-y-3 overflow-hidden">
			<div className="flex items-center justify-between min-w-0">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<span
						className={cn(
							"text-sm font-medium shrink-0",
							colors.text,
							status === "running" && "animate-pulse"
						)}
					>
						{phaseLabel}
					</span>
					{progress?.activeSymbol && (
						<span className="text-xs text-stone-500 dark:text-stone-400 truncate">
							({progress.activeSymbol})
						</span>
					)}
				</div>
				<span className={cn("text-sm font-medium tabular-nums shrink-0 ml-2", colors.text)}>
					{Math.round(percentage)}%
				</span>
			</div>

			<div
				role="progressbar"
				aria-valuenow={percentage}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Cycle progress"
				className={cn("w-full h-2 rounded-full overflow-hidden", colors.bg)}
			>
				<div
					className={cn(
						"h-full rounded-full transition-all duration-300 ease-out",
						colors.bar,
						status === "running" && "animate-pulse"
					)}
					style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
				/>
			</div>

			<p className="text-sm text-stone-600 dark:text-stone-400 break-words">{phaseDescription}</p>

			{progress?.totalSymbols && progress.totalSymbols > 0 && (
				<p className="text-xs text-stone-500 dark:text-stone-500">
					{progress.completedSymbols ?? 0} / {progress.totalSymbols} symbols processed
				</p>
			)}

			{status === "failed" && error && (
				<div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
					{error}
				</div>
			)}

			{status === "completed" && result?.result && (
				<div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm">
					<div className="flex items-center gap-4 text-green-700 dark:text-green-300">
						<span>
							{result.result.approved ? "Approved" : "No action"} in {result.result.iterations}{" "}
							iteration(s)
						</span>
						{result.result.decisions.length > 0 && (
							<span>{result.result.decisions.length} decision(s)</span>
						)}
						{result.result.orders.length > 0 && <span>{result.result.orders.length} order(s)</span>}
					</div>
					<p className="text-xs text-green-600 dark:text-green-400 mt-1">
						Duration: {(result.durationMs / 1000).toFixed(1)}s
					</p>
				</div>
			)}
		</div>
	);
}

export default CycleProgress;
