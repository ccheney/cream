"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ConnectionState,
	calculateBackoffDelay,
	createWebSocketUrl,
	DEFAULT_HEARTBEAT,
	DEFAULT_RECONNECTION,
	type HeartbeatConfig,
	type ReconnectionConfig,
	type UseWebSocketOptions,
	type UseWebSocketReturn,
} from "./useWebSocket.config";

export type {
	ConnectionState,
	HeartbeatConfig,
	ReconnectionConfig,
	UseWebSocketOptions,
	UseWebSocketReturn,
};
export { calculateBackoffDelay, createWebSocketUrl };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This hook intentionally keeps lifecycle wiring in one scope.
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
	const {
		url,
		token,
		onMessage,
		onConnect,
		onDisconnect,
		onError,
		reconnection = {},
		heartbeat = {},
		autoConnect = true,
	} = options;

	// Memoize configs to prevent recreating connect/startHeartbeat on every render
	// Only depend on individual properties, NOT the object reference
	const reconnectMaxAttempts = reconnection?.maxAttempts ?? DEFAULT_RECONNECTION.maxAttempts;
	const reconnectInitialDelay = reconnection?.initialDelay ?? DEFAULT_RECONNECTION.initialDelay;
	const reconnectMaxDelay = reconnection?.maxDelay ?? DEFAULT_RECONNECTION.maxDelay;
	const reconnectBackoff =
		reconnection?.backoffMultiplier ?? DEFAULT_RECONNECTION.backoffMultiplier;

	const reconnectionConfig = useMemo<ReconnectionConfig>(
		() => ({
			maxAttempts: reconnectMaxAttempts,
			initialDelay: reconnectInitialDelay,
			maxDelay: reconnectMaxDelay,
			backoffMultiplier: reconnectBackoff,
		}),
		[reconnectMaxAttempts, reconnectInitialDelay, reconnectMaxDelay, reconnectBackoff],
	);

	const hbPingInterval = heartbeat?.pingInterval ?? DEFAULT_HEARTBEAT.pingInterval;
	const hbPongTimeout = heartbeat?.pongTimeout ?? DEFAULT_HEARTBEAT.pongTimeout;

	const heartbeatConfig = useMemo<HeartbeatConfig>(
		() => ({
			pingInterval: hbPingInterval,
			pongTimeout: hbPongTimeout,
		}),
		[hbPingInterval, hbPongTimeout],
	);

	// State
	const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
	const [reconnectAttempts, setReconnectAttempts] = useState(0);
	const [lastError, setLastError] = useState<Error | null>(null);
	const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

	// Subscription tracking state
	const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);
	const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([]);
	const [subscribedContracts, setSubscribedContracts] = useState<string[]>([]);

	// Refs
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const shouldReconnectRef = useRef(true);
	const isUnmountedRef = useRef(false);
	const reconnectAttemptsRef = useRef(0);

	// Subscription refs (for replay after reconnect)
	const subscribedChannelsRef = useRef<Set<string>>(new Set());
	const subscribedSymbolsRef = useRef<Set<string>>(new Set());
	const subscribedContractsRef = useRef<Set<string>>(new Set());

	// Callback refs
	const onMessageRef = useRef(onMessage);
	const onConnectRef = useRef(onConnect);
	const onDisconnectRef = useRef(onDisconnect);
	const onErrorRef = useRef(onError);

	// Update callback refs
	useEffect(() => {
		onMessageRef.current = onMessage;
		onConnectRef.current = onConnect;
		onDisconnectRef.current = onDisconnect;
		onErrorRef.current = onError;
	}, [onMessage, onConnect, onDisconnect, onError]);

	// Clear timers
	const clearTimers = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		if (pingIntervalRef.current) {
			clearInterval(pingIntervalRef.current);
			pingIntervalRef.current = null;
		}
		if (pongTimeoutRef.current) {
			clearTimeout(pongTimeoutRef.current);
			pongTimeoutRef.current = null;
		}
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
		setNextRetryIn(null);
	}, []);

	// Start heartbeat
	const startHeartbeat = useCallback(() => {
		if (pingIntervalRef.current) {
			return;
		}

		pingIntervalRef.current = setInterval(() => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({ type: "ping" }));

				// Set pong timeout
				pongTimeoutRef.current = setTimeout(() => {
					// Connection dead, force reconnect
					wsRef.current?.close();
				}, heartbeatConfig.pongTimeout);
			}
		}, heartbeatConfig.pingInterval);
	}, [heartbeatConfig.pingInterval, heartbeatConfig.pongTimeout]);

	// Handle pong
	const handlePong = useCallback(() => {
		if (pongTimeoutRef.current) {
			clearTimeout(pongTimeoutRef.current);
			pongTimeoutRef.current = null;
		}
	}, []);

	// Replay subscriptions after reconnect
	const replaySubscriptions = useCallback((ws: WebSocket) => {
		// Replay channel subscriptions
		const channels = Array.from(subscribedChannelsRef.current);
		if (channels.length > 0) {
			ws.send(JSON.stringify({ type: "subscribe", channels }));
		}

		// Replay symbol subscriptions
		const symbols = Array.from(subscribedSymbolsRef.current);
		if (symbols.length > 0) {
			ws.send(JSON.stringify({ type: "subscribe_symbols", symbols }));
		}

		// Replay options contract subscriptions
		const contracts = Array.from(subscribedContractsRef.current);
		if (contracts.length > 0) {
			ws.send(JSON.stringify({ type: "subscribe_options", contracts }));
		}
	}, []);

	// Connect
	// biome-ignore lint/complexity/noExcessiveLinesPerFunction: Connection lifecycle handler keeps related onopen/onclose/onerror/onmessage logic together.
	const connect = useCallback(() => {
		if (isUnmountedRef.current) {
			return;
		}
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			return;
		}
		if (wsRef.current?.readyState === WebSocket.CONNECTING) {
			return;
		}

		clearTimers();
		shouldReconnectRef.current = true;
		setConnectionState("connecting");

		const wsUrl = createWebSocketUrl(url, token);
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			if (isUnmountedRef.current) {
				ws.close();
				return;
			}
			setConnectionState("connected");
			reconnectAttemptsRef.current = 0;
			setReconnectAttempts(0);
			setLastError(null);
			setNextRetryIn(null);
			startHeartbeat();

			// Replay subscriptions after reconnect
			replaySubscriptions(ws);

			onConnectRef.current?.();
		};

		ws.onclose = () => {
			if (isUnmountedRef.current) {
				return;
			}
			clearTimers();
			setConnectionState("disconnected");
			onDisconnectRef.current?.();

			// Attempt reconnection
			if (
				shouldReconnectRef.current &&
				reconnectAttemptsRef.current < reconnectionConfig.maxAttempts
			) {
				setConnectionState("reconnecting");
				const currentAttempt = reconnectAttemptsRef.current;
				const delay = calculateBackoffDelay(currentAttempt, reconnectionConfig, true);
				const delaySeconds = Math.ceil(delay / 1000);
				reconnectAttemptsRef.current = currentAttempt + 1;
				setReconnectAttempts(reconnectAttemptsRef.current);

				// Start countdown
				setNextRetryIn(delaySeconds);
				countdownIntervalRef.current = setInterval(() => {
					setNextRetryIn((prev) => {
						if (prev === null || prev <= 1) {
							if (countdownIntervalRef.current) {
								clearInterval(countdownIntervalRef.current);
								countdownIntervalRef.current = null;
							}
							return null;
						}
						return prev - 1;
					});
				}, 1000);

				reconnectTimeoutRef.current = setTimeout(() => {
					connect();
				}, delay);
			}
		};

		ws.onerror = () => {
			if (isUnmountedRef.current) {
				return;
			}
			const error = new Error("WebSocket error");
			setLastError(error);
			onErrorRef.current?.(error);
		};

		ws.onmessage = (event) => {
			if (isUnmountedRef.current) {
				return;
			}

			try {
				const data = JSON.parse(event.data);

				// Handle pong
				if (data.type === "pong") {
					handlePong();
					return;
				}

				onMessageRef.current?.(data);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setLastError(error);
				onErrorRef.current?.(error);
			}
		};

		wsRef.current = ws;
	}, [
		url,
		token,
		reconnectionConfig,
		clearTimers,
		startHeartbeat,
		handlePong,
		replaySubscriptions,
	]);

	// Disconnect
	const disconnect = useCallback(() => {
		shouldReconnectRef.current = false;
		clearTimers();
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		setConnectionState("disconnected");
		setReconnectAttempts(0);
	}, [clearTimers]);

	// Send
	const send = useCallback((data: unknown): boolean => {
		if (wsRef.current?.readyState !== WebSocket.OPEN) {
			return false;
		}

		try {
			wsRef.current.send(JSON.stringify(data));
			return true;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setLastError(error);
			onErrorRef.current?.(error);
			return false;
		}
	}, []);

	// Send typed message
	const sendMessage = useCallback(
		(type: string, payload: unknown): boolean => {
			return send({ type, payload, timestamp: new Date().toISOString() });
		},
		[send],
	);

	// Subscribe to channels
	const subscribe = useCallback(
		(channels: string[]) => {
			// Track subscriptions for replay
			for (const channel of channels) {
				subscribedChannelsRef.current.add(channel);
			}
			setSubscribedChannels(Array.from(subscribedChannelsRef.current));
			// Send directly with correct schema format (not wrapped in payload)
			send({ type: "subscribe", channels });
		},
		[send],
	);

	// Unsubscribe from channels
	const unsubscribe = useCallback(
		(channels: string[]) => {
			// Remove from tracking
			for (const channel of channels) {
				subscribedChannelsRef.current.delete(channel);
			}
			setSubscribedChannels(Array.from(subscribedChannelsRef.current));
			send({ type: "unsubscribe", channels });
		},
		[send],
	);

	// Subscribe to symbols
	const subscribeSymbols = useCallback(
		(symbols: string[]) => {
			// Track subscriptions for replay
			for (const symbol of symbols) {
				subscribedSymbolsRef.current.add(symbol);
			}
			setSubscribedSymbols(Array.from(subscribedSymbolsRef.current));
			send({ type: "subscribe_symbols", symbols });
		},
		[send],
	);

	// Unsubscribe from symbols
	const unsubscribeSymbols = useCallback(
		(symbols: string[]) => {
			// Remove from tracking
			for (const symbol of symbols) {
				subscribedSymbolsRef.current.delete(symbol);
			}
			setSubscribedSymbols(Array.from(subscribedSymbolsRef.current));
			send({ type: "unsubscribe_symbols", symbols });
		},
		[send],
	);

	// Subscribe to options contracts
	const subscribeOptions = useCallback(
		(contracts: string[]) => {
			// Track subscriptions for replay
			for (const contract of contracts) {
				subscribedContractsRef.current.add(contract);
			}
			setSubscribedContracts(Array.from(subscribedContractsRef.current));
			send({ type: "subscribe_options", contracts });
		},
		[send],
	);

	// Unsubscribe from options contracts
	const unsubscribeOptions = useCallback(
		(contracts: string[]) => {
			// Remove from tracking
			for (const contract of contracts) {
				subscribedContractsRef.current.delete(contract);
			}
			setSubscribedContracts(Array.from(subscribedContractsRef.current));
			send({ type: "unsubscribe_options", contracts });
		},
		[send],
	);

	// Visibility change handler
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.hidden) {
				// Pause reconnection when hidden
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current);
					reconnectTimeoutRef.current = null;
				}
			} else {
				// Resume if disconnected
				if (connectionState === "reconnecting" && shouldReconnectRef.current) {
					connect();
				}
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [connectionState, connect]);

	// Auto-connect on mount
	useEffect(() => {
		isUnmountedRef.current = false;

		if (autoConnect) {
			connect();
		}

		return () => {
			isUnmountedRef.current = true;
			disconnect();
		};
	}, [autoConnect, connect, disconnect]); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		connectionState,
		connected: connectionState === "connected",
		reconnecting: connectionState === "reconnecting",
		reconnectAttempts,
		maxReconnectAttempts: reconnectionConfig.maxAttempts,
		nextRetryIn,
		send,
		sendMessage,
		subscribe,
		unsubscribe,
		subscribeSymbols,
		unsubscribeSymbols,
		subscribeOptions,
		unsubscribeOptions,
		connect,
		disconnect,
		lastError,
		subscribedChannels,
		subscribedSymbols,
		subscribedContracts,
	};
}

export default useWebSocket;
