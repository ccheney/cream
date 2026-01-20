/**
 * Service Status Card
 *
 * Compact card showing service health and trigger button.
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { formatDistanceToNow } from "date-fns";
import { Clock, Play } from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { ServiceStatus, WorkerService } from "@/hooks/queries";
import { cn } from "@/lib/utils";

// ============================================
// Data Source Configuration
// ============================================

interface DataSource {
	label: string;
	color: string;
}

const DATA_SOURCES: Record<WorkerService, DataSource[]> = {
	macro_watch: [
		{
			label: "Benzinga",
			color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
		},
	],
	newspaper: [
		{
			label: "Benzinga",
			color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
		},
	],
	filings_sync: [
		{
			label: "SEC EDGAR",
			color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
		},
	],
	short_interest: [
		{
			label: "FINRA",
			color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
		},
	],
	sentiment: [
		{
			label: "Alpaca",
			color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
		},
	],
	corporate_actions: [
		{
			label: "Alpaca",
			color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
		},
	],
	prediction_markets: [
		{
			label: "Polymarket",
			color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
		},
		{
			label: "Kalshi",
			color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
		},
	],
};

// ============================================
// Status Dot Component
// ============================================

type DotStatus = "idle" | "running" | "success" | "failed";

function StatusDot({ status }: { status: DotStatus }) {
	return (
		<span
			className={cn(
				"h-2 w-2 rounded-full inline-block flex-shrink-0",
				status === "idle" && "bg-stone-400 dark:bg-night-500",
				status === "running" && "bg-amber-500 animate-pulse",
				status === "success" && "bg-emerald-500",
				status === "failed" && "bg-red-500"
			)}
		/>
	);
}

// ============================================
// Countdown Hook
// ============================================

function useCountdown(targetDate: string | null): string | null {
	const [countdown, setCountdown] = useState<string | null>(null);

	useEffect(() => {
		if (!targetDate) {
			setCountdown(null);
			return;
		}

		const calculateCountdown = () => {
			const now = Date.now();
			const target = new Date(targetDate).getTime();
			const diff = target - now;

			if (diff <= 0) {
				return "now";
			}

			const hours = Math.floor(diff / (1000 * 60 * 60));
			const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
			const seconds = Math.floor((diff % (1000 * 60)) / 1000);

			if (hours > 0) {
				return `${hours}h ${minutes}m`;
			}
			if (minutes > 0) {
				return `${minutes}m ${seconds}s`;
			}
			return `${seconds}s`;
		};

		setCountdown(calculateCountdown());

		const interval = setInterval(() => {
			setCountdown(calculateCountdown());
		}, 1000);

		return () => clearInterval(interval);
	}, [targetDate]);

	return countdown;
}

// ============================================
// Props Interface
// ============================================

export interface ServiceStatusCardProps {
	service: ServiceStatus;
	onTrigger: () => void;
	triggerLabel?: string;
	disabled?: boolean;
	isPending?: boolean;
}

// ============================================
// Main Component
// ============================================

function ServiceStatusCardComponent({
	service,
	onTrigger,
	triggerLabel = "Trigger",
	disabled = false,
	isPending = false,
}: ServiceStatusCardProps) {
	const { name, displayName, status, lastRun, nextRun } = service;
	const countdown = useCountdown(nextRun);
	const dataSources = DATA_SOURCES[name] ?? [];

	const getDotStatus = (): DotStatus => {
		if (status === "running") {
			return "running";
		}
		if (lastRun?.status === "completed") {
			return "success";
		}
		if (lastRun?.status === "failed") {
			return "failed";
		}
		return "idle";
	};

	const dotStatus = getDotStatus();

	const getLastRunText = (): string => {
		if (status === "running") {
			return "Running...";
		}
		if (!lastRun) {
			return "Never run";
		}
		return formatDistanceToNow(new Date(lastRun.startedAt), { addSuffix: true });
	};

	const isDisabled = disabled || isPending || status === "running";

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-center gap-2 min-w-0">
					<StatusDot status={dotStatus} />
					<h4 className="font-medium text-stone-900 dark:text-night-50 truncate">{displayName}</h4>
				</div>
				{countdown && (
					<div className="flex items-center gap-1 text-xs text-stone-500 dark:text-night-400 font-mono flex-shrink-0">
						<Clock className="w-3 h-3" />
						<span>{countdown}</span>
					</div>
				)}
			</div>

			{dataSources.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mb-3">
					{dataSources.map((source) => (
						<span
							key={source.label}
							className={cn(
								"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
								source.color
							)}
						>
							{source.label}
						</span>
					))}
				</div>
			)}

			<div className="flex items-center justify-between">
				<span className="text-sm text-stone-500 dark:text-night-300">{getLastRunText()}</span>
				<button
					type="button"
					onClick={onTrigger}
					disabled={isDisabled}
					className={cn(
						"inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
						isDisabled
							? "bg-stone-100 dark:bg-night-700 text-stone-400 dark:text-night-500 cursor-not-allowed"
							: "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
					)}
				>
					<Play className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
					{isPending ? "..." : triggerLabel}
				</button>
			</div>

			{lastRun?.result && (
				<div className="mt-2 pt-2 border-t border-cream-100 dark:border-night-700">
					<span className="text-xs text-stone-500 dark:text-night-400 font-mono">
						{lastRun.result}
					</span>
				</div>
			)}
		</div>
	);
}

export const ServiceStatusCard = memo(ServiceStatusCardComponent);
