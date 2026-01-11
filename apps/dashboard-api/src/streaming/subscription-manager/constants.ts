/**
 * Subscription Manager Constants
 *
 * Configuration constants for options subscription management.
 */

/** Maximum contracts per Massive WebSocket connection */
export const MAX_CONTRACTS_PER_CONNECTION = 1000;

/** Threshold to spawn new connection (90% of limit) */
export const CONNECTION_SPAWN_THRESHOLD = 900;

/** Maximum number of connection pools */
export const MAX_CONNECTION_POOLS = 5;

/** Debounce delay for unsubscribe (ms) */
export const UNSUBSCRIBE_DEBOUNCE_MS = 1000;

/** Cache TTL for options quotes (ms) */
export const CACHE_TTL_MS = 30_000;

/** Significant price move threshold for cache invalidation */
export const SIGNIFICANT_MOVE_THRESHOLD = 0.01;
