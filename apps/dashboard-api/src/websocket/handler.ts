/**
 * WebSocket Server Handler
 *
 * Hono-based WebSocket handler with authentication, connection management,
 * channel subscription logic, and message routing.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { requireEnv } from "@cream/domain";
import type { ServerWebSocket } from "bun";
import {
  type AcknowledgeAlertMessage,
  CHANNELS,
  type Channel,
  type ClientMessage,
  ClientMessageSchema,
  type PingMessage,
  type RequestStateMessage,
  type ServerMessage,
  type SubscribeBacktestMessage,
  type SubscribeMessage,
  type SubscribeOptionsMessage,
  type SubscribeSymbolsMessage,
  type UnsubscribeBacktestMessage,
  type UnsubscribeMessage,
  type UnsubscribeOptionsMessage,
  type UnsubscribeSymbolsMessage,
} from "../../../../packages/domain/src/websocket/index.js";
import log from "../logger.js";
import {
  getCachedQuote,
  subscribeSymbols as subscribeToStreaming,
} from "../streaming/market-data.js";
import {
  getCachedOptionsQuote,
  subscribeContracts as subscribeToOptionsStreaming,
} from "../streaming/options-data.js";
import {
  broadcastToBacktest,
  cleanupBacktestSubscriptions,
  subscribeToBacktest,
  unsubscribeFromBacktest,
} from "./backtest-channel.js";

// Re-export backtest channel functions for convenience
export { broadcastToBacktest } from "./backtest-channel.js";

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

  /** Subscribed options contracts (for options channel) */
  contracts: Set<string>;
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
 * Validate authentication using better-auth session cookies.
 */
export async function validateAuthTokenAsync(headers: Headers): Promise<AuthResult> {
  try {
    // Dynamically import to avoid circular dependencies
    const { auth } = await import("../auth/better-auth.js");

    const session = await auth.api.getSession({
      headers,
    });

    if (!session || !session.user) {
      return { valid: false, error: "No valid session found" };
    }

    return { valid: true, userId: session.user.id };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Session validation failed",
    };
  }
}

// ============================================
// Message Handlers
// ============================================

/**
 * Handle subscribe message.
 */
function handleSubscribe(ws: WebSocketWithMetadata, message: SubscribeMessage): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    if (CHANNELS.includes(channelName as Channel)) {
      metadata.channels.add(channelName as Channel);
    } else {
      sendError(ws, `Invalid channel: ${channelName}`);
    }
  }

  sendMessage(ws, {
    type: "subscribed",
    channels: Array.from(metadata.channels),
  });
}

/**
 * Handle unsubscribe message.
 */
function handleUnsubscribe(ws: WebSocketWithMetadata, message: UnsubscribeMessage): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    metadata.channels.delete(channelName as Channel);
  }

  sendMessage(ws, {
    type: "unsubscribed",
    channels: message.channels,
  });
}

/**
 * Handle subscribe symbols message.
 * Subscribes to the Massive WebSocket for real-time market data.
 */
function handleSubscribeSymbols(ws: WebSocketWithMetadata, message: SubscribeSymbolsMessage): void {
  const metadata = ws.data;
  const newSymbols: string[] = [];

  for (const symbol of message.symbols) {
    const upperSymbol = symbol.toUpperCase();
    if (!metadata.symbols.has(upperSymbol)) {
      metadata.symbols.add(upperSymbol);
      newSymbols.push(upperSymbol);
    }
  }

  metadata.channels.add("quotes");

  if (newSymbols.length > 0) {
    subscribeToStreaming(newSymbols).catch((_error) => {
      // Streaming is an optional enhancement; failures are non-critical
    });

    for (const symbol of newSymbols) {
      const cached = getCachedQuote(symbol);
      if (cached) {
        sendMessage(ws, {
          type: "quote",
          data: {
            symbol,
            bid: cached.bid,
            ask: cached.ask,
            last: cached.last,
            volume: cached.volume,
            timestamp: cached.timestamp.toISOString(),
          },
        });
      }
    }
  }

  sendMessage(ws, {
    type: "subscribed",
    channels: ["quotes"],
  });
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
  });
}

/**
 * Handle subscribe options contracts message.
 * Subscribes to the Massive WebSocket for real-time options data.
 */
function handleSubscribeOptions(ws: WebSocketWithMetadata, message: SubscribeOptionsMessage): void {
  const metadata = ws.data;
  const newContracts: string[] = [];

  for (const contract of message.contracts) {
    const upperContract = contract.toUpperCase();
    if (!metadata.contracts.has(upperContract)) {
      metadata.contracts.add(upperContract);
      newContracts.push(upperContract);
    }
  }

  metadata.channels.add("options");

  if (newContracts.length > 0) {
    subscribeToOptionsStreaming(newContracts).catch((_error) => {
      // Streaming is an optional enhancement; failures are non-critical
    });

    for (const contract of newContracts) {
      const cached = getCachedOptionsQuote(contract);
      if (cached) {
        sendMessage(ws, {
          type: "options_quote",
          data: {
            contract,
            underlying: cached.underlying,
            bid: cached.bid,
            ask: cached.ask,
            last: cached.last,
            volume: cached.volume,
            openInterest: cached.openInterest,
            timestamp: cached.timestamp.toISOString(),
          },
        });
      }
    }
  }

  sendMessage(ws, {
    type: "subscribed",
    channels: ["options"],
  });
}

/**
 * Handle unsubscribe options contracts message.
 */
function handleUnsubscribeOptions(
  ws: WebSocketWithMetadata,
  message: UnsubscribeOptionsMessage
): void {
  const metadata = ws.data;

  for (const contract of message.contracts) {
    metadata.contracts.delete(contract.toUpperCase());
  }

  sendMessage(ws, {
    type: "unsubscribed",
    channels: [],
  });
}

/**
 * Handle subscribe backtest message.
 * Subscribes the connection to receive progress updates for a specific backtest.
 */
function handleSubscribeBacktest(
  ws: WebSocketWithMetadata,
  message: SubscribeBacktestMessage
): void {
  const metadata = ws.data;

  subscribeToBacktest(ws, message.backtestId);
  metadata.channels.add("backtests");

  sendMessage(ws, {
    type: "subscribed",
    channels: ["backtests"],
  });
}

/**
 * Handle unsubscribe backtest message.
 */
function handleUnsubscribeBacktest(
  ws: WebSocketWithMetadata,
  message: UnsubscribeBacktestMessage
): void {
  unsubscribeFromBacktest(ws, message.backtestId);

  sendMessage(ws, {
    type: "unsubscribed",
    channels: [],
  });
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
 * Handle request state message.
 * Sends current state snapshot for the requested channel.
 */
async function handleRequestState(
  ws: WebSocketWithMetadata,
  message: RequestStateMessage
): Promise<void> {
  const { channel } = message;

  try {
    switch (channel) {
      case "system": {
        // Return current system status
        sendMessage(ws, {
          type: "system_status",
          data: {
            health: "healthy",
            uptimeSeconds: Math.floor(process.uptime()),
            activeConnections: connections.size,
            services: {},
            environment: requireEnv(),
            timestamp: new Date().toISOString(),
          },
        });
        break;
      }
      case "portfolio": {
        // Import db functions dynamically to avoid circular deps
        const { getPositionsRepo } = await import("../db.js");
        const positionsRepo = await getPositionsRepo();
        const environment = requireEnv();
        const positionsResult = await positionsRepo.findMany({
          environment,
          status: "open",
        });

        // Calculate portfolio summary
        const positions = positionsResult.data.map((p) => ({
          symbol: p.symbol,
          quantity: p.quantity,
          marketValue: p.marketValue ?? p.quantity * (p.avgEntryPrice ?? 0),
          unrealizedPnl: p.unrealizedPnl ?? 0,
          unrealizedPnlPercent: p.unrealizedPnlPct ?? 0,
          costBasis: p.avgEntryPrice ?? 0,
        }));

        const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

        sendMessage(ws, {
          type: "portfolio",
          data: {
            totalValue,
            cash: 0, // Would come from broker account
            buyingPower: 0,
            dailyPnl: 0,
            dailyPnlPercent: 0,
            openPositions: positions.length,
            positions,
            timestamp: new Date().toISOString(),
          },
        });
        break;
      }
      case "alerts": {
        const { getAlertsRepo } = await import("../db.js");
        const alertsRepo = await getAlertsRepo();
        const environment = requireEnv();
        const alerts = await alertsRepo.findUnacknowledged(environment, 50);

        for (const alert of alerts) {
          sendMessage(ws, {
            type: "alert",
            data: {
              id: alert.id,
              severity: alert.severity,
              title: alert.title,
              message: alert.message,
              category: alert.type as
                | "order"
                | "position"
                | "risk"
                | "system"
                | "agent"
                | "market"
                | undefined,
              acknowledged: alert.acknowledged,
              timestamp: alert.createdAt,
            },
          });
        }
        break;
      }
      case "orders": {
        const { getOrdersRepo } = await import("../db.js");
        const ordersRepo = await getOrdersRepo();
        const environment = requireEnv();
        const ordersResult = await ordersRepo.findMany({
          environment,
          status: "pending",
        });

        for (const order of ordersResult.data) {
          // Map storage types to WebSocket protocol types
          const sideMap: Record<string, "buy" | "sell"> = { BUY: "buy", SELL: "sell" };
          const orderTypeMap: Record<string, "market" | "limit" | "stop" | "stop_limit"> = {
            MARKET: "market",
            LIMIT: "limit",
            STOP: "stop",
            STOP_LIMIT: "stop_limit",
          };
          const statusMap: Record<
            string,
            | "pending"
            | "submitted"
            | "partial_fill"
            | "filled"
            | "cancelled"
            | "rejected"
            | "expired"
          > = {
            pending: "pending",
            submitted: "submitted",
            accepted: "submitted", // Map accepted to submitted for WebSocket
            partially_filled: "partial_fill",
            filled: "filled",
            cancelled: "cancelled",
            rejected: "rejected",
            expired: "expired",
          };

          sendMessage(ws, {
            type: "order",
            data: {
              id: order.id,
              symbol: order.symbol,
              side: sideMap[order.side] ?? "buy",
              orderType: orderTypeMap[order.orderType] ?? "market",
              status: statusMap[order.status] ?? "pending",
              quantity: order.quantity,
              filledQty: order.filledQuantity ?? 0,
              limitPrice: order.limitPrice ?? undefined,
              stopPrice: order.stopPrice ?? undefined,
              avgPrice: order.avgFillPrice ?? undefined,
              timestamp: order.createdAt,
            },
          });
        }
        break;
      }
      case "quotes": {
        const metadata = ws.data;
        for (const symbol of metadata.symbols) {
          const cached = getCachedQuote(symbol);
          if (cached) {
            sendMessage(ws, {
              type: "quote",
              data: {
                symbol,
                bid: cached.bid,
                ask: cached.ask,
                last: cached.last,
                volume: cached.volume,
                timestamp: cached.timestamp.toISOString(),
              },
            });
          }
        }
        break;
      }
      case "agents": {
        const { getAgentOutputsRepo } = await import("../db.js");
        const repo = await getAgentOutputsRepo();
        const now = new Date().toISOString();
        const today = now.slice(0, 10);

        const agentDefs = [
          { type: "technical", displayName: "Technical Analyst" },
          { type: "news", displayName: "News & Sentiment" },
          { type: "fundamentals", displayName: "Fundamentals & Macro" },
          { type: "bullish", displayName: "Bullish Research" },
          { type: "bearish", displayName: "Bearish Research" },
          { type: "trader", displayName: "Trader" },
          { type: "risk", displayName: "Risk Manager" },
          { type: "critic", displayName: "Critic" },
        ] as const;

        for (const def of agentDefs) {
          const outputs = await repo.findByAgentType(def.type, 100);
          const todayOutputs = outputs.filter((o) => o.createdAt.startsWith(today));
          const approves = outputs.filter((o) => o.vote === "APPROVE").length;
          const approvalRate = outputs.length > 0 ? approves / outputs.length : 0;
          const avgConfidence =
            outputs.length > 0
              ? outputs.reduce((sum, o) => sum + o.confidence, 0) / outputs.length
              : 0;
          const lastOutput = outputs[0];

          sendMessage(ws, {
            type: "agent_status",
            data: {
              type: def.type,
              displayName: def.displayName,
              status: "idle",
              lastOutputAt: lastOutput?.createdAt ?? null,
              outputsToday: todayOutputs.length,
              avgConfidence: Math.round(avgConfidence * 100) / 100,
              approvalRate: Math.round(approvalRate * 100) / 100,
              timestamp: now,
            },
          });
        }
        break;
      }
      default:
        // For channels without state, just confirm the request
        sendMessage(ws, {
          type: "subscribed",
          channels: [channel],
        });
    }
  } catch (error) {
    sendError(
      ws,
      `Failed to get state for channel ${channel}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Handle acknowledge alert message.
 * Marks an alert as acknowledged in the database.
 */
async function handleAcknowledgeAlert(
  ws: WebSocketWithMetadata,
  message: AcknowledgeAlertMessage
): Promise<void> {
  const { alertId } = message;
  const userId = ws.data.userId;

  try {
    const { getAlertsRepo } = await import("../db.js");
    const alertsRepo = await getAlertsRepo();

    const alert = await alertsRepo.acknowledge(alertId, userId);

    broadcast("alerts", {
      type: "alert",
      data: {
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        category: alert.type as
          | "order"
          | "position"
          | "risk"
          | "system"
          | "agent"
          | "market"
          | undefined,
        acknowledged: true,
        timestamp: alert.createdAt,
      },
    });

    sendMessage(ws, {
      type: "subscribed",
      channels: ["alerts"],
    });
  } catch (error) {
    sendError(
      ws,
      `Failed to acknowledge alert ${alertId}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Route incoming message to appropriate handler.
 */
export function handleMessage(ws: WebSocketWithMetadata, rawMessage: string): void {
  let message: ClientMessage;

  try {
    const parsed = JSON.parse(rawMessage);
    const result = ClientMessageSchema.safeParse(parsed);

    if (!result.success) {
      sendError(ws, `Invalid message format: ${result.error.message}`);
      return;
    }

    message = result.data;
  } catch (_error) {
    sendError(ws, "Invalid JSON format");
    return;
  }

  ws.data.lastPing = new Date();

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
    case "subscribe_options":
      handleSubscribeOptions(ws, message);
      break;
    case "unsubscribe_options":
      handleUnsubscribeOptions(ws, message);
      break;
    case "subscribe_backtest":
      handleSubscribeBacktest(ws, message);
      break;
    case "unsubscribe_backtest":
      handleUnsubscribeBacktest(ws, message);
      break;
    case "ping":
      handlePing(ws, message);
      break;
    case "request_state":
      handleRequestState(ws, message);
      break;
    case "acknowledge_alert":
      handleAcknowledgeAlert(ws, message);
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
export function sendMessage(
  ws: WebSocketWithMetadata,
  message: ServerMessage | Record<string, unknown>
): boolean {
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Send error message to connection.
 */
export function sendError(ws: WebSocketWithMetadata, message: string): void {
  sendMessage(ws, {
    type: "error",
    code: "ERROR",
    message,
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

  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast quote message to connections subscribed to a specific symbol.
 */
export function broadcastQuote(symbol: string, message: ServerMessage): number {
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

  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast options quote message to connections subscribed to a specific contract.
 */
export function broadcastOptionsQuote(contract: string, message: ServerMessage): number {
  let sent = 0;
  const deadConnections: string[] = [];
  const upperContract = contract.toUpperCase();

  for (const [connectionId, ws] of connections) {
    if (ws.data.channels.has("options") && ws.data.contracts.has(upperContract)) {
      if (sendMessage(ws, message)) {
        sent++;
      } else {
        deadConnections.push(connectionId);
      }
    }
  }

  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast trade message to connections subscribed to trades for a specific symbol.
 */
export function broadcastTrade(symbol: string, message: ServerMessage): number {
  let sent = 0;
  const deadConnections: string[] = [];
  const upperSymbol = symbol.toUpperCase();

  for (const [connectionId, ws] of connections) {
    if (ws.data.channels.has("trades") && ws.data.symbols.has(upperSymbol)) {
      if (sendMessage(ws, message)) {
        sent++;
      } else {
        deadConnections.push(connectionId);
      }
    }
  }

  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast aggregate message to connections subscribed to quotes for a specific symbol.
 * Reuses 'quotes' channel because chart subscribers use the same symbol subscription logic.
 */
export function broadcastAggregate(symbol: string, message: ServerMessage): number {
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

  for (const connectionId of deadConnections) {
    removeConnection(connectionId);
  }

  return sent;
}

/**
 * Broadcast cycle progress message to connections subscribed to cycles channel.
 */
export function broadcastCycleProgress(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast cycle result message to connections subscribed to cycles channel.
 */
export function broadcastCycleResult(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent output message to connections subscribed to cycles channel.
 */
export function broadcastAgentOutput(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent tool call message to connections subscribed to cycles channel.
 */
export function broadcastAgentToolCall(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent tool result message to connections subscribed to cycles channel.
 */
export function broadcastAgentToolResult(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent reasoning message to connections subscribed to cycles channel.
 */
export function broadcastAgentReasoning(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent text delta message to connections subscribed to cycles channel.
 */
export function broadcastAgentTextDelta(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast decision plan message to connections subscribed to cycles channel.
 */
export function broadcastDecisionPlan(message: ServerMessage): number {
  return broadcast("cycles", message);
}

/**
 * Broadcast agent status message to connections subscribed to agents channel.
 */
export function broadcastAgentStatus(message: ServerMessage): number {
  return broadcast("agents", message);
}

/**
 * Broadcast filings sync progress message to connections subscribed to filings channel.
 */
export function broadcastFilingsSyncProgress(message: ServerMessage): number {
  return broadcast("filings", message);
}

/**
 * Broadcast filings sync completion message to connections subscribed to filings channel.
 */
export function broadcastFilingsSyncComplete(message: ServerMessage): number {
  return broadcast("filings", message);
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

  log.info(
    {
      connectionId: metadata.connectionId,
      userId: metadata.userId,
      totalConnections: connections.size,
    },
    "WebSocket client connected"
  );

  sendMessage(ws, {
    type: "system_status",
    data: {
      health: "healthy",
      uptimeSeconds: Math.floor(process.uptime()),
      activeConnections: connections.size,
      services: {},
      environment: "PAPER",
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Handle WebSocket close.
 */
export function handleClose(ws: WebSocketWithMetadata, code: number, reason: string): void {
  const metadata = ws.data;
  log.info(
    {
      connectionId: metadata.connectionId,
      code,
      reason,
      remainingConnections: connections.size - 1,
    },
    "WebSocket client disconnected"
  );
  removeConnection(metadata.connectionId);
  cleanupBacktestSubscriptions(ws);
}

/**
 * Handle WebSocket error.
 */
export function handleError(ws: WebSocketWithMetadata, error: Error): void {
  const metadata = ws.data;
  log.error({ connectionId: metadata.connectionId, error: error.message }, "WebSocket error");
  removeConnection(metadata.connectionId);
  cleanupBacktestSubscriptions(ws);
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
    } catch (_error) {
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
      try {
        ws.close(1000, "Connection timed out");
      } catch {
        // Already closed
      }
      removeConnection(connectionId);
      closed++;
    }
  }

  if (closed > 0) {
    log.info(
      { closedCount: closed, remainingConnections: connections.size },
      "Closed stale WebSocket connections"
    );
  }

  return closed;
}

/**
 * Start heartbeat interval.
 */
let heartbeatInterval: Timer | null = null;

export function startHeartbeat(): void {
  if (heartbeatInterval) {
    return;
  }

  heartbeatInterval = setInterval(() => {
    closeStaleConnections();
    pingAllConnections();
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop heartbeat interval.
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ============================================
// Graceful Shutdown
// ============================================

/**
 * Close all connections gracefully.
 */
export function closeAllConnections(reason = "Server shutting down"): void {
  const connectionCount = connections.size;
  log.info({ connectionCount, reason }, "Closing all WebSocket connections");

  for (const [_connectionId, ws] of connections) {
    try {
      ws.close(1001, reason);
    } catch {
      // Already closed
    }
  }

  connections.clear();
  stopHeartbeat();
  log.info("All WebSocket connections closed");
}

// ============================================
// WebSocket Upgrade Handler
// ============================================

/**
 * Create metadata for new connection.
 */
export function createConnectionMetadata(userId: string): ConnectionMetadata {
  return {
    connectionId: generateConnectionId(),
    userId,
    connectedAt: new Date(),
    lastPing: new Date(),
    channels: new Set(),
    symbols: new Set(),
    contracts: new Set(),
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
  broadcastAggregate,
  broadcastTrade,
  broadcastOptionsQuote,
  broadcastAll,
  broadcastCycleProgress,
  broadcastCycleResult,
  broadcastAgentOutput,
  broadcastAgentStatus,
  broadcastToBacktest,
  sendMessage,
  sendError,
  validateAuthTokenAsync,
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
