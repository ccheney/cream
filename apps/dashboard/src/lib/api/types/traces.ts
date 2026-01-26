/**
 * Traces Types
 *
 * Type definitions for OpenObserve trace data used by the agents page.
 */

// Known agent types - used for styling and display metadata
export const KNOWN_AGENT_TYPES = [
	"grounding",
	"news",
	"fundamentals",
	"bullish",
	"bearish",
	"trader",
	"risk",
	"critic",
] as const;

export type KnownAgentType = (typeof KNOWN_AGENT_TYPES)[number];

// Tool call from OpenTelemetry span
export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	output?: unknown;
	status: "pending" | "complete" | "error";
	durationMs?: number;
	timestamp: string;
}

// Agent data from trace spans
export interface AgentData {
	/** Raw agent name from telemetry (e.g., "Head Trader", "Bullish Research Analyst") */
	name: string;
	/** Normalized agent type for display (e.g., "trader", "bullish") */
	type: string;
	status: "pending" | "running" | "complete" | "error";
	reasoning?: string;
	input?: string;
	output?: string;
	toolCalls: ToolCall[];
	startTime?: string;
	endTime?: string;
	durationMs?: number;
}

// Full cycle data
export interface CycleData {
	id: string;
	startTime: string;
	endTime?: string;
	status: "running" | "complete" | "error";
	agents: Record<string, AgentData>;
}

// Cycle list item (for selector)
export interface CycleListItem {
	id: string;
	startTime: string;
	status: "running" | "complete" | "error";
}

// Agent display metadata
export interface AgentMetadata {
	displayName: string;
	color: string;
	icon: string;
}

// Known agent metadata for styling
const KNOWN_AGENT_METADATA: Record<KnownAgentType, AgentMetadata> = {
	grounding: { displayName: "Grounding", color: "var(--stone-500)", icon: "◎" },
	news: { displayName: "News", color: "var(--agent-sentiment)", icon: "◈" },
	fundamentals: { displayName: "Fundamentals", color: "var(--agent-fundamentals)", icon: "◇" },
	bullish: { displayName: "Bullish", color: "var(--agent-bullish)", icon: "△" },
	bearish: { displayName: "Bearish", color: "var(--agent-bearish)", icon: "▽" },
	trader: { displayName: "Trader", color: "var(--agent-trader)", icon: "◆" },
	risk: { displayName: "Risk", color: "var(--agent-risk)", icon: "⬡" },
	critic: { displayName: "Critic", color: "var(--agent-critic)", icon: "◉" },
};

// Default metadata for unknown agents
const DEFAULT_AGENT_METADATA: AgentMetadata = {
	displayName: "Agent",
	color: "var(--stone-500)",
	icon: "●",
};

/**
 * Get display metadata for an agent type.
 * Returns known metadata for recognized types, or generates sensible defaults for new agents.
 */
export function getAgentMetadata(type: string, name?: string): AgentMetadata {
	// Check if it's a known type
	if (type in KNOWN_AGENT_METADATA) {
		return KNOWN_AGENT_METADATA[type as KnownAgentType];
	}

	// Generate metadata for unknown agents
	// Use the raw name if available, otherwise title-case the type
	const displayName =
		name ??
		type
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

	return {
		...DEFAULT_AGENT_METADATA,
		displayName,
	};
}

/**
 * @deprecated Use getAgentMetadata() instead for better support of dynamic agents
 */
export const AGENT_METADATA = KNOWN_AGENT_METADATA as Record<string, AgentMetadata>;
