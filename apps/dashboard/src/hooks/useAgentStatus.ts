"use client";

/**
 * Agent Status Hook
 *
 * Real-time agent status via WebSocket, replacing HTTP polling.
 * Subscribes to "agents" channel and maintains status for all 8 agents.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentStatus } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

interface AgentStatusMessage {
	type: "agent_status";
	data: {
		type: string;
		displayName: string;
		status: "idle" | "processing" | "error";
		lastOutputAt: string | null;
		outputsToday: number;
		avgConfidence: number;
		approvalRate: number;
		timestamp: string;
	};
}

export interface UseAgentStatusOptions {
	/** Auto-subscribe on mount (default: true) */
	autoSubscribe?: boolean;
}

export interface UseAgentStatusReturn {
	/** Agent statuses by type */
	statuses: Map<string, AgentStatus>;
	/** Get status for a specific agent */
	getStatus: (agentType: string) => AgentStatus | undefined;
	/** All statuses as array (for compatibility with useAgentStatuses) */
	statusArray: AgentStatus[];
	/** Whether subscribed to agents channel */
	isSubscribed: boolean;
	/** Whether we have received initial data */
	hasData: boolean;
	/** Request fresh data from server */
	refresh: () => void;
}

// ============================================
// Hook
// ============================================

export function useAgentStatus(options: UseAgentStatusOptions = {}): UseAgentStatusReturn {
	const { autoSubscribe = true } = options;

	const { lastMessage, subscribe, unsubscribe, send, connected } = useWebSocketContext();

	const [statuses, setStatuses] = useState<Map<string, AgentStatus>>(new Map());
	const [isSubscribed, setIsSubscribed] = useState(false);
	const [hasData, setHasData] = useState(false);

	// Get status for a specific agent
	const getStatus = useCallback(
		(agentType: string): AgentStatus | undefined => {
			return statuses.get(agentType);
		},
		[statuses]
	);

	// Convert to array for compatibility
	const statusArray = useMemo(() => {
		return Array.from(statuses.values());
	}, [statuses]);

	// Request state from server
	const refresh = useCallback(() => {
		if (connected) {
			send({ type: "request_state", channel: "agents" });
		}
	}, [connected, send]);

	// Handle incoming WebSocket messages
	useEffect(() => {
		if (!lastMessage) {
			return;
		}

		const message = lastMessage as unknown as AgentStatusMessage;
		if (message.type === "agent_status" && message.data) {
			setStatuses((prev) => {
				const next = new Map(prev);
				next.set(message.data.type, {
					type: message.data.type,
					displayName: message.data.displayName,
					status: message.data.status,
					lastOutputAt: message.data.lastOutputAt,
					outputsToday: message.data.outputsToday,
					avgConfidence: message.data.avgConfidence,
					approvalRate: message.data.approvalRate,
				});
				return next;
			});
			setHasData(true);
		}
	}, [lastMessage]);

	// Subscribe/unsubscribe to agents channel
	useEffect(() => {
		if (!autoSubscribe || !connected) {
			setIsSubscribed(false);
			return;
		}

		subscribe(["agents"]);
		setIsSubscribed(true);

		// Request initial state after subscribing
		send({ type: "request_state", channel: "agents" });

		return () => {
			unsubscribe(["agents"]);
			setIsSubscribed(false);
		};
	}, [autoSubscribe, connected, subscribe, unsubscribe, send]);

	return useMemo(
		() => ({
			statuses,
			getStatus,
			statusArray,
			isSubscribed,
			hasData,
			refresh,
		}),
		[statuses, getStatus, statusArray, isSubscribed, hasData, refresh]
	);
}

export default useAgentStatus;
