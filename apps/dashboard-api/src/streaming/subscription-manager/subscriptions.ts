/**
 * Subscription Handlers
 *
 * Core subscription request and release logic.
 */

import { broadcastOptionsQuote } from "../../websocket/handler.js";
import { getValidCachedQuote } from "./cache.js";
import { MAX_CONTRACTS_PER_CONNECTION, UNSUBSCRIBE_DEBOUNCE_MS } from "./constants.js";
import {
	addToPendingQueue,
	getAvailablePool,
	subscribeToPool,
	unsubscribeFromPool,
} from "./pool.js";
import { pendingUnsubscribes, subscriptions } from "./state.js";
import { SubscriptionPriority } from "./types.js";

/**
 * Request a subscription to a contract.
 *
 * @param contract OCC format contract (e.g., O:AAPL250117C00100000)
 * @param priority Subscription priority
 * @param subscriberId Connection ID of the subscriber
 */
export async function requestSubscription(
	contract: string,
	priority: SubscriptionPriority,
	subscriberId: string
): Promise<void> {
	const upperContract = contract.toUpperCase();

	const pending = pendingUnsubscribes.get(upperContract);
	if (pending) {
		clearTimeout(pending.timeoutId);
		pendingUnsubscribes.delete(upperContract);
	}

	let entry = subscriptions.get(upperContract);
	if (entry) {
		entry.subscribers.add(subscriberId);
		if (priority < entry.priority) {
			entry.priority = priority;
		}
		entry.lastRequestedAt = new Date();

		if (entry.connectionPoolIndex !== null) {
			const cached = getValidCachedQuote(upperContract);
			if (cached) {
				broadcastOptionsQuote(upperContract, {
					type: "options_quote",
					data: {
						contract: upperContract,
						underlying: cached.underlying,
						bid: cached.bid,
						ask: cached.ask,
						last: cached.last,
						timestamp: cached.timestamp.toISOString(),
					},
				});
			}
			return;
		}
	} else {
		entry = {
			contract: upperContract,
			priority,
			subscribers: new Set([subscriberId]),
			connectionPoolIndex: null,
			lastRequestedAt: new Date(),
		};
		subscriptions.set(upperContract, entry);
	}

	const pool = await getAvailablePool();
	if (pool && pool.contracts.size < MAX_CONTRACTS_PER_CONNECTION) {
		await subscribeToPool(pool, entry);
	} else {
		addToPendingQueue(entry);
	}
}

/**
 * Release a subscription from a subscriber.
 * Uses debouncing to prevent thrashing.
 */
export function releaseSubscription(contract: string, subscriberId: string): void {
	const upperContract = contract.toUpperCase();
	const entry = subscriptions.get(upperContract);
	if (!entry) {
		return;
	}

	entry.subscribers.delete(subscriberId);

	if (entry.subscribers.size === 0) {
		if (entry.priority === SubscriptionPriority.CRITICAL) {
			return;
		}

		const existing = pendingUnsubscribes.get(upperContract);
		if (existing) {
			clearTimeout(existing.timeoutId);
		}

		const timeoutId = setTimeout(() => {
			unsubscribeFromPool(upperContract);
			pendingUnsubscribes.delete(upperContract);
		}, UNSUBSCRIBE_DEBOUNCE_MS);

		pendingUnsubscribes.set(upperContract, { contract: upperContract, timeoutId });
	}
}

/**
 * Subscribe multiple contracts with a given priority.
 */
export async function requestBatchSubscription(
	contracts: string[],
	priority: SubscriptionPriority,
	subscriberId: string
): Promise<void> {
	for (const contract of contracts) {
		await requestSubscription(contract, priority, subscriberId);
	}
}

/**
 * Release multiple subscriptions.
 */
export function releaseBatchSubscription(contracts: string[], subscriberId: string): void {
	for (const contract of contracts) {
		releaseSubscription(contract, subscriberId);
	}
}

/**
 * Set contracts as critical (position-based).
 * These contracts will never be automatically unsubscribed.
 */
export async function setCriticalContracts(
	contracts: string[],
	subscriberId: string
): Promise<void> {
	for (const contract of contracts) {
		await requestSubscription(contract, SubscriptionPriority.CRITICAL, subscriberId);
	}
}

/**
 * Evict lowest priority subscriptions to make room.
 * Returns number of subscriptions evicted.
 */
export function evictLowestPriority(count: number): number {
	const sortedEntries = Array.from(subscriptions.values())
		.filter((e) => e.connectionPoolIndex !== null && e.priority > SubscriptionPriority.CRITICAL)
		.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return a.lastRequestedAt.getTime() - b.lastRequestedAt.getTime();
		});

	let evicted = 0;
	for (const entry of sortedEntries) {
		if (evicted >= count) {
			break;
		}
		entry.connectionPoolIndex = null;
		addToPendingQueue(entry);
		evicted++;
	}

	return evicted;
}
