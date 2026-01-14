"use client";

/**
 * OODAWrapper - Visual container for OODA step groupings
 *
 * Wraps related phases under their parent OODA step (Observe, Orient, Decide, Act)
 * with consistent styling and status indicators.
 */

import { motion } from "framer-motion";
import { memo, type ReactNode } from "react";
import type { PhaseStatus } from "./types";

// ============================================
// Types
// ============================================

export type OODAStep = "OBSERVE" | "ORIENT" | "DECIDE" | "ACT";

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
	initial: { opacity: 0 },
	animate: { opacity: 1, transition: { duration: 0.2 } },
};

// ============================================
// Step Colors
// ============================================

const stepColors: Record<OODAStep, { border: string; bg: string; text: string; accent: string }> = {
	OBSERVE: {
		border: "border-sky-300/50 dark:border-sky-700/50",
		bg: "bg-sky-50/30 dark:bg-sky-900/10",
		text: "text-sky-600 dark:text-sky-400",
		accent: "bg-sky-500",
	},
	ORIENT: {
		border: "border-violet-300/50 dark:border-violet-700/50",
		bg: "bg-violet-50/30 dark:bg-violet-900/10",
		text: "text-violet-600 dark:text-violet-400",
		accent: "bg-violet-500",
	},
	DECIDE: {
		border: "border-amber-300/50 dark:border-amber-700/50",
		bg: "bg-amber-50/30 dark:bg-amber-900/10",
		text: "text-amber-600 dark:text-amber-400",
		accent: "bg-amber-500",
	},
	ACT: {
		border: "border-emerald-300/50 dark:border-emerald-700/50",
		bg: "bg-emerald-50/30 dark:bg-emerald-900/10",
		text: "text-emerald-600 dark:text-emerald-400",
		accent: "bg-emerald-500",
	},
};

// ============================================
// Status Indicator
// ============================================

interface StatusIndicatorProps {
	status: PhaseStatus;
	step: OODAStep;
}

const StatusIndicator = memo(function StatusIndicator({ status, step }: StatusIndicatorProps) {
	if (status === "pending") {
		return <div className="w-2 h-2 rounded-full bg-stone-300 dark:bg-night-600" />;
	}

	if (status === "active") {
		return (
			<span className="relative flex h-2 w-2">
				<span
					className={`animate-ping absolute inline-flex h-full w-full rounded-full ${stepColors[step].accent} opacity-75`}
				/>
				<span className={`relative inline-flex rounded-full h-2 w-2 ${stepColors[step].accent}`} />
			</span>
		);
	}

	if (status === "complete") {
		return <div className={`w-2 h-2 rounded-full ${stepColors[step].accent}`} />;
	}

	// error
	return <div className="w-2 h-2 rounded-full bg-red-500" />;
});

// ============================================
// Main Component
// ============================================

export interface OODAWrapperProps {
	step: OODAStep;
	status: PhaseStatus;
	children: ReactNode;
	/** Compact mode for mobile layouts */
	compact?: boolean;
}

export const OODAWrapper = memo(function OODAWrapper({
	step,
	status,
	children,
	compact = false,
}: OODAWrapperProps) {
	const colors = stepColors[step];

	return (
		<motion.div
			variants={containerVariants}
			initial="initial"
			animate="animate"
			className={`
        relative rounded-xl border-2 border-dashed
        ${colors.border}
        ${colors.bg}
        ${compact ? "p-2" : "p-3"}
      `}
		>
			{/* OODA Step Label */}
			<div
				className={`
          absolute -top-2.5 left-3 px-2 py-0.5
          flex items-center gap-1.5
          text-[10px] font-bold tracking-widest
          ${colors.text}
          bg-white dark:bg-night-800
          rounded
        `}
			>
				<StatusIndicator status={status} step={step} />
				{step}
			</div>

			{/* Content */}
			<div className={compact ? "mt-1" : "mt-2"}>{children}</div>
		</motion.div>
	);
});

export default OODAWrapper;
