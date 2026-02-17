/**
 * WebSocket Query Sync Hook
 *
 * Integrates WebSocket messages with TanStack Query cache invalidation.
 *
 * @see docs/plans/ui/07-state-management.md lines 46-66
 */

"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

export type ServerMessageType =
	| "quote"
	| "order"
	| "decision"
	| "system_status"
	| "alert"
	| "agent_output"
	| "cycle_progress"
	| "portfolio"
	| "position"
	| "heartbeat"
	| "error";

/**
 * Quote message payload.
 */
export interface QuotePayload {
	symbol: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	timestamp: string;
}

/**
 * Order message payload.
 */
export interface OrderPayload {
	orderId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	price: number;
	status: "pending" | "filled" | "cancelled" | "rejected";
	filledQuantity?: number;
	timestamp: string;
}

/**
 * Decision message payload.
 */
export interface DecisionPayload {
	decisionId: string;
	symbol: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	confidence: number;
	timestamp: string;
}

/**
 * System status payload.
 */
export interface SystemStatusPayload {
	status: "online" | "offline" | "degraded";
	services: Record<string, "healthy" | "unhealthy" | "unknown">;
	lastUpdated: string;
}

/**
 * Alert payload.
 */
export interface AlertPayload {
	alertId: string;
	type: "info" | "warning" | "error" | "success";
	title: string;
	message: string;
	timestamp: string;
}

/**
 * Agent output payload.
 */
export interface AgentOutputPayload {
	agentId: string;
	agentName: string;
	output: string;
	timestamp: string;
}

/**
 * Cycle progress payload.
 */
export interface CycleProgressPayload {
	cycleId: string;
	phase: "observe" | "orient" | "decide" | "act" | "complete";
	progress: number;
	timestamp: string;
}

/**
 * Portfolio payload.
 */
export interface PortfolioPayload {
	equity: number;
	cash: number;
	buyingPower: number;
	dayPL: number;
	totalPL: number;
	timestamp: string;
}

/**
 * Position payload.
 */
export interface PositionPayload {
	symbol: string;
	quantity: number;
	avgCost: number;
	currentPrice: number;
	unrealizedPL: number;
	timestamp: string;
}

/**
 * Server message structure.
 */
export interface ServerMessage<T = unknown> {
	type: ServerMessageType;
	data: T;
	timestamp: string;
}

/**
 * Hook options.
 */
export interface UseWebSocketQuerySyncOptions {
	/** Debounce invalidations in ms (default: 100) */
	debounceMs?: number;

	/** Callback for cycle progress updates (for Zustand store) */
	onCycleProgress?: (payload: CycleProgressPayload) => void;

	/** Callback for errors */
	onError?: (error: Error) => void;
}

/**
 * Hook return type.
 */
export interface UseWebSocketQuerySyncReturn {
	/** Handle incoming WebSocket message */
	handleMessage: (message: unknown) => void;

	/** Manually invalidate queries by type */
	invalidateByType: (type: ServerMessageType) => void;

	/** Get pending invalidation count */
	pendingCount: number;

	/** Flush all pending invalidations immediately */
	flush: () => void;
}

// ============================================
// Query Key Factories
// ============================================

/**
 * Query key factories for consistent key generation.
 */
export const queryKeys = {
	// Market data
	marketQuote: (symbol: string) => ["market", "quote", symbol] as const,
	marketQuotes: () => ["market", "quotes"] as const,

	// Portfolio
	portfolio: () => ["portfolio"] as const,
	portfolioSummary: () => ["portfolio", "summary"] as const,
	positions: () => ["portfolio", "positions"] as const,
	position: (symbol: string) => ["portfolio", "positions", symbol] as const,

	// Orders
	orders: () => ["orders"] as const,
	order: (orderId: string) => ["orders", orderId] as const,
	activeOrders: () => ["orders", "active"] as const,

	// Decisions
	decisions: () => ["decisions"] as const,
	decision: (decisionId: string) => ["decisions", decisionId] as const,
	recentDecisions: () => ["decisions", "recent"] as const,

	// Alerts
	alerts: () => ["alerts"] as const,
	unreadAlerts: () => ["alerts", "unread"] as const,

	// Agents
	agents: () => ["agents"] as const,
	agentOutput: (agentId: string) => ["agents", agentId, "output"] as const,

	// System
	systemStatus: () => ["system", "status"] as const,
	systemHealth: () => ["system", "health"] as const,
} as const;

// ============================================
// Message Validation
// ============================================

/**
 * Validate and parse server message.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}

	const message = raw as Record<string, unknown>;

	if (typeof message.type !== "string") {
		return null;
	}

	const validTypes: ServerMessageType[] = [
		"quote",
		"order",
		"decision",
		"system_status",
		"alert",
		"agent_output",
		"cycle_progress",
		"portfolio",
		"position",
		"heartbeat",
		"error",
	];

	if (!validTypes.includes(message.type as ServerMessageType)) {
		return null;
	}

	return {
		type: message.type as ServerMessageType,
		data: message.data,
		timestamp: (message.timestamp as string | undefined) ?? new Date().toISOString(),
	};
}

// ============================================
// Debounced Invalidation
// ============================================

/**
 * Create a debounced invalidation batcher.
 */
function createInvalidationBatcher(queryClient: QueryClient, debounceMs: number) {
	const pending = new Set<string>();
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const flush = () => {
		if (pending.size === 0) {
			return;
		}

		const keys = Array.from(pending);
		pending.clear();

		// Group by top-level key for batch invalidation
		const keyGroups = new Map<string, string[][]>();
		for (const keyStr of keys) {
			const key = JSON.parse(keyStr) as string[];
			const topLevel = key[0];
			if (!topLevel) {
				continue;
			}
			if (!keyGroups.has(topLevel)) {
				keyGroups.set(topLevel, []);
			}
			keyGroups.get(topLevel)?.push(key);
		}

		// Invalidate by group
		for (const [_topLevel, queryKeys] of keyGroups) {
			// Use the shortest key for partial matching
			const shortestKey = queryKeys.reduce((a, b) => (a.length <= b.length ? a : b));
			queryClient.invalidateQueries({ queryKey: shortestKey });
		}
	};

	const add = (queryKey: readonly unknown[]) => {
		pending.add(JSON.stringify(queryKey));

		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(flush, debounceMs);
	};

	const cancel = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	return {
		add,
		flush,
		cancel,
		get size() {
			return pending.size;
		},
	};
}

function createServerMessageInvalidator(
	queryClient: QueryClient,
	_batcher: ReturnType<typeof createInvalidationBatcher>,
) {
	return function invalidateByType(type: ServerMessageType) {
		switch (type) {
			case "quote":
				queryClient.invalidateQueries({ queryKey: ["market"] });
				break;
			case "order":
				queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
				queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() });
				break;
			case "decision":
				queryClient.invalidateQueries({ queryKey: queryKeys.decisions() });
				break;
			case "system_status":
				queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus() });
				break;
			case "alert":
				queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
				break;
			case "agent_output":
				queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
				break;
			case "portfolio":
			case "position":
				queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() });
				break;
			case "heartbeat":
			case "cycle_progress":
			case "error":
				break;
		}
	};
}

function routeServerMessage({
	message,
	queryClient,
	batcher,
	onCycleProgressRef,
	onErrorRef,
}: {
	message: ServerMessage;
	queryClient: QueryClient;
	batcher: ReturnType<typeof createInvalidationBatcher>;
	onCycleProgressRef: { current: ((payload: CycleProgressPayload) => void) | undefined };
	onErrorRef: { current: ((error: Error) => void) | undefined };
}) {
	if (message.type === "heartbeat") {
		return;
	}

	switch (message.type) {
		case "quote": {
			const payload = message.data as QuotePayload;
			queryClient.setQueryData(queryKeys.marketQuote(payload.symbol), payload);
			return;
		}
		case "order": {
			batcher.add(queryKeys.portfolio());
			batcher.add(queryKeys.positions());
			batcher.add(queryKeys.orders());
			return;
		}
		case "decision":
			batcher.add(queryKeys.decisions());
			return;
		case "system_status":
			// System status is handled separately by REST polling.
			return;
		case "alert":
			batcher.add(queryKeys.alerts());
			return;
		case "agent_output":
			batcher.add(queryKeys.agents());
			return;
		case "cycle_progress":
			onCycleProgressRef.current?.(message.data as CycleProgressPayload);
			return;
		case "portfolio": {
			const payload = message.data as PortfolioPayload;
			queryClient.setQueryData(queryKeys.portfolioSummary(), payload);
			return;
		}
		case "position": {
			const payload = message.data as PositionPayload;
			queryClient.setQueryData(queryKeys.position(payload.symbol), payload);
			batcher.add(queryKeys.positions());
			return;
		}
		case "error": {
			const error = new Error(typeof message.data === "string" ? message.data : "WebSocket error");
			onErrorRef.current?.(error);
			return;
		}
		default:
			return;
	}
}

function useInvalidationBatcher(queryClient: QueryClient, debounceMs: number) {
	const batcher = createInvalidationBatcher(queryClient, debounceMs);

	useEffect(() => {
		return () => {
			batcher.cancel();
		};
	}, [batcher]);

	return batcher;
}

function useMessageCallbacks(
	queryClient: QueryClient,
	batcher: ReturnType<typeof createInvalidationBatcher>,
	onCycleProgressRef: { current: ((payload: CycleProgressPayload) => void) | undefined },
	onErrorRef: { current: ((error: Error) => void) | undefined },
) {
	const handleMessage = useCallback(
		(raw: unknown) => {
			try {
				const message = parseServerMessage(raw);
				if (!message) {
					return;
				}

				routeServerMessage({
					message,
					queryClient,
					batcher,
					onCycleProgressRef,
					onErrorRef,
				});
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				onErrorRef.current?.(error);
			}
		},
		[batcher, onCycleProgressRef, onErrorRef, queryClient],
	);

	const invalidateByType = useCallback(
		(type: ServerMessageType) => {
			createServerMessageInvalidator(queryClient, batcher)(type);
		},
		[batcher, queryClient],
	);

	const flush = useCallback(() => {
		batcher.flush();
	}, [batcher]);

	return {
		handleMessage,
		invalidateByType,
		flush,
	};
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for syncing WebSocket messages with TanStack Query cache.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { handleMessage } = useWebSocketQuerySync({
 *     onCycleProgress: (payload) => useCycleStore.getState().setProgress(payload),
 *   });
 *
 *   useWebSocket({
 *     url: WS_URL,
 *     onMessage: handleMessage,
 *   });
 * }
 * ```
 */
export function useWebSocketQuerySync(
	options: UseWebSocketQuerySyncOptions = {},
): UseWebSocketQuerySyncReturn {
	const { debounceMs = 100, onCycleProgress, onError } = options;
	const queryClient = useQueryClient();
	const onCycleProgressRef = useRef(onCycleProgress);
	const onErrorRef = useRef(onError);

	useEffect(() => {
		onCycleProgressRef.current = onCycleProgress;
		onErrorRef.current = onError;
	}, [onCycleProgress, onError]);

	const batcher = useInvalidationBatcher(queryClient, debounceMs);
	const { handleMessage, invalidateByType, flush } = useMessageCallbacks(
		queryClient,
		batcher,
		onCycleProgressRef,
		onErrorRef,
	);

	return {
		handleMessage,
		invalidateByType,
		pendingCount: batcher.size,
		flush,
	};
}

export default useWebSocketQuerySync;
