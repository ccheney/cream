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
  /** Alias for connected (for backwards compatibility) */
  isConnected: boolean;
  /** Whether reconnecting */
  reconnecting: boolean;
  /** Last received message */
  lastMessage: WSMessage | null;
  /** Send a typed message */
  sendMessage: (type: string, payload: unknown) => boolean;
  /** Subscribe to channels */
  subscribe: (channels: string[]) => void;
  /** Unsubscribe from channels */
  unsubscribe: (channels: string[]) => void;
  /** Subscribe to symbols for real-time quotes */
  subscribeSymbols: (symbols: string[]) => void;
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

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isAuthenticated } = useAuth();
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data: unknown) => {
    const message = data as WSMessage;
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
    reconnection: {
      maxAttempts: config.websocket.maxReconnectAttempts,
      initialDelay: config.websocket.reconnectDelay,
      maxDelay: 30000,
    },
    heartbeat: {
      pingInterval: 30000,
      pongTimeout: 60000,
    },
  });

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && ws.connectionState === "disconnected") {
      ws.connect();
    } else if (!isAuthenticated && ws.connected) {
      ws.disconnect();
    }
  }, [isAuthenticated, ws]);

  const value = useMemo<WebSocketContextValue>(
    () => ({
      connectionState: ws.connectionState,
      connected: ws.connected,
      isConnected: ws.connected,
      reconnecting: ws.reconnecting,
      lastMessage,
      sendMessage: ws.sendMessage,
      subscribe: ws.subscribe,
      unsubscribe: ws.unsubscribe,
      subscribeSymbols: ws.subscribeSymbols,
      connect: ws.connect,
      disconnect: ws.disconnect,
      lastError: ws.lastError,
    }),
    [ws, lastMessage]
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
