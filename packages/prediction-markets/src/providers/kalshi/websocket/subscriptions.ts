/**
 * Subscription management for Kalshi WebSocket channels.
 *
 * Handles subscribing, unsubscribing, and managing pending subscriptions.
 */

import type {
  ConnectionState,
  KalshiWebSocketCallback,
  KalshiWebSocketChannel,
  SubscribeCommand,
  UnsubscribeCommand,
} from "./types.js";

export interface SubscriptionManager {
  subscriptions: Map<string, Set<KalshiWebSocketCallback>>;
  pendingSubscriptions: Map<string, Set<string>>;
}

export function createSubscriptionKey(channel: string, tickers: string[]): string {
  return `${channel}:${tickers.sort().join(",")}`;
}

export function createSubscribeCommand(
  messageId: number,
  channel: string,
  tickers: string[]
): SubscribeCommand {
  return {
    id: messageId,
    cmd: "subscribe",
    params: {
      channels: [channel],
      market_tickers: tickers.length > 0 ? tickers : undefined,
    },
  };
}

export function createUnsubscribeCommand(
  messageId: number,
  channel: string,
  tickers: string[]
): UnsubscribeCommand {
  return {
    id: messageId,
    cmd: "unsubscribe",
    params: {
      channels: [channel],
      market_tickers: tickers.length > 0 ? tickers : undefined,
    },
  };
}

export function addSubscription(
  manager: SubscriptionManager,
  channel: KalshiWebSocketChannel,
  tickers: string[],
  callback: KalshiWebSocketCallback,
  connectionState: ConnectionState,
  sendFn: (channel: string, tickers: string[]) => void
): void {
  const key = createSubscriptionKey(channel, tickers);

  if (!manager.subscriptions.has(key)) {
    manager.subscriptions.set(key, new Set());
  }
  manager.subscriptions.get(key)?.add(callback);

  if (connectionState === "connected") {
    sendFn(channel, tickers);
  } else {
    if (!manager.pendingSubscriptions.has(channel)) {
      manager.pendingSubscriptions.set(channel, new Set());
    }
    for (const ticker of tickers) {
      manager.pendingSubscriptions.get(channel)?.add(ticker);
    }
  }
}

export function removeSubscription(
  manager: SubscriptionManager,
  channel: KalshiWebSocketChannel,
  tickers: string[],
  callback: KalshiWebSocketCallback | undefined,
  sendUnsubscribeFn: (channel: string, tickers: string[]) => void
): void {
  const key = createSubscriptionKey(channel, tickers);

  if (callback && manager.subscriptions.has(key)) {
    const callbacks = manager.subscriptions.get(key);
    callbacks?.delete(callback);
    if (callbacks?.size === 0) {
      manager.subscriptions.delete(key);
      sendUnsubscribeFn(channel, tickers);
    }
  } else if (!callback) {
    manager.subscriptions.delete(key);
    sendUnsubscribeFn(channel, tickers);
  }
}

export function resubscribeAll(
  manager: SubscriptionManager,
  sendFn: (channel: string, tickers: string[]) => void
): void {
  for (const [channel, tickers] of manager.pendingSubscriptions.entries()) {
    if (tickers.size > 0) {
      sendFn(channel, [...tickers]);
    }
  }
  manager.pendingSubscriptions.clear();

  for (const key of manager.subscriptions.keys()) {
    const [channel, tickerStr] = key.split(":");
    const tickers = tickerStr?.split(",").filter(Boolean) ?? [];
    if (channel) {
      sendFn(channel, tickers);
    }
  }
}
