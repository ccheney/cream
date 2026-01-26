/**
 * AgentCard Component
 *
 * Card displaying a single agent's status, reasoning, and tool calls.
 *
 * @see docs/plans/ui/24-components.md — Cards
 * @see docs/plans/ui/21-color-system.md — Agent Colors
 */

"use client";

import { AlertTriangle, Check, ChevronRight, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import type { AgentData } from "@/lib/api/types";
import { getAgentMetadata } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolCallItem } from "./ToolCallItem";

// ============================================
// Types
// ============================================

export interface AgentCardProps {
	/** Agent data */
	agent: AgentData;
	/** Additional class names */
	className?: string;
}

// ============================================
// Component
// ============================================

/**
 * AgentCard - Displays an agent's activity during a cycle.
 *
 * @example
 * ```tsx
 * <AgentCard agent={agentData} />
 * ```
 */
export function AgentCard({ agent, className }: AgentCardProps) {
	const meta = getAgentMetadata(agent.type, agent.name);
	const isRunning = agent.status === "running";
	const isComplete = agent.status === "complete";
	const isError = agent.status === "error";
	const isPending = agent.status === "pending";

	// Collapsible state for input, tool calls, and output sections
	const [inputExpanded, setInputExpanded] = useState(false);
	const [toolsExpanded, setToolsExpanded] = useState(false);
	const [outputExpanded, setOutputExpanded] = useState(false);

	return (
		<div
			className={cn(
				"rounded-lg border transition-colors duration-200",
				isPending && "border-cream-200 dark:border-night-800 opacity-50",
				isRunning &&
					"border-amber-400/50 dark:border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10",
				isComplete && "border-cream-300 dark:border-night-700",
				isError && "border-red-400/50 dark:border-red-500/30 bg-red-50/30 dark:bg-red-900/10",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-3 border-b border-cream-200 dark:border-night-700">
				<span className="text-lg" style={{ color: meta.color }}>
					{meta.icon}
				</span>
				<span className="font-medium text-stone-700 dark:text-night-100">{meta.displayName}</span>
				<span className="ml-auto flex items-center gap-2">
					{agent.durationMs !== undefined && (
						<span className="text-xs text-stone-400 dark:text-night-500 font-mono">
							{(agent.durationMs / 1000).toFixed(1)}s
						</span>
					)}
					{isPending && <Clock className="h-4 w-4 text-stone-400 dark:text-night-500" />}
					{isRunning && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
					{isComplete && <Check className="h-4 w-4 text-green-500" />}
					{isError && <AlertTriangle className="h-4 w-4 text-red-500" />}
				</span>
			</div>

			{/* Content - only show if not pending */}
			{!isPending && (
				<div className="p-4 space-y-3">
					{/* Input */}
					{agent.input && (
						<div className="space-y-2">
							<button
								type="button"
								onClick={() => setInputExpanded(!inputExpanded)}
								className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 transition-colors"
							>
								<ChevronRight
									className={cn(
										"h-3 w-3 transition-transform duration-200",
										inputExpanded && "rotate-90",
									)}
								/>
								<span>Input</span>
							</button>
							{inputExpanded && (
								<div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 ml-5">
									<p className="text-sm text-stone-700 dark:text-night-200 whitespace-pre-wrap font-mono">
										{agent.input}
									</p>
								</div>
							)}
						</div>
					)}

					{/* Reasoning */}
					{agent.reasoning && <ReasoningBlock content={agent.reasoning} isStreaming={isRunning} />}

					{/* Tool Calls */}
					{agent.toolCalls.length > 0 && (
						<div className="space-y-2">
							<button
								type="button"
								onClick={() => setToolsExpanded(!toolsExpanded)}
								className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 transition-colors"
							>
								<ChevronRight
									className={cn(
										"h-3 w-3 transition-transform duration-200",
										toolsExpanded && "rotate-90",
									)}
								/>
								<span>Tool Calls ({agent.toolCalls.length})</span>
							</button>
							{toolsExpanded && (
								<div className="space-y-2 pl-5">
									{agent.toolCalls.map((tool) => (
										<ToolCallItem key={tool.id} tool={tool} />
									))}
								</div>
							)}
						</div>
					)}

					{/* Output */}
					{agent.output && (
						<div className="space-y-2">
							<button
								type="button"
								onClick={() => setOutputExpanded(!outputExpanded)}
								className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 transition-colors"
							>
								<ChevronRight
									className={cn(
										"h-3 w-3 transition-transform duration-200",
										outputExpanded && "rotate-90",
									)}
								/>
								<span>Output</span>
							</button>
							{outputExpanded && (
								<div className="rounded-md bg-cream-100 dark:bg-night-800 p-3 ml-5">
									<p className="text-sm text-stone-700 dark:text-night-200 whitespace-pre-wrap">
										{agent.output}
										{isRunning && (
											<span className="inline-block w-1.5 h-4 ml-0.5 bg-stone-600 dark:bg-night-300 animate-blink" />
										)}
									</p>
								</div>
							)}
						</div>
					)}

					{/* Empty state for running agents with no content yet */}
					{isRunning && !agent.reasoning && agent.toolCalls.length === 0 && !agent.output && (
						<div className="flex items-center gap-2 text-sm text-stone-400 dark:text-night-500">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>Processing...</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default AgentCard;
