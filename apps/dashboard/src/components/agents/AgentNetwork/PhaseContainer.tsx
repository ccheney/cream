"use client";

/**
 * PhaseContainer - OODA phase wrapper with status indicator
 *
 * Visual container for each workflow phase showing agents and status.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { OODAPhase, PhaseStatus } from "./types";

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
	initial: { opacity: 0, y: 20 },
	animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const contentVariants = {
	collapsed: { height: 0, opacity: 0 },
	expanded: { height: "auto", opacity: 1, transition: { duration: 0.2 } },
};

// ============================================
// Status Badge
// ============================================

const StatusBadge = memo(function StatusBadge({ status }: { status: PhaseStatus }) {
	const statusConfig = {
		pending: {
			bg: "bg-stone-100 dark:bg-night-700",
			text: "text-stone-500 dark:text-stone-400",
			label: "Pending",
		},
		active: {
			bg: "bg-amber-100 dark:bg-amber-900/30",
			text: "text-amber-700 dark:text-amber-400",
			label: "Active",
		},
		complete: {
			bg: "bg-emerald-100 dark:bg-emerald-900/30",
			text: "text-emerald-700 dark:text-emerald-400",
			label: "Complete",
		},
		error: {
			bg: "bg-red-100 dark:bg-red-900/30",
			text: "text-red-700 dark:text-red-400",
			label: "Error",
		},
	};

	const config = statusConfig[status];

	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${config.bg} ${config.text}`}
		>
			{status === "active" && (
				<span className="relative flex h-1.5 w-1.5 mr-1.5">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
					<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
				</span>
			)}
			{config.label}
		</span>
	);
});

// ============================================
// Data Item (for observe/orient phases)
// ============================================

export interface DataItemProps {
	label: string;
	isComplete?: boolean;
}

export const DataItem = memo(function DataItem({ label, isComplete = false }: DataItemProps) {
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
				isComplete
					? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
					: "bg-stone-100 text-stone-600 dark:bg-night-700 dark:text-stone-400"
			}`}
		>
			{label}
			{isComplete && <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
		</span>
	);
});

// ============================================
// Main Component
// ============================================

export interface PhaseContainerProps {
	phase: OODAPhase;
	displayName: string;
	description?: string;
	status: PhaseStatus;
	isExpanded?: boolean;
	onToggle?: () => void;
	collapsible?: boolean;
	children?: ReactNode;
	/** Compact mode for mobile layouts */
	compact?: boolean;
}

export const PhaseContainer = memo(function PhaseContainer({
	phase,
	displayName,
	description,
	status,
	isExpanded = true,
	onToggle,
	collapsible = false,
	children,
	compact = false,
}: PhaseContainerProps) {
	const hasContent = Boolean(children);

	const statusColors = {
		pending: "border-stone-200 dark:border-night-700",
		active: "border-amber-400 dark:border-amber-500 border-l-4",
		complete: "border-emerald-400 dark:border-emerald-500 border-l-4",
		error: "border-red-400 dark:border-red-500 border-l-4",
	};

	const bgColors = {
		pending: "bg-cream-50 dark:bg-night-850",
		active: "bg-amber-50/30 dark:bg-amber-900/10",
		complete: "bg-emerald-50/30 dark:bg-emerald-900/10",
		error: "bg-red-50/30 dark:bg-red-900/10",
	};

	// Opaque backgrounds for label (to cover the border line)
	const labelBgColors = {
		pending: "bg-cream-50 dark:bg-night-850",
		active: "bg-white dark:bg-night-800",
		complete: "bg-white dark:bg-night-800",
		error: "bg-white dark:bg-night-800",
	};

	return (
		<motion.div
			variants={containerVariants}
			initial="initial"
			animate="animate"
			className={`
        relative rounded-lg border transition-colors duration-200
        ${statusColors[status]}
        ${bgColors[status]}
      `}
			data-phase={phase}
			data-status={status}
			role="treeitem"
			aria-expanded={isExpanded}
			aria-label={`${displayName} phase, ${status}`}
		>
			{/* Phase Label (positioned on top border) */}
			<div
				className={`
          absolute left-4 px-1.5 -translate-y-1/2
          text-[10px] font-semibold uppercase tracking-wider leading-none
          ${
						status === "active"
							? "text-amber-600 dark:text-amber-400"
							: status === "complete"
								? "text-emerald-600 dark:text-emerald-400"
								: status === "error"
									? "text-red-600 dark:text-red-400"
									: "text-stone-400 dark:text-stone-500"
					}
          ${labelBgColors[status]}
        `}
				style={{ top: 0 }}
			>
				{displayName}
			</div>

			{/* Header */}
			<div className={compact ? "px-3 pt-2.5 pb-1.5" : "px-4 pt-3 pb-2"}>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 sm:gap-3">
						{collapsible && (
							<button
								type="button"
								onClick={onToggle}
								className="p-0.5 rounded hover:bg-stone-200/50 dark:hover:bg-night-700/50 transition-colors"
								aria-label={isExpanded ? "Collapse phase" : "Expand phase"}
							>
								{isExpanded ? (
									<ChevronDown
										className={compact ? "w-3.5 h-3.5 text-stone-400" : "w-4 h-4 text-stone-400"}
									/>
								) : (
									<ChevronRight
										className={compact ? "w-3.5 h-3.5 text-stone-400" : "w-4 h-4 text-stone-400"}
									/>
								)}
							</button>
						)}
						{description && !compact && (
							<p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
						)}
					</div>
					<StatusBadge status={status} />
				</div>
			</div>

			{/* Content */}
			{hasContent && (
				<AnimatePresence initial={false}>
					{isExpanded && (
						<motion.div
							variants={contentVariants}
							initial="collapsed"
							animate="expanded"
							exit="collapsed"
							className="overflow-hidden"
						>
							<div className={compact ? "p-3" : "p-4"}>{children}</div>
						</motion.div>
					)}
				</AnimatePresence>
			)}
		</motion.div>
	);
});

export default PhaseContainer;
