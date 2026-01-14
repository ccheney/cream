import { formatDistanceToNow } from "date-fns";
import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SystemStatusBannerProps } from "../types";

const ENV_DESCRIPTIONS: Record<string, string> = {
	BACKTEST: "Historical simulation mode - no real orders",
	PAPER: "Paper trading mode - simulated orders with live data",
	LIVE: "Live trading mode - real orders with real money",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
	ACTIVE: "System is running and executing OODA cycles",
	PAUSED: "System is paused - no new cycles will start",
	STOPPED: "System is stopped - must be started to trade",
};

const ENV_COLORS = {
	BACKTEST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	PAPER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	LIVE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
} as const;

const STATUS_COLORS = {
	ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	STOPPED: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400",
} as const;

export function SystemStatusBanner({
	status,
	isLoading,
}: SystemStatusBannerProps): React.JSX.Element {
	if (isLoading) {
		return <div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
	}

	const envKey = status?.environment as keyof typeof ENV_COLORS;
	const statusKey = status?.status as keyof typeof STATUS_COLORS;

	return (
		<div className="flex items-center justify-between bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 px-4 py-3">
			<div className="flex items-center gap-4">
				<Tooltip>
					<TooltipTrigger>
						<span
							className={`px-3 py-1 text-sm font-medium rounded-full cursor-help ${
								ENV_COLORS[envKey] ?? ENV_COLORS.PAPER
							}`}
						>
							{status?.environment ?? "PAPER"}
						</span>
					</TooltipTrigger>
					<TooltipContent>{ENV_DESCRIPTIONS[envKey] ?? "Trading environment mode"}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>
						<span
							className={`px-3 py-1 text-sm font-medium rounded-full cursor-help ${
								STATUS_COLORS[statusKey] ?? STATUS_COLORS.STOPPED
							}`}
						>
							{status?.status ?? "STOPPED"}
						</span>
					</TooltipTrigger>
					<TooltipContent>
						{STATUS_DESCRIPTIONS[statusKey] ?? "Current system status"}
					</TooltipContent>
				</Tooltip>
			</div>
			{status?.lastCycleTime && (
				<span className="text-sm text-stone-500 dark:text-night-300">
					Last cycle: {formatDistanceToNow(new Date(status.lastCycleTime), { addSuffix: true })}
				</span>
			)}
		</div>
	);
}
