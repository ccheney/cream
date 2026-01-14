/**
 * Subscription Manager State
 *
 * Global state management for options subscriptions.
 */

import type {
	CachedQuote,
	ConnectionPool,
	PendingUnsubscribe,
	SubscriptionEntry,
} from "./types.js";

/** Connection pools for options WebSocket */
export const connectionPools: ConnectionPool[] = [];

/** All subscription entries indexed by contract */
export const subscriptions = new Map<string, SubscriptionEntry>();

/** Priority queue for pending subscriptions */
export const pendingQueue: SubscriptionEntry[] = [];

/** Quote cache with TTL */
export const quoteCache = new Map<string, CachedQuote>();

/** Pending unsubscribe operations (debounced) */
export const pendingUnsubscribes = new Map<string, PendingUnsubscribe>();

/** Manager initialization state */
let initialized = false;

export function isInitialized(): boolean {
	return initialized;
}

export function setInitialized(value: boolean): void {
	initialized = value;
}

/**
 * Clear all state - used during shutdown.
 */
export function clearAllState(): void {
	for (const pending of pendingUnsubscribes.values()) {
		clearTimeout(pending.timeoutId);
	}
	pendingUnsubscribes.clear();

	for (const pool of connectionPools) {
		pool.client.disconnect();
	}
	connectionPools.length = 0;

	subscriptions.clear();
	pendingQueue.length = 0;
	quoteCache.clear();
	initialized = false;
}
