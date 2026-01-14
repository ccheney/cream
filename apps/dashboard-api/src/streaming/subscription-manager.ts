/**
 * Options Subscription Manager
 *
 * This file re-exports from the modular subscription-manager implementation
 * for backward compatibility.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6
 */

export type { CachedQuote, SubscriptionManagerStats } from "./subscription-manager/index.js";
export {
	cleanExpiredCache,
	default,
	evictLowestPriority,
	getActiveSubscriptions,
	getCachedQuote,
	getStats,
	getTotalCapacity,
	initSubscriptionManager,
	isReady,
	releaseBatchSubscription,
	releaseSubscription,
	requestBatchSubscription,
	requestSubscription,
	SubscriptionPriority,
	setCriticalContracts,
	shutdownSubscriptionManager,
} from "./subscription-manager/index.js";
