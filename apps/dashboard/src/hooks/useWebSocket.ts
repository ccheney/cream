/**
 * WebSocket Hook
 *
 * React hook for WebSocket connection with reconnection, heartbeat, and typed messages.
 *
 * @see docs/plans/ui/06-websocket.md lines 7-28
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

/**
 * WebSocket connection state.
 */
export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

/**
 * Reconnection configuration.
 */
export interface ReconnectionConfig {
  /** Maximum reconnection attempts (default: 10) */
  maxAttempts: number;
  /** Initial delay in ms (default: 1000) */
  initialDelay: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay: number;
  /** Backoff multiplier (default: 1.5) */
  backoffMultiplier: number;
}

/**
 * Heartbeat configuration.
 */
export interface HeartbeatConfig {
  /** Ping interval in ms (default: 30000) */
  pingInterval: number;
  /** Pong timeout in ms (default: 60000) */
  pongTimeout: number;
}

/**
 * WebSocket hook options.
 */
export interface UseWebSocketOptions {
  /** WebSocket URL */
  url: string;

  /** Authentication token */
  token?: string;

  /** Message handler */
  onMessage?: (data: unknown) => void;

  /** Connection handler */
  onConnect?: () => void;

  /** Disconnection handler */
  onDisconnect?: () => void;

  /** Error handler */
  onError?: (error: Error) => void;

  /** Reconnection configuration */
  reconnection?: Partial<ReconnectionConfig>;

  /** Heartbeat configuration */
  heartbeat?: Partial<HeartbeatConfig>;

  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * WebSocket hook return type.
 */
export interface UseWebSocketReturn {
  /** Current connection state */
  connectionState: ConnectionState;

  /** Whether connected */
  connected: boolean;

  /** Whether reconnecting */
  reconnecting: boolean;

  /** Current reconnection attempt */
  reconnectAttempts: number;

  /** Send a message */
  send: (data: unknown) => boolean;

  /** Send a typed message */
  sendMessage: (type: string, payload: unknown) => boolean;

  /** Subscribe to channels */
  subscribe: (channels: string[]) => void;

  /** Unsubscribe from channels */
  unsubscribe: (channels: string[]) => void;

  /** Subscribe to symbols */
  subscribeSymbols: (symbols: string[]) => void;

  /** Connect manually */
  connect: () => void;

  /** Disconnect manually */
  disconnect: () => void;

  /** Last error */
  lastError: Error | null;
}

// ============================================
// Constants
// ============================================

const DEFAULT_RECONNECTION: ReconnectionConfig = {
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 1.5,
};

const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  pingInterval: 30000,
  pongTimeout: 60000,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate reconnection delay with exponential backoff.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: ReconnectionConfig
): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * Create WebSocket URL with token.
 */
export function createWebSocketUrl(baseUrl: string, token?: string): string {
  if (!token) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * WebSocket hook with reconnection and heartbeat.
 */
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

  const reconnectionConfig: ReconnectionConfig = {
    ...DEFAULT_RECONNECTION,
    ...reconnection,
  };

  const heartbeatConfig: HeartbeatConfig = {
    ...DEFAULT_HEARTBEAT,
    ...heartbeat,
  };

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const isUnmountedRef = useRef(false);

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
  }, []);

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) return;

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

  // Connect
  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

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
      setReconnectAttempts(0);
      setLastError(null);
      startHeartbeat();
      onConnectRef.current?.();
    };

    ws.onclose = () => {
      if (isUnmountedRef.current) return;
      clearTimers();
      setConnectionState("disconnected");
      onDisconnectRef.current?.();

      // Attempt reconnection
      if (shouldReconnectRef.current && reconnectAttempts < reconnectionConfig.maxAttempts) {
        setConnectionState("reconnecting");
        const delay = calculateBackoffDelay(reconnectAttempts, reconnectionConfig);
        setReconnectAttempts((prev) => prev + 1);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (event) => {
      if (isUnmountedRef.current) return;
      const error = new Error("WebSocket error");
      setLastError(error);
      onErrorRef.current?.(error);
    };

    ws.onmessage = (event) => {
      if (isUnmountedRef.current) return;

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
  }, [url, token, reconnectAttempts, reconnectionConfig, clearTimers, startHeartbeat, handlePong]);

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
    [send]
  );

  // Subscribe to channels
  const subscribe = useCallback(
    (channels: string[]) => {
      sendMessage("subscribe", { channels });
    },
    [sendMessage]
  );

  // Unsubscribe from channels
  const unsubscribe = useCallback(
    (channels: string[]) => {
      sendMessage("unsubscribe", { channels });
    },
    [sendMessage]
  );

  // Subscribe to symbols
  const subscribeSymbols = useCallback(
    (symbols: string[]) => {
      sendMessage("subscribe_symbols", { symbols });
    },
    [sendMessage]
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
        if (
          connectionState === "reconnecting" &&
          shouldReconnectRef.current
        ) {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionState,
    connected: connectionState === "connected",
    reconnecting: connectionState === "reconnecting",
    reconnectAttempts,
    send,
    sendMessage,
    subscribe,
    unsubscribe,
    subscribeSymbols,
    connect,
    disconnect,
    lastError,
  };
}

export default useWebSocket;
