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
import { type ReactNode, useState } from "react";
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

interface AgentStatusFlags {
	isRunning: boolean;
	isComplete: boolean;
	isError: boolean;
	isPending: boolean;
}

interface CollapsibleSectionProps {
	title: string;
	count?: number;
	expanded: boolean;
	onToggle: () => void;
	children: ReactNode;
}

function getStatusFlags(status: AgentData["status"]): AgentStatusFlags {
	return {
		isRunning: status === "running",
		isComplete: status === "complete",
		isError: status === "error",
		isPending: status === "pending",
	};
}

function getCardClassName(flags: AgentStatusFlags, className?: string): string {
	return cn(
		"rounded-lg border transition-colors duration-200",
		flags.isPending && "border-cream-200 dark:border-night-800 opacity-50",
		flags.isRunning &&
			"border-amber-400/50 dark:border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10",
		flags.isComplete && "border-cream-300 dark:border-night-700",
		flags.isError && "border-red-400/50 dark:border-red-500/30 bg-red-50/30 dark:bg-red-900/10",
		className,
	);
}

function StatusIcon({ flags }: { flags: AgentStatusFlags }) {
	if (flags.isPending) {
		return <Clock className="h-4 w-4 text-stone-400 dark:text-night-500" />;
	}
	if (flags.isRunning) {
		return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />;
	}
	if (flags.isComplete) {
		return <Check className="h-4 w-4 text-green-500" />;
	}
	if (flags.isError) {
		return <AlertTriangle className="h-4 w-4 text-red-500" />;
	}
	return null;
}

function CollapsibleSection({
	title,
	count,
	expanded,
	onToggle,
	children,
}: CollapsibleSectionProps) {
	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 transition-colors"
			>
				<ChevronRight
					className={cn("h-3 w-3 transition-transform duration-200", expanded && "rotate-90")}
				/>
				<span>{count !== undefined ? `${title} (${count})` : title}</span>
			</button>
			{expanded && children}
		</div>
	);
}

function InputSection({
	input,
	expanded,
	onToggle,
}: {
	input: string | undefined;
	expanded: boolean;
	onToggle: () => void;
}) {
	if (!input) {
		return null;
	}

	return (
		<CollapsibleSection title="Input" expanded={expanded} onToggle={onToggle}>
			<div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 ml-5">
				<p className="text-sm text-stone-700 dark:text-night-200 whitespace-pre-wrap font-mono">
					{input}
				</p>
			</div>
		</CollapsibleSection>
	);
}

function ToolCallsSection({
	toolCalls,
	expanded,
	onToggle,
}: {
	toolCalls: AgentData["toolCalls"];
	expanded: boolean;
	onToggle: () => void;
}) {
	if (toolCalls.length === 0) {
		return null;
	}

	return (
		<CollapsibleSection
			title="Tool Calls"
			count={toolCalls.length}
			expanded={expanded}
			onToggle={onToggle}
		>
			<div className="space-y-2 pl-5">
				{toolCalls.map((tool) => (
					<ToolCallItem key={tool.id} tool={tool} />
				))}
			</div>
		</CollapsibleSection>
	);
}

function OutputSection({
	output,
	expanded,
	onToggle,
	isRunning,
}: {
	output: string | undefined;
	expanded: boolean;
	onToggle: () => void;
	isRunning: boolean;
}) {
	if (!output) {
		return null;
	}

	return (
		<CollapsibleSection title="Output" expanded={expanded} onToggle={onToggle}>
			<div className="rounded-md bg-cream-100 dark:bg-night-800 p-3 ml-5">
				<p className="text-sm text-stone-700 dark:text-night-200 whitespace-pre-wrap">
					{output}
					{isRunning && (
						<span className="inline-block w-1.5 h-4 ml-0.5 bg-stone-600 dark:bg-night-300 animate-blink" />
					)}
				</p>
			</div>
		</CollapsibleSection>
	);
}

function EmptyRunningState({ show }: { show: boolean }) {
	if (!show) {
		return null;
	}

	return (
		<div className="flex items-center gap-2 text-sm text-stone-400 dark:text-night-500">
			<Loader2 className="h-4 w-4 animate-spin" />
			<span>Processing...</span>
		</div>
	);
}

function AgentCardHeader({
	agent,
	flags,
	meta,
}: {
	agent: AgentData;
	flags: AgentStatusFlags;
	meta: ReturnType<typeof getAgentMetadata>;
}) {
	return (
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
				<StatusIcon flags={flags} />
			</span>
		</div>
	);
}

function AgentCardBody({
	agent,
	flags,
	inputExpanded,
	onInputToggle,
	toolsExpanded,
	onToolsToggle,
	outputExpanded,
	onOutputToggle,
}: {
	agent: AgentData;
	flags: AgentStatusFlags;
	inputExpanded: boolean;
	onInputToggle: () => void;
	toolsExpanded: boolean;
	onToolsToggle: () => void;
	outputExpanded: boolean;
	onOutputToggle: () => void;
}) {
	if (flags.isPending) {
		return null;
	}

	const hasRunningContent = Boolean(agent.reasoning || agent.toolCalls.length > 0 || agent.output);

	return (
		<div className="p-4 space-y-3">
			<InputSection input={agent.input} expanded={inputExpanded} onToggle={onInputToggle} />
			{agent.reasoning && (
				<ReasoningBlock content={agent.reasoning} isStreaming={flags.isRunning} />
			)}
			<ToolCallsSection
				toolCalls={agent.toolCalls}
				expanded={toolsExpanded}
				onToggle={onToolsToggle}
			/>
			<OutputSection
				output={agent.output}
				expanded={outputExpanded}
				onToggle={onOutputToggle}
				isRunning={flags.isRunning}
			/>
			<EmptyRunningState show={flags.isRunning && !hasRunningContent} />
		</div>
	);
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
	const flags = getStatusFlags(agent.status);

	// Collapsible state for input, tool calls, and output sections
	const [inputExpanded, setInputExpanded] = useState(false);
	const [toolsExpanded, setToolsExpanded] = useState(false);
	const [outputExpanded, setOutputExpanded] = useState(false);

	return (
		<div className={getCardClassName(flags, className)}>
			<AgentCardHeader agent={agent} flags={flags} meta={meta} />
			<AgentCardBody
				agent={agent}
				flags={flags}
				inputExpanded={inputExpanded}
				onInputToggle={() => setInputExpanded((prev) => !prev)}
				toolsExpanded={toolsExpanded}
				onToolsToggle={() => setToolsExpanded((prev) => !prev)}
				outputExpanded={outputExpanded}
				onOutputToggle={() => setOutputExpanded((prev) => !prev)}
			/>
		</div>
	);
}

export default AgentCard;
