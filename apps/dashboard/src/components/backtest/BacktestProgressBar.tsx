/**
 * BacktestProgressBar Component
 *
 * Displays real-time backtest progress with phase indicator.
 * Uses the useBacktestProgress hook for WebSocket updates.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 4
 */

"use client";

import { forwardRef, type HTMLAttributes, useMemo } from "react";
import type { BacktestStatus, UseBacktestProgressReturn } from "@/hooks/useBacktestProgress";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type BacktestPhase =
	| "starting"
	| "loading_data"
	| "running_simulation"
	| "calculating_metrics"
	| "extracting_trades"
	| "building_equity_curve"
	| "completed"
	| "failed";

export interface BacktestProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	/** Progress percentage (0-100) */
	progressPct: number;
	/** Current phase */
	phase?: BacktestPhase | string;
	/** Backtest status */
	status: BacktestStatus;
	/** Show phase label */
	showPhase?: boolean;
	/** Show percentage value */
	showValue?: boolean;
	/** Size variant */
	size?: "sm" | "md" | "lg";
	/** Animate the progress bar */
	animate?: boolean;
	/** Additional class names */
	className?: string;
}

// ============================================
// Configuration
// ============================================

const phaseLabels: Record<string, string> = {
	starting: "Starting backtest...",
	loading_data: "Loading market data...",
	running_simulation: "Running simulation...",
	calculating_metrics: "Calculating metrics...",
	extracting_trades: "Extracting trades...",
	building_equity_curve: "Building equity curve...",
	completed: "Completed!",
	failed: "Failed",
	idle: "Waiting to start...",
	running: "Running...",
	error: "Error",
};

const statusColors: Record<BacktestStatus, { bar: string; bg: string }> = {
	idle: {
		bar: "bg-stone-400 dark:bg-stone-500",
		bg: "bg-stone-200 dark:bg-stone-700",
	},
	running: {
		bar: "bg-blue-500 dark:bg-blue-400",
		bg: "bg-blue-100 dark:bg-blue-900/30",
	},
	completed: {
		bar: "bg-green-500 dark:bg-green-400",
		bg: "bg-green-100 dark:bg-green-900/30",
	},
	error: {
		bar: "bg-red-500 dark:bg-red-400",
		bg: "bg-red-100 dark:bg-red-900/30",
	},
};

const sizeConfig: Record<"sm" | "md" | "lg", { height: string; fontSize: string }> = {
	sm: { height: "h-1.5", fontSize: "text-xs" },
	md: { height: "h-2", fontSize: "text-sm" },
	lg: { height: "h-3", fontSize: "text-sm" },
};

// ============================================
// Component
// ============================================

/**
 * BacktestProgressBar - Progress bar with phase indicator for backtests.
 *
 * @example
 * ```tsx
 * // Basic usage with hook
 * const { status, progress } = useBacktestProgress(backtestId);
 * <BacktestProgressBar
 *   progressPct={progress?.progress ?? 0}
 *   status={status}
 *   showPhase
 *   showValue
 * />
 *
 * // Inline usage
 * <BacktestProgressBar
 *   progressPct={75}
 *   phase="running_simulation"
 *   status="running"
 *   showPhase
 * />
 * ```
 */
export const BacktestProgressBar = forwardRef<HTMLDivElement, BacktestProgressBarProps>(
	(
		{
			progressPct,
			phase,
			status,
			showPhase = true,
			showValue = true,
			size = "md",
			animate = true,
			className,
			...props
		},
		ref
	) => {
		const sizeStyles = sizeConfig[size];
		const colors = statusColors[status];

		// Clamp percentage
		const percentage = useMemo(() => Math.min(100, Math.max(0, progressPct)), [progressPct]);

		// Get phase label
		const phaseLabel = phase ? (phaseLabels[phase] ?? phase) : phaseLabels[status];

		return (
			<div ref={ref} className={cn("w-full", className)} {...props}>
				{/* Label and value row */}
				{(showPhase || showValue) && (
					<div className="flex items-center justify-between mb-1">
						{showPhase && (
							<span
								className={cn(
									"text-stone-600 dark:text-stone-400",
									sizeStyles.fontSize,
									status === "running" && animate && "animate-pulse"
								)}
							>
								{phaseLabel}
							</span>
						)}
						{showValue && (
							<span
								className={cn(
									"font-medium tabular-nums",
									sizeStyles.fontSize,
									status === "error"
										? "text-red-600 dark:text-red-400"
										: status === "completed"
											? "text-green-600 dark:text-green-400"
											: "text-stone-700 dark:text-stone-300"
								)}
							>
								{percentage}%
							</span>
						)}
					</div>
				)}

				{/* Progress bar */}
				<div
					role="progressbar"
					aria-valuenow={percentage}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Backtest progress"
					className={cn("w-full rounded-full overflow-hidden", sizeStyles.height, colors.bg)}
				>
					<div
						className={cn(
							"h-full rounded-full",
							colors.bar,
							animate && "transition-all duration-300 ease-out",
							status === "running" && animate && "animate-pulse"
						)}
						style={{ width: `${percentage}%` }}
					/>
				</div>
			</div>
		);
	}
);

BacktestProgressBar.displayName = "BacktestProgressBar";

// ============================================
// Convenience Components
// ============================================

export interface BacktestProgressFromHookProps
	extends Omit<BacktestProgressBarProps, "progressPct" | "status" | "phase"> {
	/** Progress data from useBacktestProgress hook */
	progressData: UseBacktestProgressReturn;
}

/**
 * BacktestProgressFromHook - Convenience wrapper that takes hook data directly.
 *
 * @example
 * ```tsx
 * const progressData = useBacktestProgress(backtestId);
 * <BacktestProgressFromHook progressData={progressData} />
 * ```
 */
export const BacktestProgressFromHook = forwardRef<HTMLDivElement, BacktestProgressFromHookProps>(
	({ progressData, ...props }, ref) => {
		const { status, progress } = progressData;

		return (
			<BacktestProgressBar
				ref={ref}
				progressPct={progress?.progress ?? 0}
				status={status}
				{...props}
			/>
		);
	}
);

BacktestProgressFromHook.displayName = "BacktestProgressFromHook";

// ============================================
// Exports
// ============================================

export default BacktestProgressBar;
