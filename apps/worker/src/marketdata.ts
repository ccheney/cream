/**
 * Market Data Subscription
 *
 * Subscribes to real-time market data from the execution engine's gRPC service.
 */

import {
	createMarketDataClient,
	type MarketDataServiceClient,
	type Quote,
} from "@cream/domain/grpc";
import { log } from "./logger";

// ============================================
// Configuration
// ============================================

const GRPC_BASE_URL = process.env.EXECUTION_ENGINE_GRPC_URL ?? "http://localhost:50053";

/** Max retries for initial connection (execution-engine may be starting) */
const MAX_CONNECTION_RETRIES = 30;

/** Initial retry delay in ms (doubles each retry, max 30s) */
const INITIAL_RETRY_DELAY_MS = 1000;

// ============================================
// Client Singleton
// ============================================

let marketDataClient: MarketDataServiceClient | null = null;

/**
 * Get or create the market data gRPC client
 */
function getMarketDataClient(): MarketDataServiceClient {
	if (!marketDataClient) {
		marketDataClient = createMarketDataClient(GRPC_BASE_URL, {
			enableLogging: process.env.GRPC_LOGGING === "true",
		});
	}
	return marketDataClient;
}

// ============================================
// Subscription State
// ============================================

interface SubscriptionState {
	active: boolean;
	symbols: string[];
	abortController: AbortController | null;
	lastUpdate: Date | null;
	updateCount: number;
}

const subscriptionState: SubscriptionState = {
	active: false,
	symbols: [],
	abortController: null,
	lastUpdate: null,
	updateCount: 0,
};

// ============================================
// Subscription Functions
// ============================================

/**
 * Start market data subscription for the given symbols.
 *
 * This initiates a streaming gRPC call to the execution engine.
 *
 * @param symbols - Symbols to subscribe to (from runtime config)
 * @param onUpdate - Optional callback for quote updates
 */
export async function startMarketDataSubscription(
	symbols: string[],
	onUpdate?: (quote: Quote) => void
): Promise<void> {
	if (subscriptionState.active) {
		log.info({}, "Subscription already active, updating symbols");
		await stopMarketDataSubscription();
	}

	if (symbols.length === 0) {
		log.warn({}, "No symbols provided, skipping subscription");
		return;
	}

	subscriptionState.active = true;
	subscriptionState.symbols = symbols;
	subscriptionState.abortController = new AbortController();
	subscriptionState.updateCount = 0;

	log.info({ symbolCount: symbols.length, symbols: symbols.join(", ") }, "Starting subscription");

	const client = getMarketDataClient();

	// Start the subscription in a background task
	// The connection stays open and streams market data updates
	runSubscriptionLoop(client, symbols, onUpdate).catch((error) => {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Subscription error"
		);
		subscriptionState.active = false;
	});
}

/**
 * Run the subscription loop, receiving market data updates.
 * Includes retry logic for when execution-engine is still starting.
 */
async function runSubscriptionLoop(
	client: MarketDataServiceClient,
	symbols: string[],
	onUpdate?: (quote: Quote) => void
): Promise<void> {
	let retryCount = 0;
	let retryDelay = INITIAL_RETRY_DELAY_MS;

	while (subscriptionState.active) {
		try {
			for await (const result of client.subscribeMarketData({ symbols })) {
				// Reset retry count on successful connection
				retryCount = 0;
				retryDelay = INITIAL_RETRY_DELAY_MS;

				subscriptionState.lastUpdate = new Date();
				subscriptionState.updateCount++;

				// Extract quote from the update
				const response = result.data;
				if (response.update?.case === "quote" && onUpdate) {
					onUpdate(response.update.value);
				}

				// Log periodic updates (every 100 updates)
				if (subscriptionState.updateCount % 100 === 0) {
					log.info({ updateCount: subscriptionState.updateCount }, "Received market data updates");
				}

				// Check if we should stop
				if (!subscriptionState.active) {
					return;
				}
			}
		} catch (error) {
			if (!subscriptionState.active) {
				// Expected - subscription was stopped
				return;
			}

			// Check if this is a connection error (execution-engine not ready)
			const isConnectionError =
				error instanceof Error &&
				(error.message.includes("UNAVAILABLE") ||
					error.message.includes("ECONNREFUSED") ||
					error.cause?.toString().includes("ECONNREFUSED"));

			if (isConnectionError && retryCount < MAX_CONNECTION_RETRIES) {
				retryCount++;
				log.info(
					{ retryDelayMs: retryDelay, attempt: retryCount, maxAttempts: MAX_CONNECTION_RETRIES },
					"Execution engine not ready, retrying"
				);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));
				// Exponential backoff with max 30s
				retryDelay = Math.min(retryDelay * 2, 30000);
				continue;
			}

			throw error;
		}
	}
}

/**
 * Stop the market data subscription
 */
export async function stopMarketDataSubscription(): Promise<void> {
	if (!subscriptionState.active) {
		return;
	}

	log.info({}, "Stopping subscription");

	subscriptionState.active = false;

	if (subscriptionState.abortController) {
		subscriptionState.abortController.abort();
		subscriptionState.abortController = null;
	}

	// Give the loop time to exit cleanly
	await new Promise((resolve) => setTimeout(resolve, 100));

	log.info({ updateCount: subscriptionState.updateCount }, "Subscription stopped");
}

/**
 * Get current subscription status
 */
export function getSubscriptionStatus(): {
	active: boolean;
	symbols: string[];
	lastUpdate: Date | null;
	updateCount: number;
} {
	return {
		active: subscriptionState.active,
		symbols: subscriptionState.symbols,
		lastUpdate: subscriptionState.lastUpdate,
		updateCount: subscriptionState.updateCount,
	};
}
