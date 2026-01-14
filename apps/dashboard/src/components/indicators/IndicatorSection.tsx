/**
 * IndicatorSection Component
 *
 * Collapsible section container for grouping related indicators.
 * Includes header with title, icon, and freshness badge.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type Freshness = "live" | "recent" | "stale" | "unavailable";

export interface IndicatorSectionProps {
	title: string;
	icon?: React.ReactNode;
	children: React.ReactNode;
	isLoading?: boolean;
	freshness?: Freshness;
	/** Subtitle shown next to title (e.g., "Market Closed") */
	subtitle?: string;
	lastUpdated?: string | null;
	defaultOpen?: boolean;
	className?: string;
}

const freshnessConfig: Record<Freshness, { dot: string; label: string; animate?: boolean }> = {
	live: {
		dot: "bg-profit",
		label: "Live",
		animate: true,
	},
	recent: {
		dot: "bg-neutral",
		label: "Recent",
		animate: false,
	},
	stale: {
		dot: "bg-stone-400 dark:bg-night-500",
		label: "Stale",
		animate: false,
	},
	unavailable: {
		dot: "bg-stone-300 dark:bg-night-600",
		label: "N/A",
		animate: false,
	},
};

function FreshnessBadge({ freshness }: { freshness: Freshness }) {
	const config = freshnessConfig[freshness];

	return (
		<span className="flex items-center gap-1.5">
			<span
				className={cn("h-1.5 w-1.5 rounded-full", config.dot, config.animate && "animate-pulse")}
			/>
			<span className="text-xs text-stone-400 dark:text-night-400">{config.label}</span>
		</span>
	);
}

export function IndicatorSection({
	title,
	icon,
	children,
	isLoading: _isLoading = false,
	freshness,
	subtitle,
	lastUpdated,
	defaultOpen = true,
	className,
}: IndicatorSectionProps) {
	const [isOpen, setIsOpen] = React.useState(defaultOpen);

	return (
		<div
			className={cn(
				"rounded-lg border border-cream-200 dark:border-night-700",
				"bg-cream-50/50 dark:bg-night-800/50",
				className
			)}
		>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex w-full items-center justify-between px-4 py-3",
					"text-left transition-colors",
					"hover:bg-cream-100/50 dark:hover:bg-night-700/50"
				)}
			>
				<div className="flex items-center gap-2">
					{icon && <span className="text-stone-500 dark:text-night-400">{icon}</span>}
					<span className="font-medium text-stone-700 dark:text-night-200">{title}</span>
					{subtitle && (
						<span className="text-xs text-stone-400 dark:text-night-500">({subtitle})</span>
					)}
					{freshness && <FreshnessBadge freshness={freshness} />}
				</div>
				<ChevronDown
					className={cn(
						"h-4 w-4 text-stone-400 dark:text-night-500 transition-transform",
						isOpen && "rotate-180"
					)}
				/>
			</button>

			{isOpen && (
				<div className="border-t border-cream-200 dark:border-night-700 px-4 py-3">
					{children}
					{lastUpdated && (
						<p className="mt-3 text-xs text-stone-400 dark:text-night-500">
							Last updated: {lastUpdated}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

export default IndicatorSection;
