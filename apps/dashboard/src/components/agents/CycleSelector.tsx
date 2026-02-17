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

function StatusDot({ status }: { status: CycleListItem["status"] }) {
	return (
		<span
			className={cn(
				"h-2 w-2 rounded-full shrink-0",
				status === "complete" && "bg-green-500",
				status === "error" && "bg-red-500",
				status === "running" && "bg-amber-500 animate-pulse",
			)}
		/>
	);
}

function CycleButtonContent({ cycle }: { cycle?: CycleListItem | null }) {
	if (!cycle) {
		return <span className="text-sm text-stone-400 dark:text-night-500">No cycles</span>;
	}

	return (
		<>
			<StatusDot status={cycle.status} />
			<span className="text-sm">{formatCycleTime(cycle.startTime)}</span>
			<span className="text-xs font-mono text-stone-400 dark:text-night-500">
				{cycle.id.slice(0, 8)}
			</span>
		</>
	);
}

interface CycleOptionProps {
	cycle: CycleListItem;
	selected: boolean;
	onSelect: (cycleId: string) => void;
}

function CycleOption({ cycle, selected, onSelect }: CycleOptionProps) {
	return (
		<button
			key={cycle.id}
			type="button"
			onClick={() => onSelect(cycle.id)}
			className={cn(
				"flex items-center gap-2 w-full px-3 py-2 text-left",
				"hover:bg-cream-100 dark:hover:bg-night-700",
				"transition-colors duration-100",
				selected && "bg-cream-50 dark:bg-night-700",
			)}
			role="option"
			aria-selected={selected}
		>
			<StatusDot status={cycle.status} />
			<span className="text-sm text-stone-700 dark:text-night-200">
				{formatCycleTime(cycle.startTime)}
			</span>
			<span className="ml-auto text-xs text-stone-400 dark:text-night-500 font-mono">
				{cycle.id.slice(0, 8)}
			</span>
		</button>
	);
}

interface CycleListboxProps {
	cycles: CycleListItem[];
	selectedId?: string;
	onSelect: (cycleId: string) => void;
}

function CycleListbox({ cycles, selectedId, onSelect }: CycleListboxProps) {
	if (cycles.length === 0) {
		return <div className="px-3 py-2 text-sm text-stone-400 dark:text-night-500">No cycles</div>;
	}

	return (
		<>
			{cycles.map((cycle) => (
				<CycleOption
					key={cycle.id}
					cycle={cycle}
					selected={selectedId === cycle.id}
					onSelect={onSelect}
				/>
			))}
		</>
	);
}

function useDismissableDropdown(
	isOpen: boolean,
	containerRef: React.RefObject<HTMLDivElement | null>,
	onClose: () => void,
) {
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				onClose();
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen, containerRef, onClose]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);
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
	useDismissableDropdown(isOpen, containerRef, () => setIsOpen(false));
	const selectedCycle = selectedId ? cycles.find((c) => c.id === selectedId) : null;
	const displayCycle = selectedCycle ?? cycles[0];
	const handleSelectCycle = (cycleId: string) => {
		onSelect(cycleId);
		setIsOpen(false);
	};

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
				<CycleButtonContent cycle={displayCycle} />
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
					<CycleListbox cycles={cycles} selectedId={selectedId} onSelect={handleSelectCycle} />
				</div>
			)}
		</div>
	);
}

export default CycleSelector;
