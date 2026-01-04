/**
 * WebSocket Server Handler
 *
 * Hono-based WebSocket handler with authentication, connection management,
 * channel subscription logic, and message routing.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import type { ServerWebSocket } from "bun";
import {
  Channel,
  CHANNELS,
  ClientMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type SubscribeSymbolsMessage,
  type UnsubscribeSymbolsMessage,
  type PingMessage,
} from "../../../../packages/domain/src/websocket/index.js";

// ============================================
// Types
// ============================================

/**
 * Connection metadata.
 */
export interface ConnectionMetadata {
  /** Unique connection ID */
  connectionId: string;

  /** User ID from auth token */
  userId: string;

  /** Connection timestamp */
  connectedAt: Date;

  /** Last activity timestamp */
  lastPing: Date;

  /** Subscribed channels */
  channels: Set<Channel>;

  /** Subscribed symbols (for quote channel) */
  symbols: Set<string>;
}

/**
 * WebSocket with metadata.
 */
export type WebSocketWithMetadata = ServerWebSocket<ConnectionMetadata>;

/**
 * Auth token validation result.
 */
export interface AuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

// ============================================
// Connection State Management
// ============================================

/**
 * Active connections.
 */
const connections = new Map<string, WebSocketWithMetadata>();

/**
 * Heartbeat interval (30 seconds).
 */
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Stale connection timeout (60 seconds).
 */
const STALE_CONNECTION_TIMEOUT_MS = 60000;

/**
 * Generate unique connection ID.
 */
function generateConnectionId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get connection count.
 */
export function getConnectionCount(): number {
  return connections.size;
}

/**
 * Get all connection IDs.
 */
export function getConnectionIds(): string[] {
  return Array.from(connections.keys());
}

/**
 * Get connection by ID.
 */
export function getConnection(connectionId: string): WebSocketWithMetadata | undefined {
  return connections.get(connectionId);
}

// ============================================
// Authentication
// ============================================

/**
 * Validate authentication token.
 * In production, this would verify JWT or session token.
 */
export function validateAuthToken(token: string | null): AuthResult {
  if (!token) {
    return { valid: false, error: "Missing authentication token" };
  }

  // Remove "Bearer " prefix if present
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

  // Simple validation for now
  // In production, verify JWT signature, expiration, etc.
  if (cleanToken.length < 10) {
    return { valid: false, error: "Invalid token format" };
  }

  // Mock user ID extraction
  // In production, decode JWT claims
  const userId = `user-${cleanToken.slice(0, 8)}`;

  return { valid: true, userId };
}

// ============================================
// Message Handlers
// ============================================

/**
 * Handle subscribe message.
 */
function handleSubscribe(
  ws: WebSocketWithMetadata,
  message: SubscribeMessage
): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    if (CHANNELS.includes(channelName as Channel)) {
      metadata.channels.add(channelName as Channel);
    } else {
      sendError(ws, `Invalid channel: ${channelName}`);
    }
  }

  // Send confirmation
  sendMessage(ws, {
    type: "subscribed",
    channels: Array.from(metadata.channels),
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[WS] ${metadata.connectionId} subscribed to: ${Array.from(metadata.channels).join(", ")}`
  );
}

/**
 * Handle unsubscribe message.
 */
function handleUnsubscribe(
  ws: WebSocketWithMetadata,
  message: UnsubscribeMessage
): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    metadata.channels.delete(channelName as Channel);
  }

  // Send confirmation
  sendMessage(ws, {
    type: "unsubscribed",
    channels: message.channels,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[WS] ${metadata.connectionId} unsubscribed from: ${message.channels.join(", ")}`
  );
}

/**
 * Handle subscribe symbols message.
 */
function handleSubscribeSymbols(
  ws: WebSocketWithMetadata,
  message: SubscribeSymbolsMessage
): void {
  const metadata = ws.data;

  for (const symbol of message.symbols) {
    metadata.symbols.add(symbol.toUpperCase());
  }

  // Auto-subscribe to quotes channel
  metadata.channels.add("quotes");

  sendMessage(ws, {
    type: "subscribed",
    channels: ["quotes"],
    symbols: Array.from(metadata.symbols),
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[WS] ${metadata.connectionId} subscribed to symbols: ${Array.from(metadata.symbols).join(", ")}`
  );
}

/**
 * Handle unsubscribe symbols message.
 */
function handleUnsubscribeSymbols(
  ws: WebSocketWithMetadata,
  message: UnsubscribeSymbolsMessage
): void {
  const metadata = ws.data;

  for (const symbol of message.symbols) {
    metadata.symbols.delete(symbol.toUpperCase());
  }

  sendMessage(ws, {
    type: "unsubscribed",
    channels: [],
    symbols: message.symbols,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[WS] ${metadata.connectionId} unsubscribed from symbols: ${message.symbols.join(", ")}`
  );
}

/**
 * Handle ping message.
 */
function handlePing(ws: WebSocketWithMetadata, _message: PingMessage): void {
  const metadata = ws.data;
  metadata.lastPing = new Date();

  sendMessage(ws, {
    type: "pong",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Route incoming message to appropriate handler.
 */
export function handleMessage(
  ws: WebSocketWithMetadata,
  rawMessage: string
): void {
  let message: ClientMessage;

  try {
    const parsed = JSON.parse(rawMessage);
    const result = ClientMessageSchema.safeParse(parsed);

    if (!result.success) {
      sendError(ws, `Invalid message format: ${result.error.message}`);
      return;
    }

    message = result.data;
  } catch (error) {
    sendError(ws, "Invalid JSON format");
    return;
  }

  // Update last activity
  ws.data.lastPing = new Date();

  // Route to handler
  switch (message.type) {
    case "subscribe":
      handleSubscribe(ws, message);
      break;
    case "unsubscribe":
      handleUnsubscribe(ws, message);
      break;
    case "subscribe_symbols":
      handleSubscribeSymbols(ws, message);
      break;
    case "unsubscribe_symbols":
      handleUnsubscribeSymbols(ws, message);
      break;
    case "ping":
      handlePing(ws, message);
      break;
    case "request_state":
      // TODO: Implement state request
      sendError(ws, "request_state not yet implemented");
      break;
    case "acknowledge_alert":
      // TODO: Implement alert acknowledgment
      sendError(ws, "acknowledge_alert not yet implemented");
      break;
    default:
      sendError(ws, `Unknown message type: ${(message as ClientMessage).type}`);
  }
}

// ============================================
// Message Sending
// ============================================

/**
 * Send message to a single connection.
 */
export function sendMessage(ws: WebSocketWithMetadata, message: ServerMessage | Record<string, unknown>): boolean {
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error(`[WS] Failed to send message to ${ws.data.connectionId}:`, error);
    return false;
  }
}

/**
 * Send error message to connection.
 */
export function sendError(ws: WebSocketWithMetadata, message: string): void {
  sendMessage(ws, {
    type: "error",
    message,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Broadcasting
// ============================================

/**
 * Broadcast message to all connections subscribed to a channel.
 */
export function broadcast(channel: Channel, message: ServerMessage): number {
  let sent = 0;
  const deadConnections: string[] = [];

  for (const [connectionId, ws] of connections) {
    if (ws.data.channels.has(channel)) {
      if (sendMessage(ws, message)) {
        sent++;
      } else {
        deadConnections.push(connectionId);
      }
    }
  }

  // Clean up dead connections
  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast quote message to connections subscribed to a specific symbol.
 */
export function broadcastQuote(
  symbol: string,
  message: ServerMessage
): number {
  let sent = 0;
  const deadConnections: string[] = [];
  const upperSymbol = symbol.toUpperCase();

  for (const [connectionId, ws] of connections) {
    if (ws.data.channels.has("quotes") && ws.data.symbols.has(upperSymbol)) {
      if (sendMessage(ws, message)) {
        sent++;
      } else {
        deadConnections.push(connectionId);
      }
    }
  }

  // Clean up dead connections
  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast to all connections.
 */
export function broadcastAll(message: ServerMessage): number {
  let sent = 0;
  const deadConnections: string[] = [];

  for (const [connectionId, ws] of connections) {
    if (sendMessage(ws, message)) {
      sent++;
    } else {
      deadConnections.push(connectionId);
    }
  }

  // Clean up dead connections
  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

// ============================================
// Connection Lifecycle
// ============================================

/**
 * Handle new WebSocket connection.
 */
export function handleOpen(ws: WebSocketWithMetadata): void {
  const metadata = ws.data;
  connections.set(metadata.connectionId, ws);

  console.log(
    `[WS] Connection opened: ${metadata.connectionId} (user: ${metadata.userId})`
  );

  // Send welcome message
  sendMessage(ws, {
    type: "system_status",
    data: {
      status: "healthy",
      version: "0.1.0",
      uptime: process.uptime(),
      connections: connections.size,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Handle WebSocket close.
 */
export function handleClose(ws: WebSocketWithMetadata, code: number, reason: string): void {
  const metadata = ws.data;
  removeConnection(metadata.connectionId);

  console.log(
    `[WS] Connection closed: ${metadata.connectionId} (code: ${code}, reason: ${reason || "none"})`
  );
}

/**
 * Handle WebSocket error.
 */
export function handleError(ws: WebSocketWithMetadata, error: Error): void {
  const metadata = ws.data;
  console.error(`[WS] Connection error: ${metadata.connectionId}`, error);
  removeConnection(metadata.connectionId);
}

/**
 * Remove connection from tracking.
 */
function removeConnection(connectionId: string): void {
  connections.delete(connectionId);
}

// ============================================
// Heartbeat / Stale Connection Cleanup
// ============================================

/**
 * Server-initiated ping to all connections.
 */
export function pingAllConnections(): void {
  const now = new Date();

  for (const [connectionId, ws] of connections) {
    try {
      ws.send(JSON.stringify({ type: "ping", timestamp: now.toISOString() }));
    } catch (error) {
      console.error(`[WS] Failed to ping ${connectionId}:`, error);
      removeConnection(connectionId);
    }
  }
}

/**
 * Close stale connections.
 */
export function closeStaleConnections(): number {
  const now = Date.now();
  let closed = 0;

  for (const [connectionId, ws] of connections) {
    const lastPing = ws.data.lastPing.getTime();
    if (now - lastPing > STALE_CONNECTION_TIMEOUT_MS) {
      console.log(`[WS] Closing stale connection: ${connectionId}`);
      try {
        ws.close(1000, "Connection timed out");
      } catch {
        // Already closed
      }
      removeConnection(connectionId);
      closed++;
    }
  }

  return closed;
}

/**
 * Start heartbeat interval.
 */
let heartbeatInterval: Timer | null = null;

export function startHeartbeat(): void {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(() => {
    closeStaleConnections();
    pingAllConnections();
  }, HEARTBEAT_INTERVAL_MS);

  console.log("[WS] Heartbeat started");
}

/**
 * Stop heartbeat interval.
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log("[WS] Heartbeat stopped");
  }
}

// ============================================
// Graceful Shutdown
// ============================================

/**
 * Close all connections gracefully.
 */
export function closeAllConnections(reason: string = "Server shutting down"): void {
  console.log(`[WS] Closing all connections: ${reason}`);

  for (const [connectionId, ws] of connections) {
    try {
      ws.close(1001, reason);
    } catch {
      // Already closed
    }
  }

  connections.clear();
  stopHeartbeat();
}

// ============================================
// WebSocket Upgrade Handler
// ============================================

/**
 * Create metadata for new connection.
 */
export function createConnectionMetadata(
  userId: string
): ConnectionMetadata {
  return {
    connectionId: generateConnectionId(),
    userId,
    connectedAt: new Date(),
    lastPing: new Date(),
    channels: new Set(),
    symbols: new Set(),
  };
}

/**
 * Bun WebSocket handler configuration.
 */
export const websocketHandler = {
  open(ws: WebSocketWithMetadata) {
    handleOpen(ws);
  },
  message(ws: WebSocketWithMetadata, message: string | Buffer) {
    const rawMessage = typeof message === "string" ? message : message.toString();
    handleMessage(ws, rawMessage);
  },
  close(ws: WebSocketWithMetadata, code: number, reason: string) {
    handleClose(ws, code, reason);
  },
  error(ws: WebSocketWithMetadata, error: Error) {
    handleError(ws, error);
  },
};

export default {
  websocketHandler,
  handleMessage,
  handleOpen,
  handleClose,
  handleError,
  broadcast,
  broadcastQuote,
  broadcastAll,
  sendMessage,
  sendError,
  validateAuthToken,
  createConnectionMetadata,
  getConnectionCount,
  getConnectionIds,
  getConnection,
  startHeartbeat,
  stopHeartbeat,
  closeStaleConnections,
  closeAllConnections,
  pingAllConnections,
};
