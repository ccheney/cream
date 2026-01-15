/**
 * Shared Options WebSocket Connection
 *
 * Alpaca only allows ONE WebSocket connection per account for options data.
 * This module provides a singleton connection that can be shared by:
 * - options-data.ts (streaming quotes to dashboard)
 * - indicator service (calculating IV, skew, put/call ratio)
 *
 * The connection is established once at app startup and stays open.
 *
 * @see https://docs.alpaca.markets/docs/real-time-option-data
 */

import {
	type AlpacaWebSocketClient,
	type AlpacaWsEvent,
	createAlpacaOptionsClientFromEnv,
	isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";

// ============================================
// Singleton State
// ============================================

let sharedClient: AlpacaWebSocketClient | null = null;
let connectionPromise: Promise<AlpacaWebSocketClient | null> | null = null;
let isShuttingDown = false;

// Event handlers registered by consumers
const eventHandlers: Set<(event: AlpacaWsEvent) => void> = new Set();

// ============================================
// Internal Event Handler
// ============================================

/**
 * Internal handler that broadcasts events to all registered consumers.
 */
function broadcastEvent(event: AlpacaWsEvent): void {
	// Log connection lifecycle events
	// Note: Disconnects/reconnects with code 1000 (normal close) are expected
	// during quiet market periods when server closes idle connections.
	switch (event.type) {
		case "connected":
			log.debug("Shared Options WebSocket connected");
			break;
		case "authenticated":
			log.info("Shared Options WebSocket authenticated");
			break;
		case "disconnected":
			// Code 1000 is normal close (server idle timeout) - log at debug level
			if (event.reason.includes("code 1000")) {
				log.debug({ reason: event.reason }, "Shared Options WebSocket disconnected (idle timeout)");
			} else {
				log.warn({ reason: event.reason }, "Shared Options WebSocket disconnected");
			}
			// Auto-reconnect is built into the client
			break;
		case "reconnecting":
			// First few reconnect attempts are expected after idle timeout
			if (event.attempt <= 2) {
				log.debug({ attempt: event.attempt }, "Shared Options WebSocket reconnecting");
			} else {
				log.info({ attempt: event.attempt }, "Shared Options WebSocket reconnecting");
			}
			break;
		case "error":
			log.error({ code: event.code, message: event.message }, "Shared Options WebSocket error");
			break;
	}

	// Broadcast to all registered handlers
	for (const handler of eventHandlers) {
		try {
			handler(event);
		} catch (error) {
			log.error({ error }, "Error in options WebSocket event handler");
		}
	}
}

// ============================================
// Public API
// ============================================

/**
 * Get the shared options WebSocket client.
 * Creates and connects if not already connected.
 * Returns null if Alpaca is not configured.
 */
export async function getSharedOptionsWebSocket(): Promise<AlpacaWebSocketClient | null> {
	if (isShuttingDown) {
		return null;
	}

	// Return existing connected client
	if (sharedClient?.isConnected()) {
		return sharedClient;
	}

	// Wait for in-progress connection
	if (connectionPromise) {
		return connectionPromise;
	}

	// Check if Alpaca is configured
	if (!isAlpacaConfigured()) {
		log.warn("ALPACA_KEY/ALPACA_SECRET not set, options WebSocket disabled");
		return null;
	}

	// Start new connection
	connectionPromise = connectSharedClient();
	const result = await connectionPromise;
	connectionPromise = null;
	return result;
}

/**
 * Connect the shared client (internal).
 */
async function connectSharedClient(): Promise<AlpacaWebSocketClient | null> {
	try {
		// Clean up any existing client
		if (sharedClient) {
			sharedClient.disconnect();
			sharedClient = null;
		}

		log.info("Initializing shared Options WebSocket connection");
		sharedClient = createAlpacaOptionsClientFromEnv();
		sharedClient.on(broadcastEvent);

		await sharedClient.connect();
		log.info("Shared Options WebSocket connection established");
		return sharedClient;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		log.error({ error: errorMsg }, "Failed to connect shared Options WebSocket");
		sharedClient?.disconnect();
		sharedClient = null;
		return null;
	}
}

/**
 * Register an event handler for options WebSocket events.
 * Used by consumers (options-data.ts, indicator service) to receive events.
 */
export function onOptionsEvent(handler: (event: AlpacaWsEvent) => void): void {
	eventHandlers.add(handler);
}

/**
 * Unregister an event handler.
 */
export function offOptionsEvent(handler: (event: AlpacaWsEvent) => void): void {
	eventHandlers.delete(handler);
}

/**
 * Check if the shared connection is connected and authenticated.
 */
export function isOptionsWebSocketConnected(): boolean {
	return sharedClient?.isConnected() ?? false;
}

/**
 * Shutdown the shared connection.
 * Called during app shutdown.
 */
export function shutdownSharedOptionsWebSocket(): void {
	isShuttingDown = true;
	log.info("Shutting down shared Options WebSocket");

	if (sharedClient) {
		sharedClient.disconnect();
		sharedClient = null;
	}

	eventHandlers.clear();
	connectionPromise = null;
	log.info("Shared Options WebSocket shutdown complete");
}

/**
 * Initialize the shared connection at app startup.
 * This ensures the connection is ready before any requests come in.
 */
export async function initSharedOptionsWebSocket(): Promise<void> {
	isShuttingDown = false;
	await getSharedOptionsWebSocket();
}
