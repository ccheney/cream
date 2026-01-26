/**
 * AgentTimeline Component
 *
 * Linear display of agents in execution order.
 *
 * @see docs/plans/ui/31-realtime-patterns.md — Agent Streaming
 */

"use client";

import type { AgentData, CycleData } from "@/lib/api/types";
import { KNOWN_AGENT_TYPES } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { AgentCard } from "./AgentCard";

// ============================================
// Types
// ============================================

export interface AgentTimelineProps {
	/** Cycle data containing agent states */
	cycle: CycleData;
	/** Additional class names */
	className?: string;
}

// ============================================
// Component
// ============================================

/**
 * AgentTimeline - Vertical list of agent cards.
 *
 * @example
 * ```tsx
 * <AgentTimeline cycle={cycleData} />
 * ```
 */
export function AgentTimeline({ cycle, className }: AgentTimelineProps) {
	// Build ordered list of agents:
	// 1. Known agents in their defined execution order
	// 2. Any unknown agents appended at the end (sorted by start time)
	const knownAgentSet = new Set<string>(KNOWN_AGENT_TYPES);

	// First, add known agents in order
	const orderedAgents: AgentData[] = [];
	for (const type of KNOWN_AGENT_TYPES as readonly string[]) {
		const agent = cycle.agents[type];
		if (agent) {
			orderedAgents.push(agent);
		}
	}

	// Then, add any unknown agents (sorted by start time)
	const unknownAgents = Object.entries(cycle.agents)
		.filter(([type]) => !knownAgentSet.has(type))
		.map(([_, agent]) => agent)
		.sort((a, b) => {
			if (!a.startTime || !b.startTime) return 0;
			return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
		});

	orderedAgents.push(...unknownAgents);

	if (orderedAgents.length === 0) {
		return (
			<div
				className={cn(
					"flex flex-col items-center justify-center h-64 text-stone-400 dark:text-night-500",
					className,
				)}
			>
				<svg
					aria-hidden="true"
					className="h-12 w-12 mb-3 opacity-50"
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
				<p>Waiting for agents...</p>
			</div>
		);
	}

	return (
		<div className={cn("space-y-4", className)}>
			{orderedAgents.map((agent) => (
				<AgentCard key={agent.type} agent={agent} />
			))}
		</div>
	);
}

export default AgentTimeline;
