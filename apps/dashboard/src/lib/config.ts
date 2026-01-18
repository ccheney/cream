/**
 * Dashboard Configuration
 *
 * Centralized configuration for API URLs and environment settings.
 * All values can be overridden via environment variables.
 */

/**
 * Get NEXT_PUBLIC_CREAM_ENV for client-side code.
 * Defaults to PAPER for local development.
 */
function getClientEnv(): "PAPER" | "LIVE" {
	const env = process.env.NEXT_PUBLIC_CREAM_ENV;
	if (!env) {
		// Default to PAPER for local development
		return "PAPER";
	}
	if (!["PAPER", "LIVE"].includes(env)) {
		return "PAPER";
	}
	return env as "PAPER" | "LIVE";
}

export const config = {
	api: {
		/** Base URL for the dashboard API */
		baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
	},
	websocket: {
		/** WebSocket URL for real-time updates */
		url: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws",
		/** Reconnection delay in milliseconds */
		reconnectDelay: 3000,
		/** Maximum reconnection attempts before giving up */
		maxReconnectAttempts: 10,
	},
	environment: getClientEnv(),
} as const;

/** Type-safe access to configuration */
export type Config = typeof config;

/** Check if running in production environment */
export const isProduction = config.environment === "LIVE";

/** Check if running in paper trading mode */
export const isPaper = config.environment === "PAPER";

