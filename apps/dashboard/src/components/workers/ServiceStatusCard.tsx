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
import type { ServiceStatus } from "@/hooks/queries";
import { cn } from "@/lib/utils";

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
	const { displayName, status, lastRun, nextRun } = service;
	const countdown = useCountdown(nextRun);

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
