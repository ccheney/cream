import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOODAPhaseStatus } from "../hooks";
import type { OODAPhaseCardProps } from "../types";

const OODA_DESCRIPTIONS: Record<string, string> = {
	Observe: "Gather market data, candles, and news for analysis",
	Orient: "Process data through indicators and regime detection",
	Decide: "Agent network deliberates and forms consensus",
	Act: "Execute approved orders via broker API",
};

const STATUS_COLORS = {
	idle: "text-stone-500 dark:text-night-300",
	active: "text-blue-600 dark:text-blue-400",
	complete: "text-green-600 dark:text-green-400",
} as const;

const STATUS_ICONS = {
	idle: "\u25CB",
	active: "\u25C9",
	complete: "\u2713",
} as const;

const STATUS_LABELS = {
	idle: "Waiting",
	active: "Active",
	complete: "Complete",
} as const;

export function OODAPhaseCard({
	phase,
	currentPhase,
	isRunning,
	isLoading,
}: OODAPhaseCardProps): React.JSX.Element {
	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
				<div className="h-6 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	const status = getOODAPhaseStatus(phase, currentPhase, isRunning);

	return (
		<Tooltip>
			<TooltipTrigger>
				<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 relative cursor-help">
					{status === "active" && (
						<span className="absolute top-2 right-2">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
							</span>
						</span>
					)}
					{status === "complete" && (
						<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" />
					)}
					<div className="text-sm text-stone-500 dark:text-night-300">{phase}</div>
					<div
						className={`mt-1 text-lg font-medium flex items-center gap-2 ${STATUS_COLORS[status]}`}
					>
						<span>{STATUS_ICONS[status]}</span>
						<span>{STATUS_LABELS[status]}</span>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>{OODA_DESCRIPTIONS[phase] ?? phase}</TooltipContent>
		</Tooltip>
	);
}
