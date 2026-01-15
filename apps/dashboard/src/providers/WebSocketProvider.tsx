/**
 * WebSocket Provider
 *
 * Provides WebSocket connection context to the app.
 * Integrates with TanStack Query for cache invalidation.
 *
 * @see docs/plans/ui/06-websocket.md
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { type ConnectionState, useWebSocket } from "@/hooks/useWebSocket";
import { handleWSMessage, type WSMessage } from "@/lib/api/ws-invalidation";
import { config } from "@/lib/config";

// ============================================
// Types
// ============================================

interface WebSocketContextValue {
	/** Current connection state */
	connectionState: ConnectionState;
	/** Whether connected */
	connected: boolean;
	/** Whether reconnecting */
	reconnecting: boolean;
	/** Last received message */
	lastMessage: WSMessage | null;
	/** Send raw message data */
	send: (data: unknown) => boolean;
	/** Send a typed message */
	sendMessage: (type: string, payload: unknown) => boolean;
	/** Subscribe to channels */
	subscribe: (channels: string[]) => void;
	/** Unsubscribe from channels */
	unsubscribe: (channels: string[]) => void;
	/** Subscribe to symbols for real-time quotes */
	subscribeSymbols: (symbols: string[]) => void;
	/** Unsubscribe from symbols */
	unsubscribeSymbols: (symbols: string[]) => void;
	/** Subscribe to options contracts for real-time quotes */
	subscribeOptions: (contracts: string[]) => void;
	/** Unsubscribe from options contracts */
	unsubscribeOptions: (contracts: string[]) => void;
	/** Subscribe to a backtest for progress updates */
	subscribeBacktest: (backtestId: string) => void;
	/** Unsubscribe from backtest progress updates */
	unsubscribeBacktest: (backtestId: string) => void;
	/** Connect manually */
	connect: () => void;
	/** Disconnect manually */
	disconnect: () => void;
	/** Last error */
	lastError: Error | null;
}

// ============================================
// Context
// ============================================

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface WebSocketProviderProps {
	children: React.ReactNode;
}

// Stable config objects (defined outside component to avoid recreation)
const RECONNECTION_CONFIG = {
	maxAttempts: config.websocket.maxReconnectAttempts,
	initialDelay: config.websocket.reconnectDelay,
	maxDelay: 30000,
};

const HEARTBEAT_CONFIG = {
	pingInterval: 30000,
	pongTimeout: 60000,
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
	const { isAuthenticated } = useAuth();
	const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

	// Handle incoming WebSocket messages
	const handleMessage = useCallback((data: unknown) => {
		const message = data as WSMessage;
		// Debug: Log options-related messages
		if (message.type?.startsWith("options")) {
		}
		// Track last message for consumers
		setLastMessage(message);
		// Route to TanStack Query invalidation handler
		handleWSMessage(message);
	}, []);

	// Initialize WebSocket connection
	const ws = useWebSocket({
		url: config.websocket.url,
		onMessage: handleMessage,
		autoConnect: false, // We'll connect manually after auth
		reconnection: RECONNECTION_CONFIG,
		heartbeat: HEARTBEAT_CONFIG,
	});

	// Destructure all values to avoid depending on unstable ws object reference
	const {
		connectionState,
		connected,
		reconnecting,
		send,
		sendMessage,
		subscribe,
		unsubscribe,
		subscribeSymbols,
		unsubscribeSymbols,
		subscribeOptions,
		unsubscribeOptions,
		subscribeBacktest,
		unsubscribeBacktest,
		connect,
		disconnect,
		lastError,
	} = ws;

	// Connect when authenticated
	useEffect(() => {
		if (isAuthenticated && connectionState === "disconnected") {
			connect();
		} else if (!isAuthenticated && connected) {
			disconnect();
		}
	}, [isAuthenticated, connectionState, connected, connect, disconnect]);

	// Subscribe to core channels when connected
	useEffect(() => {
		if (connected) {
			subscribe(["system", "portfolio"]);
		}
	}, [connected, subscribe]);

	const value = useMemo<WebSocketContextValue>(
		() => ({
			connectionState,
			connected,
			reconnecting,
			lastMessage,
			send,
			sendMessage,
			subscribe,
			unsubscribe,
			subscribeSymbols,
			unsubscribeSymbols,
			subscribeOptions,
			unsubscribeOptions,
			subscribeBacktest,
			unsubscribeBacktest,
			connect,
			disconnect,
			lastError,
		}),
		[
			connectionState,
			connected,
			reconnecting,
			lastMessage,
			send,
			sendMessage,
			subscribe,
			unsubscribe,
			subscribeSymbols,
			unsubscribeSymbols,
			subscribeOptions,
			unsubscribeOptions,
			subscribeBacktest,
			unsubscribeBacktest,
			connect,
			disconnect,
			lastError,
		]
	);

	return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

// ============================================
// Hook
// ============================================

/**
 * Use WebSocket context.
 *
 * @example
 * ```tsx
 * function ConnectionBadge() {
 *   const { connected, connectionState } = useWebSocketContext();
 *   return <div>{connected ? "Online" : connectionState}</div>;
 * }
 * ```
 */
export function useWebSocketContext(): WebSocketContextValue {
	const context = useContext(WebSocketContext);
	if (!context) {
		throw new Error("useWebSocketContext must be used within a WebSocketProvider");
	}
	return context;
}

export default WebSocketContext;
