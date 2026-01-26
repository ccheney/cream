/**
 * CycleSelector Component
 *
 * Dropdown for selecting historical cycles or viewing latest.
 *
 * @see docs/plans/ui/24-components.md — Dropdowns & Selects
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { CycleListItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

export interface CycleSelectorProps {
	/** List of available cycles */
	cycles: CycleListItem[];
	/** Currently selected cycle ID (undefined = latest) */
	selectedId?: string;
	/** Callback when selection changes */
	onSelect: (cycleId: string | undefined) => void;
	/** Additional class names */
	className?: string;
}

// ============================================
// Helpers
// ============================================

function formatCycleTime(dateString: string): string {
	const date = new Date(dateString);
	const today = new Date();
	const isToday = date.toDateString() === today.toDateString();

	if (isToday) {
		return date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	}

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

// ============================================
// Icons
// ============================================

function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	);
}

// ============================================
// Component
// ============================================

/**
 * CycleSelector - Dropdown for cycle selection.
 *
 * @example
 * ```tsx
 * <CycleSelector
 *   cycles={cycles}
 *   selectedId={selectedCycleId}
 *   onSelect={setSelectedCycleId}
 * />
 * ```
 */
export function CycleSelector({ cycles, selectedId, onSelect, className }: CycleSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Close on outside click
	useEffect(() => {
		if (!isOpen) return;

		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// Close on escape
	useEffect(() => {
		if (!isOpen) return;

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		}

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen]);

	const selectedCycle = selectedId ? cycles.find((c) => c.id === selectedId) : null;

	return (
		<div ref={containerRef} className={cn("relative", className)}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-2 px-3 py-2 w-[220px]",
					"bg-white dark:bg-night-800 text-stone-700 dark:text-night-200",
					"border border-cream-300 dark:border-night-600 rounded-md",
					"hover:border-cream-400 dark:hover:border-night-500",
					"focus:outline-none focus:ring-2 focus:ring-amber-500/50",
					"transition-colors duration-150",
				)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
			>
				{(() => {
					const displayCycle = selectedCycle ?? cycles[0];
					if (displayCycle) {
						return (
							<>
								<span
									className={cn(
										"h-2 w-2 rounded-full shrink-0",
										displayCycle.status === "complete" && "bg-green-500",
										displayCycle.status === "error" && "bg-red-500",
										displayCycle.status === "running" && "bg-amber-500 animate-pulse",
									)}
								/>
								<span className="text-sm">{formatCycleTime(displayCycle.startTime)}</span>
								<span className="text-xs font-mono text-stone-400 dark:text-night-500">
									{displayCycle.id.slice(0, 8)}
								</span>
							</>
						);
					}
					return <span className="text-sm text-stone-400 dark:text-night-500">No cycles</span>;
				})()}
				<ChevronIcon
					className={cn(
						"h-4 w-4 ml-auto text-stone-400 dark:text-night-500 transition-transform duration-200",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{isOpen && (
				<div
					className={cn(
						"absolute top-full left-0 mt-1 w-full z-50",
						"bg-white dark:bg-night-800",
						"border border-cream-300 dark:border-night-600 rounded-md shadow-lg",
						"max-h-64 overflow-y-auto",
						"animate-in fade-in-0 zoom-in-95 duration-150",
					)}
					role="listbox"
				>
					{/* Cycle list */}
					{cycles.map((cycle) => (
						<button
							key={cycle.id}
							type="button"
							onClick={() => {
								onSelect(cycle.id);
								setIsOpen(false);
							}}
							className={cn(
								"flex items-center gap-2 w-full px-3 py-2 text-left",
								"hover:bg-cream-100 dark:hover:bg-night-700",
								"transition-colors duration-100",
								selectedId === cycle.id && "bg-cream-50 dark:bg-night-700",
							)}
							role="option"
							aria-selected={selectedId === cycle.id}
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full shrink-0",
									cycle.status === "complete" && "bg-green-500",
									cycle.status === "error" && "bg-red-500",
									cycle.status === "running" && "bg-amber-500 animate-pulse",
								)}
							/>
							<span className="text-sm text-stone-700 dark:text-night-200">
								{formatCycleTime(cycle.startTime)}
							</span>
							<span className="ml-auto text-xs text-stone-400 dark:text-night-500 font-mono">
								{cycle.id.slice(0, 8)}
							</span>
						</button>
					))}

					{cycles.length === 0 && (
						<div className="px-3 py-2 text-sm text-stone-400 dark:text-night-500">
							No cycles
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default CycleSelector;
