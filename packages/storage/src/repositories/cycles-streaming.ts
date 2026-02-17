import type {
	CycleEvent,
	CycleEventType,
	ReconstructedAgentState,
	ReconstructedStreamingState,
	ReconstructedToolCall,
} from "./cycles.types";

export const STREAMING_EVENT_TYPES: CycleEventType[] = [
	"tool_call",
	"tool_result",
	"reasoning_delta",
	"text_delta",
	"agent_start",
	"agent_complete",
];

type ToolCallData = {
	toolCallId?: string;
	toolName?: string;
	toolArgs?: string;
};

type ToolResultData = {
	toolCallId?: string;
	success?: boolean;
	resultSummary?: string;
	durationMs?: number;
};

type DeltaData = { text?: string };

function createAgentState(): ReconstructedAgentState {
	return {
		status: "idle",
		toolCalls: [],
		reasoningText: "",
		textOutput: "",
		lastUpdate: null,
		startedAt: null,
	};
}

function ensureAgent(
	agents: Record<string, ReconstructedAgentState>,
	agentType: string,
): ReconstructedAgentState {
	if (!agents[agentType]) {
		agents[agentType] = createAgentState();
	}

	return agents[agentType] as ReconstructedAgentState;
}

function applyAgentStart(event: CycleEvent, agent: ReconstructedAgentState): void {
	agent.status = "processing";
	agent.startedAt = event.timestamp;
}

function applyAgentComplete(agent: ReconstructedAgentState): void {
	agent.status = "complete";
}

function applyToolCall(
	event: CycleEvent,
	agent: ReconstructedAgentState,
	toolCallsById: Map<string, ReconstructedToolCall>,
): void {
	agent.status = "processing";
	const data = event.data as ToolCallData;
	if (!data.toolCallId) {
		return;
	}

	const toolCall: ReconstructedToolCall = {
		toolCallId: data.toolCallId,
		toolName: data.toolName ?? "unknown",
		toolArgs: data.toolArgs ?? "{}",
		status: "pending",
		timestamp: event.timestamp,
	};

	agent.toolCalls.push(toolCall);
	toolCallsById.set(data.toolCallId, toolCall);
}

function applyToolResult(
	event: CycleEvent,
	toolCallsById: Map<string, ReconstructedToolCall>,
): void {
	const data = event.data as ToolResultData;
	const toolCall = data.toolCallId ? toolCallsById.get(data.toolCallId) : undefined;
	if (!toolCall) {
		return;
	}

	toolCall.status = data.success ? "complete" : "error";
	toolCall.resultSummary = data.resultSummary;
	toolCall.durationMs = data.durationMs;
}

function applyReasoningDelta(event: CycleEvent, agent: ReconstructedAgentState): void {
	agent.status = "processing";
	const data = event.data as DeltaData;
	if (data.text) {
		agent.reasoningText += data.text;
	}
}

function applyTextDelta(event: CycleEvent, agent: ReconstructedAgentState): void {
	agent.status = "processing";
	const data = event.data as DeltaData;
	if (data.text) {
		agent.textOutput += data.text;
	}
}

function applyAgentError(event: CycleEvent, agent: ReconstructedAgentState): void {
	agent.status = "error";
	agent.error = event.message ?? "Unknown error";
}

function applyEvent(
	event: CycleEvent,
	agent: ReconstructedAgentState,
	toolCallsById: Map<string, ReconstructedToolCall>,
): void {
	switch (event.eventType) {
		case "agent_start": {
			applyAgentStart(event, agent);
			break;
		}
		case "agent_complete": {
			applyAgentComplete(agent);
			break;
		}
		case "tool_call": {
			applyToolCall(event, agent, toolCallsById);
			break;
		}
		case "tool_result": {
			applyToolResult(event, toolCallsById);
			break;
		}
		case "reasoning_delta": {
			applyReasoningDelta(event, agent);
			break;
		}
		case "text_delta": {
			applyTextDelta(event, agent);
			break;
		}
		case "error": {
			applyAgentError(event, agent);
			break;
		}
	}
}

function sortToolCalls(agent: ReconstructedAgentState): ReconstructedToolCall[] {
	return agent.toolCalls.toSorted(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
}

export function reconstructStreamingState(events: CycleEvent[]): ReconstructedStreamingState {
	const agents: Record<string, ReconstructedAgentState> = {};
	const toolCallsById = new Map<string, ReconstructedToolCall>();

	for (const event of events) {
		if (!event.agentType) {
			continue;
		}

		const agent = ensureAgent(agents, event.agentType);
		agent.lastUpdate = event.timestamp;
		applyEvent(event, agent, toolCallsById);
	}

	for (const agent of Object.values(agents)) {
		agent.toolCalls = sortToolCalls(agent);
	}

	return {
		agents,
		cycleId: events[0]?.cycleId ?? "",
	};
}
