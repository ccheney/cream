"use client";

/**
 * Agents Page
 *
 * Displays agent activity during trading cycles.
 * Uses OpenObserve traces for data, polled via TanStack Query.
 *
 * @see docs/plans/56-agents-page-refactor.md
 */

import { useState } from "react";
import { AgentTimeline, CycleSelector } from "@/components/agents";
import { useCycleTraces } from "@/hooks/useCycleTraces";
import { cn } from "@/lib/utils";

// ============================================
// Icons
// ============================================

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("animate-spin", className)}
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

function AlertIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
	);
}

function EmptyIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
			/>
		</svg>
	);
}

// ============================================
// Main Component
// ============================================

export default function AgentsPage() {
	const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>();
	const { cycle, cycles, isLoading, isError } = useCycleTraces(selectedCycleId);

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 dark:border-night-700">
				<h1 className="text-xl font-semibold text-stone-800 dark:text-night-100">Agents</h1>
				<CycleSelector cycles={cycles} selectedId={selectedCycleId} onSelect={setSelectedCycleId} />
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				{/* Loading State */}
				{isLoading && (
					<div className="flex flex-col items-center justify-center h-64">
						<SpinnerIcon className="h-8 w-8 text-amber-500 mb-3" />
						<p className="text-sm text-stone-400 dark:text-night-500">Loading cycle data...</p>
					</div>
				)}

				{/* Error State */}
				{isError && (
					<div className="flex flex-col items-center justify-center h-64 text-red-500">
						<AlertIcon className="h-8 w-8 mb-3" />
						<p className="text-sm">Failed to load cycle data</p>
						<p className="text-xs text-stone-400 dark:text-night-500 mt-1">
							Check that OpenObserve is running and accessible
						</p>
					</div>
				)}

				{/* Empty State */}
				{!isLoading && !isError && !cycle && (
					<div className="flex flex-col items-center justify-center h-64 text-stone-400 dark:text-night-500">
						<EmptyIcon className="h-12 w-12 mb-3 opacity-50" />
						<p className="text-sm">No active cycle</p>
						<p className="text-xs mt-1">Trigger a trading cycle to see agent activity</p>
					</div>
				)}

				{/* Cycle Timeline */}
				{cycle && <AgentTimeline cycle={cycle} />}
			</div>
		</div>
	);
}
