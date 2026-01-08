/**
 * Backtest WebSocket Channel
 *
 * Manages WebSocket subscriptions for backtest progress updates.
 * Supports targeted broadcasts to specific backtest subscribers.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 2.3
 */

import type { ServerWebSocket } from "bun";

// ============================================
// Types
// ============================================

/**
 * WebSocket with any data type (for flexibility with different connection metadata).
 */
type WebSocketConnection = ServerWebSocket<unknown>;

/**
 * Message types for backtest WebSocket events.
 */
export type BacktestMessageType =
  | "backtest:started"
  | "backtest:progress"
  | "backtest:trade"
  | "backtest:completed"
  | "backtest:error";

/**
 * Backtest WebSocket message payload.
 */
export interface BacktestMessage {
  type: BacktestMessageType;
  payload?: unknown;
}

// ============================================
// Subscription State
// ============================================

/**
 * Map of backtest IDs to subscribed WebSocket connections.
 */
const subscriptions = new Map<string, Set<WebSocketConnection>>();

/**
 * Reverse map from connection to subscribed backtest IDs (for cleanup).
 */
const connectionBacktests = new WeakMap<WebSocketConnection, Set<string>>();

// ============================================
// Subscription Management
// ============================================

/**
 * Subscribe a WebSocket connection to backtest progress updates.
 *
 * @param ws - The WebSocket connection
 * @param backtestId - The backtest ID to subscribe to
 */
export function subscribeToBacktest(ws: WebSocketConnection, backtestId: string): void {
  // Add to subscriptions map
  let subs = subscriptions.get(backtestId);
  if (!subs) {
    subs = new Set();
    subscriptions.set(backtestId, subs);
  }
  subs.add(ws);

  // Track on connection for cleanup
  let backtests = connectionBacktests.get(ws);
  if (!backtests) {
    backtests = new Set();
    connectionBacktests.set(ws, backtests);
  }
  backtests.add(backtestId);
}

/**
 * Unsubscribe a WebSocket connection from backtest progress updates.
 *
 * @param ws - The WebSocket connection
 * @param backtestId - The backtest ID to unsubscribe from
 */
export function unsubscribeFromBacktest(ws: WebSocketConnection, backtestId: string): void {
  // Remove from subscriptions
  const subs = subscriptions.get(backtestId);
  if (subs) {
    subs.delete(ws);
    // Clean up empty subscription sets
    if (subs.size === 0) {
      subscriptions.delete(backtestId);
    }
  }

  // Update connection tracking
  const backtests = connectionBacktests.get(ws);
  if (backtests) {
    backtests.delete(backtestId);
  }
}

/**
 * Clean up all backtest subscriptions for a connection.
 * Call this when a WebSocket connection closes.
 *
 * @param ws - The WebSocket connection being cleaned up
 */
export function cleanupBacktestSubscriptions(ws: WebSocketConnection): void {
  const backtests = connectionBacktests.get(ws);
  if (!backtests) {
    return;
  }

  for (const backtestId of backtests) {
    const subs = subscriptions.get(backtestId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        subscriptions.delete(backtestId);
      }
    }
  }

  // WeakMap will automatically clean up when ws is garbage collected
}

// ============================================
// Broadcasting
// ============================================

/**
 * Broadcast a message to all connections subscribed to a backtest.
 *
 * @param backtestId - The backtest ID to broadcast to
 * @param message - The message to send
 * @returns The number of connections successfully sent to
 */
export function broadcastToBacktest(backtestId: string, message: BacktestMessage): number {
  const subs = subscriptions.get(backtestId);
  if (!subs || subs.size === 0) {
    return 0;
  }

  const data = JSON.stringify(message);
  let sent = 0;
  const deadConnections: WebSocketConnection[] = [];

  for (const ws of subs) {
    try {
      ws.send(data);
      sent++;
    } catch {
      // Connection is likely dead, mark for removal
      deadConnections.push(ws);
    }
  }

  // Clean up dead connections
  for (const ws of deadConnections) {
    unsubscribeFromBacktest(ws, backtestId);
  }

  return sent;
}

/**
 * Get the number of subscribers for a backtest.
 *
 * @param backtestId - The backtest ID to check
 * @returns The number of subscribed connections
 */
export function getBacktestSubscriberCount(backtestId: string): number {
  return subscriptions.get(backtestId)?.size ?? 0;
}

/**
 * Check if a backtest has any subscribers.
 *
 * @param backtestId - The backtest ID to check
 * @returns True if there are subscribers
 */
export function hasBacktestSubscribers(backtestId: string): boolean {
  return getBacktestSubscriberCount(backtestId) > 0;
}

// ============================================
// Debugging / Metrics
// ============================================

/**
 * Get the total number of active backtest subscriptions.
 * Useful for monitoring and debugging.
 *
 * @returns Total subscription count across all backtests
 */
export function getTotalBacktestSubscriptions(): number {
  let total = 0;
  for (const subs of subscriptions.values()) {
    total += subs.size;
  }
  return total;
}

/**
 * Get all active backtest IDs with subscribers.
 *
 * @returns Array of backtest IDs that have subscribers
 */
export function getActiveBacktestIds(): string[] {
  return Array.from(subscriptions.keys());
}
