/**
 * Cycle Trigger Event Handlers
 *
 * Normalizes and emits agent/step events from workflow stream to websocket + persistence queues.
 */

import type { AgentType, CyclePhase } from "@cream/domain/websocket";
import log from "../../src/logger.js";
import {
	queueAgentComplete,
	queueAgentStart,
	queueReasoningDelta,
	queueTextDelta,
	queueToolCall,
	queueToolResult,
} from "../../src/services/cycle-event-persistence.js";
import {
	broadcastAgentOutput,
	broadcastAgentReasoning,
	broadcastAgentSource,
	broadcastAgentTextDelta,
	broadcastAgentToolCall,
	broadcastAgentToolResult,
} from "../../src/websocket/handler.js";

const AGENT_TYPE_MAP: Record<string, AgentType> = {
	grounding_agent: "grounding",
	news_analyst: "news",
	fundamentals_analyst: "fundamentals",
	bullish_researcher: "bullish",
	bearish_researcher: "bearish",
	trader: "trader",
	risk_manager: "risk",
	critic: "critic",
};

const STEP_PROGRESS: Record<string, { phase: CyclePhase; progress: number }> = {
	observe: { phase: "observe", progress: 20 },
	orient: { phase: "orient", progress: 30 },
	analysts: { phase: "decide", progress: 45 },
	debate: { phase: "decide", progress: 60 },
	trader: { phase: "decide", progress: 75 },
	consensus: { phase: "decide", progress: 90 },
	act: { phase: "act", progress: 100 },
};

export function isAgentEvent(obj: unknown): obj is Record<string, unknown> {
	if (!obj || typeof obj !== "object") {
		return false;
	}
	const candidate = obj as Record<string, unknown>;
	return (
		candidate.type === "agent-start" ||
		candidate.type === "agent-chunk" ||
		candidate.type === "agent-complete" ||
		candidate.type === "agent-error"
	);
}

export function toRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object") {
		return value as Record<string, unknown>;
	}
	return {};
}

export function traceWorkflowEvent(
	event: Record<string, unknown>,
	seenEventTypes: Set<string>,
	seenStepNames: Set<string>,
): void {
	const evtType = event.type as string | undefined;
	if (!evtType || seenEventTypes.has(evtType)) {
		return;
	}
	seenEventTypes.add(evtType);
	const payload = event.payload as Record<string, unknown> | undefined;
	const stepName = payload?.stepName as string | undefined;
	if (stepName) {
		seenStepNames.add(stepName);
	}
	log.info(
		{
			cycleId: event.cycleId,
			eventType: evtType,
			stepName,
			payloadKeys: payload ? Object.keys(payload) : [],
			...(evtType === "workflow-finish" && payload
				? {
						workflowStatus: payload.workflowStatus,
						output: JSON.stringify(payload.output)?.slice(0, 1000),
						metadata: JSON.stringify(payload.metadata)?.slice(0, 500),
					}
				: {}),
		},
		"Stream event type observed",
	);
}

export function extractAgentEvent(
	payload: Record<string, unknown>,
): Record<string, unknown> | null {
	const eventOutput = payload.output;
	if (eventOutput && isAgentEvent(eventOutput)) {
		return eventOutput;
	}
	const eventData = payload.data;
	if (eventData && isAgentEvent(eventData)) {
		return eventData;
	}
	const eventValue = payload.value;
	if (eventValue && isAgentEvent(eventValue)) {
		return eventValue;
	}
	if (isAgentEvent(payload)) {
		return payload;
	}
	return null;
}

export function handleAgentEvent(agentEvent: Record<string, unknown>, cycleId: string): void {
	const type = String(agentEvent.type);
	const sourceAgent = String(agentEvent.agent ?? "");
	const agentType = AGENT_TYPE_MAP[sourceAgent];
	if (!agentType) {
		if (sourceAgent) {
			log.debug(
				{
					cycleId,
					agent: sourceAgent,
					eventType: type,
					availableAgents: Object.keys(AGENT_TYPE_MAP),
				},
				"Agent event with unmapped agent type",
			);
		}
		return;
	}

	const ts = String(agentEvent.timestamp ?? new Date().toISOString());
	const dbAgentType = sourceAgent;

	switch (type) {
		case "agent-start":
			handleAgentStart(agentEvent, cycleId, agentType, ts, dbAgentType);
			return;
		case "agent-chunk":
			handleAgentChunk(agentEvent, cycleId, agentType, ts, dbAgentType);
			return;
		case "agent-complete":
			handleAgentComplete(agentEvent, cycleId, agentType, ts, dbAgentType);
			return;
		case "agent-error":
			handleAgentError(agentEvent, cycleId, agentType, ts);
	}
}

function handleAgentStart(
	_event: Record<string, unknown>,
	cycleId: string,
	agentType: AgentType,
	timestamp: string,
	dbAgentType: string,
): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId,
			agentType,
			status: "running",
			output: `${agentType} agent started`,
			timestamp,
		},
	});
	queueAgentStart(cycleId, dbAgentType);
}

type AgentChunkContext = {
	cycleId: string;
	agentType: AgentType;
	timestamp: string;
	dbAgentType: string;
	chunkType: string;
	textContent: string | undefined;
	toolName: string | undefined;
	toolArgs: Record<string, unknown> | undefined;
	result: unknown;
	success: boolean | undefined;
	errorText: string | undefined;
	sourceType: "url" | "x";
	toolCallId: string;
	resolvedToolName: string;
	resolvedToolArgs: string;
	resolvedResultSummary: string;
	url: string | undefined;
	title: string | undefined;
	domain: string | undefined;
	logoUrl: string | undefined;
};

function handleAgentChunk(
	event: Record<string, unknown>,
	cycleId: string,
	agentType: AgentType,
	timestamp: string,
	dbAgentType: string,
): void {
	const payload = extractAgentChunkContext(event, cycleId, agentType, timestamp, dbAgentType);
	const chunkAction = resolveChunkAction(payload);

	switch (chunkAction) {
		case "text-delta":
			handleTextDelta(payload);
			return;
		case "reasoning-delta":
			handleReasoningDelta(payload);
			return;
		case "tool-result":
			handleToolResult(payload);
			return;
		case "tool-call":
			handleToolCall(payload);
			return;
		case "source":
			handleSourceChunk(payload);
			return;
		case "error":
			handleChunkError(payload);
			return;
	}
}

function extractAgentChunkContext(
	event: Record<string, unknown>,
	cycleId: string,
	agentType: AgentType,
	timestamp: string,
	dbAgentType: string,
): AgentChunkContext {
	const outerData = event.data as Record<string, unknown> | undefined;
	const payload = outerData?.payload as Record<string, unknown> | undefined;
	const chunkType = (outerData?.type as string | undefined) ?? "";
	const textContent = payload?.text as string | undefined;
	const toolName = payload?.toolName as string | undefined;
	const toolArgs = payload?.toolArgs as Record<string, unknown> | undefined;
	const result = payload?.result;
	const success = payload?.success as boolean | undefined;
	const errorText = payload?.error as string | undefined;
	const sourceType = (payload?.sourceType as "url" | "x" | undefined) ?? "url";

	const toolCallId = (payload?.toolCallId as string | undefined) ?? `tc_${Date.now()}`;
	const resolvedToolName = String(toolName ?? "unknown");
	const resolvedToolArgs = JSON.stringify(toolArgs ?? {});
	const resolvedResultSummary = JSON.stringify(result ?? {}).slice(0, 200);

	return {
		cycleId,
		agentType,
		timestamp,
		dbAgentType,
		chunkType,
		textContent,
		toolName,
		toolArgs,
		result,
		success,
		errorText,
		sourceType,
		toolCallId,
		resolvedToolName,
		resolvedToolArgs,
		resolvedResultSummary,
		url: payload?.url as string | undefined,
		title: payload?.title as string | undefined,
		domain: payload?.domain as string | undefined,
		logoUrl: payload?.logoUrl as string | undefined,
	};
}

type AgentChunkAction =
	| "text-delta"
	| "reasoning-delta"
	| "tool-result"
	| "tool-call"
	| "source"
	| "error"
	| "other";

function resolveChunkAction(context: AgentChunkContext): AgentChunkAction {
	if (context.chunkType === "text-delta" && !!context.textContent) {
		return "text-delta";
	}
	if (context.chunkType === "reasoning-delta" && !!context.textContent) {
		return "reasoning-delta";
	}
	if (context.chunkType === "tool-result" || context.result !== undefined) {
		return "tool-result";
	}
	if (
		context.chunkType === "tool-call" ||
		(context.toolName !== undefined && context.toolArgs !== undefined)
	) {
		return "tool-call";
	}
	if (context.chunkType === "source" && !!context.url) {
		return "source";
	}
	if (context.chunkType === "error" && !!context.errorText) {
		return "error";
	}
	return "other";
}

function handleTextDelta(context: AgentChunkContext): void {
	if (!context.textContent) {
		return;
	}

	broadcastAgentTextDelta({
		type: "agent_text_delta",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			text: context.textContent,
			timestamp: context.timestamp,
		},
	});
	queueTextDelta(context.cycleId, context.dbAgentType, context.textContent);
}

function handleReasoningDelta(context: AgentChunkContext): void {
	if (!context.textContent) {
		return;
	}

	broadcastAgentReasoning({
		type: "agent_reasoning",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			text: context.textContent,
			timestamp: context.timestamp,
		},
	});
	queueReasoningDelta(context.cycleId, context.dbAgentType, context.textContent);
}

function handleToolResult(context: AgentChunkContext): void {
	broadcastAgentToolResult({
		type: "agent_tool_result",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			toolName: context.resolvedToolName,
			toolCallId: context.toolCallId,
			resultSummary: context.resolvedResultSummary,
			success: context.success ?? true,
			timestamp: context.timestamp,
		},
	});
	queueToolResult(context.cycleId, context.dbAgentType, {
		toolCallId: context.toolCallId,
		toolName: context.resolvedToolName,
		success: context.success ?? true,
		resultSummary: context.resolvedResultSummary,
	});
}

function handleToolCall(context: AgentChunkContext): void {
	broadcastAgentToolCall({
		type: "agent_tool_call",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			toolName: context.resolvedToolName,
			toolArgs: context.resolvedToolArgs,
			toolCallId: context.toolCallId,
			timestamp: context.timestamp,
		},
	});
	queueToolCall(context.cycleId, context.dbAgentType, {
		toolCallId: context.toolCallId,
		toolName: context.resolvedToolName,
		toolArgs: context.resolvedToolArgs,
	});
}

function handleSourceChunk(context: AgentChunkContext): void {
	if (!context.url) {
		return;
	}
	broadcastAgentSource({
		type: "agent_source",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			sourceType: context.sourceType,
			url: context.url,
			title: context.title,
			domain: context.domain,
			logoUrl: context.logoUrl,
			timestamp: context.timestamp,
		},
	});
}

function handleChunkError(context: AgentChunkContext): void {
	if (!context.errorText) {
		return;
	}
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId: context.cycleId,
			agentType: context.agentType,
			status: "error",
			output: context.errorText,
			error: context.errorText,
			timestamp: context.timestamp,
		},
	});
}

function handleAgentComplete(
	event: Record<string, unknown>,
	cycleId: string,
	agentType: AgentType,
	timestamp: string,
	dbAgentType: string,
): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId,
			agentType,
			status: "complete",
			output: JSON.stringify(
				(event.data as Record<string, unknown> | undefined)?.output ?? {},
			).slice(0, 500),
			timestamp,
		},
	});
	queueAgentComplete(cycleId, dbAgentType, {
		output: (event.data as Record<string, unknown> | undefined)?.output,
	});
}

function handleAgentError(
	event: Record<string, unknown>,
	cycleId: string,
	agentType: AgentType,
	timestamp: string,
): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId,
			agentType,
			status: "error",
			output: String(event.error ?? "Unknown error"),
			error: String(event.error ?? "Unknown error"),
			timestamp,
		},
	});
}

export function handleWorkflowStepFinish(
	event: Record<string, unknown>,
	emitProgress: (phase: CyclePhase, progress: number, step: string, message: string) => void,
): void {
	const payload = (event.payload as Record<string, unknown>) ?? {};
	const stepId = String(payload.stepName ?? "");
	const stepInfo = STEP_PROGRESS[stepId];
	if (!stepInfo) {
		return;
	}
	emitProgress(stepInfo.phase, stepInfo.progress, stepId, `Completed ${stepId} step`);
}
