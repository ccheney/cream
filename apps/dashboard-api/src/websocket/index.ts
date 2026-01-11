/**
 * WebSocket Module
 *
 * Main entry point for WebSocket handling with connection lifecycle,
 * message routing, and broadcasting.
 */

import log from "../logger.js";
import { cleanupBacktestSubscriptions } from "./backtest-channel.js";
import {
  addConnection,
  broadcast,
  broadcastAgentOutput,
  broadcastAgentReasoning,
  broadcastAgentStatus,
  broadcastAgentTextDelta,
  broadcastAgentToolCall,
  broadcastAgentToolResult,
  broadcastAggregate,
  broadcastAll,
  broadcastCycleProgress,
  broadcastCycleResult,
  broadcastDecisionPlan,
  broadcastFilingsSyncComplete,
  broadcastFilingsSyncProgress,
  broadcastIndicator,
  broadcastOptionsQuote,
  broadcastQuote,
  broadcastTrade,
  closeAllConnections,
  closeStaleConnections,
  createConnectionMetadata,
  getConnection,
  getConnectionCount,
  getConnectionIds,
  pingAllConnections,
  removeConnection,
  sendError,
  sendMessage,
  startHeartbeat,
  stopHeartbeat,
} from "./channels.js";
import { handleMessage } from "./routing.js";
import type { AuthResult, ConnectionMetadata, WebSocketWithMetadata } from "./types.js";

export { broadcastToBacktest } from "./backtest-channel.js";

/**
 * Validate authentication using better-auth session cookies.
 */
export async function validateAuthTokenAsync(headers: Headers): Promise<AuthResult> {
  try {
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

/**
 * Handle new WebSocket connection.
 */
export function handleOpen(ws: WebSocketWithMetadata): void {
  const metadata = ws.data;
  addConnection(ws);

  log.info(
    {
      connectionId: metadata.connectionId,
      userId: metadata.userId,
      totalConnections: getConnectionCount(),
    },
    "WebSocket client connected"
  );

  sendMessage(ws, {
    type: "system_status",
    data: {
      health: "healthy",
      uptimeSeconds: Math.floor(process.uptime()),
      activeConnections: getConnectionCount(),
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
      remainingConnections: getConnectionCount() - 1,
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

export {
  handleMessage,
  sendMessage,
  sendError,
  getConnectionCount,
  getConnectionIds,
  getConnection,
  createConnectionMetadata,
  broadcast,
  broadcastQuote,
  broadcastOptionsQuote,
  broadcastIndicator,
  broadcastTrade,
  broadcastAggregate,
  broadcastAll,
  broadcastCycleProgress,
  broadcastCycleResult,
  broadcastAgentOutput,
  broadcastAgentToolCall,
  broadcastAgentToolResult,
  broadcastAgentReasoning,
  broadcastAgentTextDelta,
  broadcastDecisionPlan,
  broadcastAgentStatus,
  broadcastFilingsSyncProgress,
  broadcastFilingsSyncComplete,
  startHeartbeat,
  stopHeartbeat,
  closeStaleConnections,
  closeAllConnections,
  pingAllConnections,
};

export type { WebSocketWithMetadata, ConnectionMetadata, AuthResult };

export default {
  websocketHandler,
  handleMessage,
  handleOpen,
  handleClose,
  handleError,
  broadcast,
  broadcastQuote,
  broadcastIndicator,
  broadcastAggregate,
  broadcastTrade,
  broadcastOptionsQuote,
  broadcastAll,
  broadcastCycleProgress,
  broadcastCycleResult,
  broadcastAgentOutput,
  broadcastAgentStatus,
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
