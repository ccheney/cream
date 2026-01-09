/**
 * Backtest WebSocket Channel
 *
 * Manages WebSocket subscriptions for backtest progress updates.
 * Supports targeted broadcasts to specific backtest subscribers.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 2.3
 */

import type { ServerWebSocket } from "bun";

type WebSocketConnection = ServerWebSocket<unknown>;

export type BacktestMessageType =
  | "backtest:started"
  | "backtest:progress"
  | "backtest:trade"
  | "backtest:completed"
  | "backtest:error";

export interface BacktestMessage {
  type: BacktestMessageType;
  payload?: unknown;
}

const subscriptions = new Map<string, Set<WebSocketConnection>>();

// Enables O(1) cleanup when a connection closes
const connectionBacktests = new WeakMap<WebSocketConnection, Set<string>>();

export function subscribeToBacktest(ws: WebSocketConnection, backtestId: string): void {
  let subs = subscriptions.get(backtestId);
  if (!subs) {
    subs = new Set();
    subscriptions.set(backtestId, subs);
  }
  subs.add(ws);

  let backtests = connectionBacktests.get(ws);
  if (!backtests) {
    backtests = new Set();
    connectionBacktests.set(ws, backtests);
  }
  backtests.add(backtestId);
}

export function unsubscribeFromBacktest(ws: WebSocketConnection, backtestId: string): void {
  const subs = subscriptions.get(backtestId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) {
      subscriptions.delete(backtestId);
    }
  }

  const backtests = connectionBacktests.get(ws);
  if (backtests) {
    backtests.delete(backtestId);
  }
}

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
}

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
      deadConnections.push(ws);
    }
  }

  for (const ws of deadConnections) {
    unsubscribeFromBacktest(ws, backtestId);
  }

  return sent;
}

export function getBacktestSubscriberCount(backtestId: string): number {
  return subscriptions.get(backtestId)?.size ?? 0;
}

export function hasBacktestSubscribers(backtestId: string): boolean {
  return getBacktestSubscriberCount(backtestId) > 0;
}

export function getTotalBacktestSubscriptions(): number {
  let total = 0;
  for (const subs of subscriptions.values()) {
    total += subs.size;
  }
  return total;
}

export function getActiveBacktestIds(): string[] {
  return Array.from(subscriptions.keys());
}
