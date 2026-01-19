"use client";

/**
 * Agent Streaming Hook
 *
 * Manages real-time streaming state from trading agents including
 * tool calls, tool results, reasoning deltas, and text deltas.
 *
 * Uses Zustand store to persist state across navigation.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
	AGENT_TYPES,
	type AgentStreamingState,
	type AgentType,
	type SourceEntry,
	type ToolCall,
	useAgentStreamingActions,
	useAllAgentStreaming,
} from "@/stores/agent-streaming-store";

// Re-export types for convenience
export type { AgentType, AgentStreamingState, ToolCall };
export { AGENT_TYPES };

export type AgentStatus = "idle" | "processing" | "complete" | "error";

// ============================================
// Message Types
// ============================================

interface ToolCallMessage {
	type: "agent_tool_call";
	data: {
		cycleId: string;
		agentType: AgentType;
		toolName: string;
		toolArgs: string;
		toolCallId: string;
		timestamp: string;
	};
}

interface ToolResultMessage {
	type: "agent_tool_result";
	data: {
		cycleId: string;
		agentType: AgentType;
		toolName: string;
		toolCallId: string;
		resultSummary: string;
		success: boolean;
		durationMs?: number;
		timestamp: string;
	};
}

interface ReasoningMessage {
	type: "agent_reasoning";
	data: {
		cycleId: string;
		agentType: AgentType;
		text: string;
		timestamp: string;
	};
}

interface TextDeltaMessage {
	type: "agent_text_delta";
	data: {
		cycleId: string;
		agentType: AgentType;
		text: string;
		timestamp: string;
	};
}

interface AgentOutputMessage {
	type: "agent_output";
	data: {
		cycleId: string;
		agentType: AgentType;
		status: "running" | "complete" | "error";
		output?: string;
		error?: string;
		durationMs?: number;
		timestamp: string;
	};
}

interface SourceMessage {
	type: "agent_source";
	data: {
		cycleId: string;
		agentType: AgentType;
		sourceType: "url" | "x";
		url: string;
		title?: string;
		domain?: string;
		logoUrl?: string;
		timestamp: string;
	};
}

type AgentStreamMessage =
	| ToolCallMessage
	| ToolResultMessage
	| ReasoningMessage
	| TextDeltaMessage
	| AgentOutputMessage
	| SourceMessage;

// ============================================
// Options & Return Types
// ============================================

export interface UseAgentStreamingOptions {
	/** Only track streaming for a specific cycle */
	cycleId?: string | null;
	/** Auto-subscribe on mount (default: true) */
	autoSubscribe?: boolean;
}

export interface UseAgentStreamingReturn {
	/** Streaming state per agent type */
	agents: Map<AgentType, AgentStreamingState>;
	/** Get streaming state for a specific agent */
	getAgent: (agentType: AgentType) => AgentStreamingState | undefined;
	/** Whether subscribed to streaming channel */
	isSubscribed: boolean;
	/** Current cycle ID being tracked */
	currentCycleId: string | null;
	/** Current phase of the cycle (includes "complete" for finished cycles) */
	currentPhase: import("@/stores/agent-streaming-store").OODAPhase | null;
	/** View mode (live or historical) */
	viewMode: "live" | "historical";
	/** Historical cycle ID when viewing past data */
	historicalCycleId: string | null;
	/** Clear all streaming state */
	clear: () => void;
}

// ============================================
// Hook
// ============================================

export function useAgentStreaming(options: UseAgentStreamingOptions = {}): UseAgentStreamingReturn {
	const { cycleId = null, autoSubscribe = true } = options;

	const { lastMessage, subscribe, unsubscribe, connected } = useWebSocketContext();

	// Use Zustand store for persistent state
	const { agents, currentCycleId, currentPhase, viewMode, historicalCycleId, getAgent } =
		useAllAgentStreaming();
	const {
		addToolCall,
		addSource,
		updateToolCallResult,
		appendReasoning,
		appendTextOutput,
		updateAgentStatus,
		setCycleId,
		clear,
	} = useAgentStreamingActions();

	const [isSubscribed, setIsSubscribed] = useState(false);

	// Ref for stable cycleId access in callbacks
	const cycleIdRef = useRef(cycleId);
	cycleIdRef.current = cycleId;

	// Ref for stable viewMode access in callbacks
	const viewModeRef = useRef(viewMode);
	viewModeRef.current = viewMode;

	// Handle incoming WebSocket messages
	const handleMessage = useCallback(
		(message: AgentStreamMessage) => {
			// Skip processing when viewing historical data
			if (viewModeRef.current === "historical") {
				return;
			}

			if (!("data" in message) || !message.data) {
				return;
			}

			const { cycleId: msgCycleId, agentType: msgAgentType } = message.data;

			// Filter by cycle ID if specified
			if (cycleIdRef.current && msgCycleId !== cycleIdRef.current) {
				return;
			}

			// Track the cycle we're receiving messages for
			if (msgCycleId !== currentCycleId) {
				setCycleId(msgCycleId);
			}

			const agentType = msgAgentType as AgentType;
			if (!AGENT_TYPES.includes(agentType)) {
				return;
			}

			switch (message.type) {
				case "agent_tool_call": {
					const toolCallData = message.data;
					const toolCall: ToolCall = {
						toolCallId: toolCallData.toolCallId,
						toolName: toolCallData.toolName,
						toolArgs: toolCallData.toolArgs,
						status: "pending",
						timestamp: toolCallData.timestamp,
					};
					addToolCall(agentType, toolCall);
					break;
				}

				case "agent_tool_result": {
					const resultData = message.data;
					const currentAgent = getAgent(agentType);
					const existingToolCall = currentAgent?.toolCalls.some(
						(tc) => tc.toolCallId === resultData.toolCallId
					);
					// In case a tool result arrives without a prior tool-call event (provider/stream edge cases),
					// create a placeholder tool call so the UI can still display the result.
					if (!existingToolCall) {
						addToolCall(agentType, {
							toolCallId: resultData.toolCallId,
							toolName: resultData.toolName,
							toolArgs: "{}",
							status: "pending",
							timestamp: resultData.timestamp,
						});
					}
					updateToolCallResult(agentType, resultData.toolCallId, {
						success: resultData.success,
						resultSummary: resultData.resultSummary,
						durationMs: resultData.durationMs,
					});
					break;
				}

				case "agent_reasoning": {
					const reasoningData = message.data;
					appendReasoning(agentType, reasoningData.text, reasoningData.timestamp);
					break;
				}

				case "agent_text_delta": {
					const textData = message.data;
					appendTextOutput(agentType, textData.text, textData.timestamp);
					break;
				}

				case "agent_output": {
					const outputData = message.data;
					const status =
						outputData.status === "running"
							? "processing"
							: outputData.status === "complete"
								? "complete"
								: "error";
					// Pass timestamp as startedAt when agent starts (status=running)
					const startedAt = outputData.status === "running" ? outputData.timestamp : undefined;
					updateAgentStatus(agentType, status, outputData.error, startedAt);
					break;
				}

				case "agent_source": {
					const sourceData = message.data;
					const source: SourceEntry = {
						sourceId: `${sourceData.url}-${sourceData.timestamp}`,
						sourceType: sourceData.sourceType,
						url: sourceData.url,
						title: sourceData.title,
						domain: sourceData.domain,
						logoUrl: sourceData.logoUrl,
						timestamp: sourceData.timestamp,
					};
					addSource(agentType, source);
					break;
				}
			}
		},
		[
			currentCycleId,
			setCycleId,
			getAgent,
			addToolCall,
			addSource,
			updateToolCallResult,
			appendReasoning,
			appendTextOutput,
			updateAgentStatus,
		]
	);

	// Process incoming WebSocket messages
	useEffect(() => {
		if (!lastMessage) {
			return;
		}

		const message = lastMessage as unknown as AgentStreamMessage;
		if (
			message.type === "agent_tool_call" ||
			message.type === "agent_tool_result" ||
			message.type === "agent_reasoning" ||
			message.type === "agent_text_delta" ||
			message.type === "agent_output" ||
			message.type === "agent_source"
		) {
			handleMessage(message);
		}
	}, [lastMessage, handleMessage]);

	// Subscribe/unsubscribe to cycles channel
	useEffect(() => {
		if (!autoSubscribe || !connected) {
			setIsSubscribed(false);
			return;
		}

		subscribe(["cycles"]);
		setIsSubscribed(true);

		return () => {
			unsubscribe(["cycles"]);
			setIsSubscribed(false);
		};
	}, [autoSubscribe, connected, subscribe, unsubscribe]);

	return useMemo(
		() => ({
			agents,
			getAgent,
			isSubscribed,
			currentCycleId,
			currentPhase,
			viewMode,
			historicalCycleId,
			clear,
		}),
		[
			agents,
			getAgent,
			isSubscribed,
			currentCycleId,
			currentPhase,
			viewMode,
			historicalCycleId,
			clear,
		]
	);
}

export default useAgentStreaming;
