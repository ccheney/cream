"use client";

/**
 * ContextHeader - Compact display for OODA Observe/Orient context data
 *
 * Shows market data inputs as a compact horizontal bar above the agent network.
 * These are data providers, not agents, so they have distinct visual treatment.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Database, Gauge } from "lucide-react";
import { memo, useState } from "react";

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
	initial: { opacity: 0, y: -10 },
	animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const contentVariants = {
	collapsed: { height: 0, opacity: 0 },
	expanded: { height: "auto", opacity: 1, transition: { duration: 0.15 } },
};

// ============================================
// Context Item Badge
// ============================================

interface ContextItemProps {
	label: string;
	isReady: boolean;
	value?: string;
}

const ContextItem = memo(function ContextItem({ label, isReady, value }: ContextItemProps) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
				isReady
					? "bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
					: "bg-stone-100 text-stone-500 dark:bg-night-700 dark:text-stone-400"
			}`}
		>
			{isReady && <span className="text-emerald-500 dark:text-emerald-400">✓</span>}
			{label}
			{value && <span className="font-mono text-[10px] opacity-75 ml-0.5">{value}</span>}
		</span>
	);
});

// ============================================
// Section Header
// ============================================

interface SectionProps {
	icon: React.ReactNode;
	label: string;
	isExpanded: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}

const Section = memo(function Section({
	icon,
	label,
	isExpanded,
	onToggle,
	children,
}: SectionProps) {
	return (
		<div className="flex-1 min-w-0">
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mb-2"
			>
				{isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
				{icon}
				{label}
			</button>
			{isExpanded && (
				<motion.div
					variants={contentVariants}
					initial="collapsed"
					animate="expanded"
					exit="collapsed"
					className="flex flex-wrap gap-1.5"
				>
					{children}
				</motion.div>
			)}
		</div>
	);
});

// ============================================
// Main Component
// ============================================

export interface ContextHeaderProps {
	/** Is the context data ready/loaded */
	isReady: boolean;
	/** Current market regime (if available) */
	regime?: string;
	/** Put/Call ratio (if available) */
	pcRatio?: number;
	/** Compact mode for mobile */
	compact?: boolean;
}

export const ContextHeader = memo(function ContextHeader({
	isReady,
	regime,
	pcRatio,
	compact = false,
}: ContextHeaderProps) {
	const [observeExpanded, setObserveExpanded] = useState(!compact);
	const [orientExpanded, setOrientExpanded] = useState(!compact);

	return (
		<motion.div
			variants={containerVariants}
			initial="initial"
			animate="animate"
			className={`
        rounded-lg border border-dashed
        ${
					isReady
						? "border-emerald-300/60 dark:border-emerald-700/40 bg-emerald-50/30 dark:bg-emerald-900/5"
						: "border-stone-300 dark:border-night-600 bg-stone-50/50 dark:bg-night-900/50"
				}
      `}
		>
			{/* Header Bar */}
			<div className={`flex items-center justify-between ${compact ? "px-3 py-2" : "px-4 py-2.5"}`}>
				<div className="flex items-center gap-2">
					<div
						className={`flex items-center justify-center w-6 h-6 rounded ${
							isReady ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-stone-100 dark:bg-night-700"
						}`}
					>
						<Database
							className={`w-3.5 h-3.5 ${
								isReady
									? "text-emerald-600 dark:text-emerald-400"
									: "text-stone-400 dark:text-stone-500"
							}`}
						/>
					</div>
					<span
						className={`text-sm font-medium ${
							isReady
								? "text-emerald-700 dark:text-emerald-400"
								: "text-stone-600 dark:text-stone-400"
						}`}
					>
						Context
					</span>
				</div>

				{/* Status Badge */}
				<span
					className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${
						isReady
							? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
							: "bg-stone-100 text-stone-500 dark:bg-night-700 dark:text-stone-400"
					}`}
				>
					{isReady && <span className="text-emerald-500">✓</span>}
					{isReady ? "Ready" : "Loading..."}
				</span>
			</div>

			{/* Expandable Content */}
			<div
				className={`border-t border-dashed ${
					isReady
						? "border-emerald-200/60 dark:border-emerald-800/30"
						: "border-stone-200 dark:border-night-700"
				} ${compact ? "px-3 py-2" : "px-4 py-3"}`}
			>
				<div className={`flex ${compact ? "flex-col gap-3" : "flex-row gap-6"}`}>
					{/* OBSERVE Section */}
					<Section
						icon={<Database className="w-3 h-3" />}
						label="Observe"
						isExpanded={observeExpanded}
						onToggle={() => setObserveExpanded(!observeExpanded)}
					>
						<ContextItem label="Market Data" isReady={isReady} />
						<ContextItem label="Options Chains" isReady={isReady} />
						<ContextItem label="Portfolio" isReady={isReady} />
						<ContextItem label="Universe" isReady={isReady} />
					</Section>

					{/* Divider */}
					{!compact && <div className="w-px bg-stone-200 dark:bg-night-700 self-stretch" />}

					{/* ORIENT Section */}
					<Section
						icon={<Gauge className="w-3 h-3" />}
						label="Orient"
						isExpanded={orientExpanded}
						onToggle={() => setOrientExpanded(!orientExpanded)}
					>
						<ContextItem label="Indicators" isReady={isReady} />
						<ContextItem label="Regime" isReady={isReady} value={regime} />
						<ContextItem label="Memory" isReady={isReady} />
						<ContextItem label="P/C Ratio" isReady={isReady} value={pcRatio?.toFixed(2)} />
					</Section>
				</div>
			</div>
		</motion.div>
	);
});

export default ContextHeader;
