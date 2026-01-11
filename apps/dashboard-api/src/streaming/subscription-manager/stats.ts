/**
 * Subscription Manager Stats
 *
 * Metrics and status functions for monitoring.
 */

import { MAX_CONTRACTS_PER_CONNECTION } from "./constants.js";
import {
  connectionPools,
  isInitialized,
  pendingQueue,
  quoteCache,
  subscriptions,
} from "./state.js";
import { type SubscriptionManagerStats, SubscriptionPriority } from "./types.js";

/**
 * Get subscription manager statistics.
 */
export function getStats(): SubscriptionManagerStats {
  const subscriptionsByPriority = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const entry of subscriptions.values()) {
    switch (entry.priority) {
      case SubscriptionPriority.CRITICAL:
        subscriptionsByPriority.critical++;
        break;
      case SubscriptionPriority.HIGH:
        subscriptionsByPriority.high++;
        break;
      case SubscriptionPriority.MEDIUM:
        subscriptionsByPriority.medium++;
        break;
      case SubscriptionPriority.LOW:
        subscriptionsByPriority.low++;
        break;
    }
  }

  return {
    isInitialized: isInitialized(),
    poolCount: connectionPools.length,
    pools: connectionPools.map((pool, index) => ({
      index,
      isConnected: pool.isConnected,
      contractCount: pool.contracts.size,
      capacity: MAX_CONTRACTS_PER_CONNECTION - pool.contracts.size,
    })),
    totalSubscriptions: subscriptions.size,
    pendingQueueSize: pendingQueue.length,
    cacheSize: quoteCache.size,
    subscriptionsByPriority,
  };
}

/**
 * Check if subscription manager is ready.
 */
export function isReady(): boolean {
  return isInitialized() && connectionPools.some((p) => p.isConnected);
}

/**
 * Get total capacity across all pools.
 */
export function getTotalCapacity(): number {
  return connectionPools.reduce((sum, pool) => {
    return sum + (pool.isConnected ? MAX_CONTRACTS_PER_CONNECTION - pool.contracts.size : 0);
  }, 0);
}

/**
 * Get all active subscriptions.
 */
export function getActiveSubscriptions(): string[] {
  return Array.from(subscriptions.entries())
    .filter(([, entry]) => entry.connectionPoolIndex !== null)
    .map(([contract]) => contract);
}
