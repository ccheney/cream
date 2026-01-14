/**
 * CycleHistoryPanel - List of recent trading cycles
 *
 * Shows cycle history with status, timing, and decision counts.
 * Click a cycle to load its full state into the AgentNetwork.
 */

"use client";

import { formatDistanceToNow, formatDuration, intervalToDuration } from "date-fns";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { memo, useCallback, useEffect } from "react";
import { type CycleListItem, useCycleHistory, useFullCycle } from "@/hooks/queries/useCycleHistory";
import type { AgentStreamingState } from "@/stores/agent-streaming-store";
import { useAgentStreamingActions } from "@/stores/agent-streaming-store";

// ============================================
// Status Badge Component
// ============================================

interface StatusBadgeProps {
	status: CycleListItem["status"];
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
	const config = {
		running: {
			icon: <Loader2 className="w-3 h-3 animate-spin" />,
			bg: "bg-amber-100 dark:bg-amber-900/30",
			text: "text-amber-700 dark:text-amber-400",
			label: "Running",
		},
		completed: {
			icon: <CheckCircle className="w-3 h-3" />,
			bg: "bg-emerald-100 dark:bg-emerald-900/30",
			text: "text-emerald-700 dark:text-emerald-400",
			label: "Completed",
		},
		failed: {
			icon: <XCircle className="w-3 h-3" />,
			bg: "bg-red-100 dark:bg-red-900/30",
			text: "text-red-700 dark:text-red-400",
			label: "Failed",
		},
	};

	const c = config[status];

	return (
		<span
			className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}
		>
			{c.icon}
			{c.label}
		</span>
	);
});

// ============================================
// Cycle Item Component
// ============================================

interface CycleItemProps {
	cycle: CycleListItem;
	isSelected: boolean;
	isLoading: boolean;
	onClick: () => void;
}

const CycleItem = memo(function CycleItem({
	cycle,
	isSelected,
	isLoading,
	onClick,
}: CycleItemProps) {
	const durationStr = cycle.durationMs
		? formatDuration(intervalToDuration({ start: 0, end: cycle.durationMs }), {
				format: ["minutes", "seconds"],
			})
		: null;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isLoading}
			className={`
        w-full text-left p-2.5 rounded-lg transition-colors
        ${
					isSelected
						? "bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700"
						: "bg-cream-50 dark:bg-night-750 hover:bg-cream-100 dark:hover:bg-night-700 border border-transparent"
				}
        ${isLoading ? "opacity-60 cursor-wait" : "cursor-pointer"}
      `}
		>
			<div className="flex items-center justify-between mb-1.5">
				<span className="text-xs font-mono text-stone-600 dark:text-stone-400">
					{cycle.id.slice(0, 16)}...
				</span>
				<StatusBadge status={cycle.status} />
			</div>

			<div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400">
				<span className="flex items-center gap-1">
					<Clock className="w-3 h-3" />
					{formatDistanceToNow(new Date(cycle.startedAt), { addSuffix: true })}
				</span>
				{durationStr && <span>{durationStr}</span>}
			</div>

			<div className="flex items-center gap-3 mt-1.5 text-[10px]">
				<span
					className={`${
						cycle.approved
							? "text-emerald-600 dark:text-emerald-400"
							: cycle.approved === false
								? "text-red-600 dark:text-red-400"
								: "text-stone-400 dark:text-stone-500"
					}`}
				>
					{cycle.approved ? "Approved" : cycle.approved === false ? "Rejected" : "Pending"}
				</span>
				<span className="text-stone-400 dark:text-stone-500">
					{cycle.decisionsCount} decision{cycle.decisionsCount !== 1 ? "s" : ""}
				</span>
			</div>
		</button>
	);
});

// ============================================
// Main Component
// ============================================

export interface CycleHistoryPanelProps {
	/** Currently selected historical cycle ID */
	selectedCycleId: string | null;
	/** Callback when a cycle is selected for viewing */
	onSelectCycle: (cycleId: string) => void;
	/** Environment filter */
	environment?: "BACKTEST" | "PAPER" | "LIVE";
}

export const CycleHistoryPanel = memo(function CycleHistoryPanel({
	selectedCycleId,
	onSelectCycle,
	environment,
}: CycleHistoryPanelProps) {
	const { loadHistoricalCycle } = useAgentStreamingActions();

	const {
		data: cycles,
		isLoading: cyclesLoading,
		error: cyclesError,
	} = useCycleHistory({
		environment,
		pageSize: 20,
	});

	const {
		data: fullCycle,
		isLoading: fullCycleLoading,
		error: fullCycleError,
	} = useFullCycle(selectedCycleId);

	// When full cycle data is loaded, update the store
	const handleCycleClick = useCallback(
		(cycleId: string) => {
			onSelectCycle(cycleId);
		},
		[onSelectCycle]
	);

	// Load into store when full cycle data arrives (must be in useEffect, not during render)
	useEffect(() => {
		if (!fullCycle || !selectedCycleId || fullCycleLoading) {
			return;
		}

		// Transform streaming state to match store format
		const agentState: Record<string, AgentStreamingState> = {};
		for (const [agentType, state] of Object.entries(fullCycle.streamingState)) {
			agentState[agentType] = {
				status: state.status,
				toolCalls: state.toolCalls.map((tc) => ({
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					toolArgs: tc.toolArgs,
					status: tc.status,
					resultSummary: tc.resultSummary,
					durationMs: tc.durationMs,
					timestamp: tc.timestamp,
				})),
				reasoningText: state.reasoningText,
				textOutput: state.textOutput,
				error: state.error,
				lastUpdate: state.lastUpdate,
			};
		}
		loadHistoricalCycle(selectedCycleId, agentState);
	}, [fullCycle, selectedCycleId, fullCycleLoading, loadHistoricalCycle]);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-3 border-b border-cream-200 dark:border-night-700">
				<h3 className="text-sm font-medium text-stone-900 dark:text-night-50">Cycle History</h3>
			</div>

			<div className="p-3 max-h-80 overflow-auto">
				{cyclesLoading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="w-5 h-5 animate-spin text-stone-400" />
					</div>
				) : cyclesError ? (
					<div className="text-sm text-red-500 dark:text-red-400 text-center py-4">
						Failed to load cycle history
					</div>
				) : cycles && cycles.data.length > 0 ? (
					<div className="space-y-2">
						{cycles.data.map((cycle) => (
							<CycleItem
								key={cycle.id}
								cycle={cycle}
								isSelected={selectedCycleId === cycle.id}
								isLoading={fullCycleLoading && selectedCycleId === cycle.id}
								onClick={() => handleCycleClick(cycle.id)}
							/>
						))}
					</div>
				) : (
					<p className="text-sm text-stone-500 dark:text-night-300 text-center py-4">
						No cycles yet
					</p>
				)}

				{fullCycleError && selectedCycleId && (
					<div className="mt-2 text-xs text-red-500 dark:text-red-400 text-center">
						Failed to load cycle details
					</div>
				)}
			</div>
		</div>
	);
});

export default CycleHistoryPanel;
