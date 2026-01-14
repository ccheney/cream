/** @see docs/plans/ui/40-streaming-data-integration.md Part 6.3 */

"use client";

import { RefreshCw, Wifi, WifiOff, Zap } from "lucide-react";
import { memo } from "react";

export interface ConnectionStatusProps {
	state: "connected" | "connecting" | "reconnecting" | "disconnected";
	attempt?: number;
	maxAttempts?: number;
	nextRetryIn?: number | null;
	showDetails?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
}

export const ConnectionStatus = memo(function ConnectionStatus({
	state,
	attempt = 0,
	maxAttempts = 10,
	nextRetryIn,
	showDetails = false,
	size = "md",
	className = "",
}: ConnectionStatusProps) {
	const sizeClasses = {
		sm: { dot: "w-1.5 h-1.5", text: "text-xs", icon: "w-3 h-3" },
		md: { dot: "w-2 h-2", text: "text-sm", icon: "w-4 h-4" },
		lg: { dot: "w-2.5 h-2.5", text: "text-base", icon: "w-5 h-5" },
	};

	const styles = sizeClasses[size];

	const stateConfig = {
		connected: {
			dotColor: "bg-green-500",
			textColor: "text-green-600 dark:text-green-400",
			label: "Connected",
			icon: Wifi,
			animate: false,
		},
		connecting: {
			dotColor: "bg-yellow-500",
			textColor: "text-yellow-600 dark:text-yellow-400",
			label: "Connecting...",
			icon: RefreshCw,
			animate: true,
		},
		reconnecting: {
			dotColor: "bg-yellow-500",
			textColor: "text-yellow-600 dark:text-yellow-400",
			label: `Reconnecting (${attempt}/${maxAttempts})`,
			icon: RefreshCw,
			animate: true,
		},
		disconnected: {
			dotColor: "bg-red-500",
			textColor: "text-red-600 dark:text-red-400",
			label: "Disconnected",
			icon: WifiOff,
			animate: false,
		},
	};

	const config = stateConfig[state];
	const Icon = config.icon;

	return (
		<output className={`flex items-center gap-2 ${className}`} aria-live="polite">
			<span
				className={`${styles.dot} rounded-full ${config.dotColor} ${config.animate ? "animate-pulse" : ""}`}
			/>

			{(showDetails || size === "lg") && (
				<Icon
					className={`${styles.icon} ${config.textColor} ${config.animate ? "animate-spin" : ""}`}
				/>
			)}

			<span className={`${styles.text} ${config.textColor}`}>{config.label}</span>

			{state === "reconnecting" &&
				nextRetryIn !== null &&
				nextRetryIn !== undefined &&
				nextRetryIn > 0 && (
					<span className={`${styles.text} text-stone-500 dark:text-night-300`}>
						({nextRetryIn}s)
					</span>
				)}

			{state === "connected" && showDetails && (
				<span title="Streaming active">
					<Zap className={`${styles.icon} text-green-500 animate-pulse`} />
				</span>
			)}
		</output>
	);
});

export default ConnectionStatus;
