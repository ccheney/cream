/**
 * Connection Pool Management
 *
 * Handles WebSocket connection pools for Alpaca options API.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { type AlpacaWsEvent, createAlpacaOptionsClientFromEnv } from "@cream/marketdata";
import {
	CONNECTION_SPAWN_THRESHOLD,
	MAX_CONNECTION_POOLS,
	MAX_CONTRACTS_PER_CONNECTION,
} from "./constants.js";
import { handleQuoteMessage, handleTradeMessage } from "./quotes.js";
import { connectionPools, pendingQueue, subscriptions } from "./state.js";
import type { ConnectionPool, SubscriptionEntry } from "./types.js";

/**
 * Create a new connection pool.
 */
export async function createConnectionPool(index: number): Promise<ConnectionPool> {
	const client = createAlpacaOptionsClientFromEnv();
	const pool: ConnectionPool = {
		client,
		contracts: new Set(),
		isConnected: false,
		reconnectAttempts: 0,
	};

	client.on((event: AlpacaWsEvent) => handlePoolEvent(index, event));

	await client.connect();
	return pool;
}

/**
 * Handle events from a connection pool.
 */
function handlePoolEvent(poolIndex: number, event: AlpacaWsEvent): void {
	const pool = connectionPools[poolIndex];
	if (!pool) {
		return;
	}

	switch (event.type) {
		case "connected":
			break;

		case "authenticated":
			pool.isConnected = true;
			pool.reconnectAttempts = 0;
			// Resubscribe to all contracts after reconnection
			if (pool.contracts.size > 0) {
				const contracts = Array.from(pool.contracts);
				pool.client.subscribe("quotes", contracts);
				pool.client.subscribe("trades", contracts);
			}
			processPendingQueue();
			break;

		case "quote":
			handleQuoteMessage(event.message);
			break;

		case "trade":
			handleTradeMessage(event.message);
			break;

		case "disconnected":
			pool.isConnected = false;
			break;

		case "reconnecting":
			pool.reconnectAttempts = event.attempt;
			break;

		case "error":
			break;
	}
}

/**
 * Find or create a connection pool with capacity.
 */
export async function getAvailablePool(): Promise<ConnectionPool | null> {
	for (const pool of connectionPools) {
		if (pool.isConnected && pool.contracts.size < MAX_CONTRACTS_PER_CONNECTION) {
			return pool;
		}
	}

	const lastPool = connectionPools[connectionPools.length - 1];
	if (
		lastPool &&
		lastPool.contracts.size >= CONNECTION_SPAWN_THRESHOLD &&
		connectionPools.length < MAX_CONNECTION_POOLS
	) {
		try {
			const newPool = await createConnectionPool(connectionPools.length);
			connectionPools.push(newPool);
			return newPool;
		} catch (_error) {}
	}

	return connectionPools.find((p) => p.isConnected) ?? null;
}

/**
 * Get the pool index for a connection pool.
 */
export function getPoolIndex(pool: ConnectionPool): number {
	return connectionPools.indexOf(pool);
}

/**
 * Subscribe a contract to a specific pool.
 */
export async function subscribeToPool(
	pool: ConnectionPool,
	entry: SubscriptionEntry
): Promise<void> {
	const poolIndex = getPoolIndex(pool);
	pool.contracts.add(entry.contract);
	entry.connectionPoolIndex = poolIndex;

	if (pool.client.isConnected()) {
		// Subscribe to quotes and trades for this contract
		pool.client.subscribe("quotes", [entry.contract]);
		pool.client.subscribe("trades", [entry.contract]);
	}
}

/**
 * Add entry to pending queue sorted by priority.
 */
export function addToPendingQueue(entry: SubscriptionEntry): void {
	const existingIndex = pendingQueue.findIndex((e) => e.contract === entry.contract);
	if (existingIndex !== -1) {
		pendingQueue.splice(existingIndex, 1);
	}

	const insertIndex = pendingQueue.findIndex((e) => e.priority > entry.priority);
	if (insertIndex === -1) {
		pendingQueue.push(entry);
	} else {
		pendingQueue.splice(insertIndex, 0, entry);
	}
}

/**
 * Process pending queue when capacity becomes available.
 */
export async function processPendingQueue(): Promise<void> {
	while (pendingQueue.length > 0) {
		const pool = await getAvailablePool();
		if (!pool || pool.contracts.size >= MAX_CONTRACTS_PER_CONNECTION) {
			break;
		}

		const entry = pendingQueue.shift();
		if (entry && entry.subscribers.size > 0) {
			await subscribeToPool(pool, entry);
		}
	}
}

/**
 * Unsubscribe a contract from its pool.
 */
export async function unsubscribeFromPool(contract: string): Promise<void> {
	const entry = subscriptions.get(contract);
	if (!entry) {
		return;
	}

	if (entry.subscribers.size > 0) {
		return;
	}

	const poolIndex = entry.connectionPoolIndex;
	if (poolIndex !== null && poolIndex < connectionPools.length) {
		const pool = connectionPools[poolIndex];
		if (pool) {
			pool.contracts.delete(contract);

			if (pool.client.isConnected()) {
				pool.client.unsubscribe("quotes", [contract]);
				pool.client.unsubscribe("trades", [contract]);
			}
		}
	}

	subscriptions.delete(contract);
	processPendingQueue();
}
