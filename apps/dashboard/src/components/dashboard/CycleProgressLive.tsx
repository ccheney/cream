"use client";

/**
 * CycleProgressLive - Real-time OODA cycle progress from cycle-store
 *
 * Unlike CycleProgress (which tracks a specific cycle by ID), this component
 * displays the globally active cycle from the Zustand store.
 *
 * Design Philosophy:
 * - Living Indicators: Pulsing dot during active phase
 * - Temporal Awareness: Smooth progress bar animation
 * - Calm Confidence: Warm amber colors, not frantic animations
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import type { CyclePhase } from "@/stores/cycle-store";
import { useActiveCycle } from "@/stores/cycle-store";

// ============================================
// Constants
// ============================================

const PHASE_LABELS: Record<CyclePhase, string> = {
	observe: "Observing",
	orient: "Orienting",
	decide: "Deciding",
	act: "Acting",
	complete: "Complete",
};

const PHASE_DESCRIPTIONS: Record<CyclePhase, string> = {
	observe: "Gathering market data, candles, and news",
	orient: "Processing indicators and regime detection",
	decide: "Agent network deliberating on positions",
	act: "Executing approved orders",
	complete: "Cycle finished",
};

const PHASE_COLORS: Record<CyclePhase, string> = {
	observe: "from-blue-400 to-blue-500",
	orient: "from-violet-400 to-violet-500",
	decide: "from-amber-400 to-amber-500",
	act: "from-emerald-400 to-emerald-500",
	complete: "from-stone-400 to-stone-500",
};

// ============================================
// Component
// ============================================

export interface CycleProgressLiveProps {
	/** Show description under progress bar */
	showDescription?: boolean;
	/** Compact mode (smaller text, no description) */
	compact?: boolean;
}

export function CycleProgressLive({
	showDescription = true,
	compact = false,
}: CycleProgressLiveProps) {
	const { cycle, phase, progress, isRunning } = useActiveCycle();

	// No active cycle
	if (!cycle) {
		return (
			<div className={`text-stone-500 dark:text-stone-400 ${compact ? "text-xs" : "text-sm"}`}>
				No active trading cycle
			</div>
		);
	}

	const phaseLabel = phase ? PHASE_LABELS[phase] : "Starting";
	const phaseDescription = phase ? PHASE_DESCRIPTIONS[phase] : "Initializing cycle...";
	const phaseColor = phase ? PHASE_COLORS[phase] : "from-stone-400 to-stone-500";

	return (
		<div className={`${compact ? "space-y-1.5" : "space-y-3"} overflow-hidden`}>
			{/* Phase indicator with living pulse */}
			<div className="flex items-center justify-between min-w-0">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{isRunning && (
						<span className="relative flex h-2 w-2 shrink-0">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
						</span>
					)}
					<span
						className={`font-medium text-stone-900 dark:text-stone-100 shrink-0 ${compact ? "text-sm" : ""}`}
					>
						{phaseLabel}
					</span>
					<span
						className={`font-mono text-stone-500 dark:text-stone-400 truncate ${compact ? "text-xs" : "text-sm"}`}
					>
						#{cycle.id.slice(0, 8)}
					</span>
				</div>
				<span
					className={`font-medium font-mono text-stone-600 dark:text-stone-300 shrink-0 ml-2 ${compact ? "text-xs" : "text-sm"}`}
				>
					{Math.round(progress)}%
				</span>
			</div>

			{/* Progress bar with warm gradient */}
			<div
				role="progressbar"
				aria-valuenow={progress}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Cycle progress"
				className="h-1.5 bg-stone-200 dark:bg-night-700 rounded-full overflow-hidden"
			>
				<div
					className={`h-full bg-gradient-to-r ${phaseColor} transition-all duration-500 ease-out`}
					style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
				/>
			</div>

			{/* Description */}
			{showDescription && !compact && (
				<p className="text-sm text-stone-600 dark:text-stone-400 break-words">{phaseDescription}</p>
			)}
		</div>
	);
}

// ============================================
// Phase Badge Component
// ============================================

export function CyclePhaseBadge() {
	const { phase, isRunning } = useActiveCycle();

	if (!phase || phase === "complete") {
		return <span className="text-xs text-stone-400 dark:text-stone-500">Idle</span>;
	}

	return (
		<div className="inline-flex items-center gap-1.5">
			{isRunning && (
				<span className="relative flex h-1.5 w-1.5">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
					<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
				</span>
			)}
			<span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
				{phase}
			</span>
		</div>
	);
}

export default CycleProgressLive;
