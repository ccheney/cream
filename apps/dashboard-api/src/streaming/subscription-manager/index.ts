/**
 * Subscription Manager
 *
 * Manages WebSocket subscription limits for Alpaca options API.
 * Handles connection pooling (1000 contracts per connection) with
 * priority-based subscription management.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { isAlpacaConfigured } from "@cream/marketdata";
import { cleanExpiredCache, getCachedQuote } from "./cache.js";
import { createConnectionPool } from "./pool.js";
import { clearAllState, connectionPools, isInitialized, setInitialized } from "./state.js";
import { getActiveSubscriptions, getStats, getTotalCapacity, isReady } from "./stats.js";
import {
	evictLowestPriority,
	releaseBatchSubscription,
	releaseSubscription,
	requestBatchSubscription,
	requestSubscription,
	setCriticalContracts,
} from "./subscriptions.js";
import { SubscriptionPriority } from "./types.js";

/**
 * Initialize the subscription manager.
 * Creates the first connection pool.
 */
export async function initSubscriptionManager(): Promise<void> {
	if (isInitialized()) {
		return;
	}

	if (!isAlpacaConfigured()) {
		return;
	}

	try {
		const pool = await createConnectionPool(0);
		connectionPools.push(pool);
		setInitialized(true);
	} catch (_error) {}
}

/**
 * Shutdown the subscription manager.
 */
export function shutdownSubscriptionManager(): void {
	clearAllState();
}

export {
	cleanExpiredCache,
	evictLowestPriority,
	getActiveSubscriptions,
	getCachedQuote,
	getStats,
	getTotalCapacity,
	isReady,
	releaseBatchSubscription,
	releaseSubscription,
	requestBatchSubscription,
	requestSubscription,
	setCriticalContracts,
	SubscriptionPriority,
};

export type { CachedQuote, SubscriptionManagerStats } from "./types.js";

export default {
	initSubscriptionManager,
	shutdownSubscriptionManager,
	requestSubscription,
	releaseSubscription,
	requestBatchSubscription,
	releaseBatchSubscription,
	setCriticalContracts,
	getCachedQuote,
	cleanExpiredCache,
	evictLowestPriority,
	getStats,
	isReady,
	getTotalCapacity,
	getActiveSubscriptions,
	SubscriptionPriority,
};
