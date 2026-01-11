/**
 * WebSocket Server Handler
 *
 * This file re-exports from the modular websocket implementation for backward compatibility.
 *
 * @see docs/plans/ui/06-websocket.md
 */

export {
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
  broadcastToBacktest,
  broadcastTrade,
  closeAllConnections,
  closeStaleConnections,
  createConnectionMetadata,
  default,
  getConnection,
  getConnectionCount,
  getConnectionIds,
  handleClose,
  handleError,
  handleMessage,
  handleOpen,
  pingAllConnections,
  sendError,
  sendMessage,
  startHeartbeat,
  stopHeartbeat,
  validateAuthTokenAsync,
  websocketHandler,
} from "./index.js";
export type { AuthResult, ConnectionMetadata, WebSocketWithMetadata } from "./types.js";
