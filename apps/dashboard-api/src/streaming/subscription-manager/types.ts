/**
 * Subscription Manager Types
 *
 * Type definitions for options subscription management.
 */

import type { MassiveWebSocketClient } from "@cream/marketdata";

/**
 * Subscription priority levels.
 * Higher priority subscriptions are maintained when at capacity.
 */
export enum SubscriptionPriority {
  /** Current positions - must always be subscribed */
  CRITICAL = 0,
  /** Active watchlist contracts */
  HIGH = 1,
  /** Visible options chain contracts */
  MEDIUM = 2,
  /** Browsing/exploratory subscriptions */
  LOW = 3,
}

export interface SubscriptionEntry {
  contract: string;
  priority: SubscriptionPriority;
  subscribers: Set<string>;
  connectionPoolIndex: number | null;
  lastRequestedAt: Date;
}

export interface CachedQuote {
  underlying: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest?: number;
  impliedVol?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  timestamp: Date;
  cachedAt: Date;
}

export interface ConnectionPool {
  client: MassiveWebSocketClient;
  contracts: Set<string>;
  isConnected: boolean;
  reconnectAttempts: number;
}

export interface PendingUnsubscribe {
  contract: string;
  timeoutId: Timer;
}

export interface SubscriptionManagerStats {
  isInitialized: boolean;
  poolCount: number;
  pools: Array<{
    index: number;
    isConnected: boolean;
    contractCount: number;
    capacity: number;
  }>;
  totalSubscriptions: number;
  pendingQueueSize: number;
  cacheSize: number;
  subscriptionsByPriority: Record<string, number>;
}
