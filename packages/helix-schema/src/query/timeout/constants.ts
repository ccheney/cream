/**
 * Constants for HelixDB query timeout handling.
 * @module
 */

import { z } from "zod/v4";
import type { TimeoutConfig } from "./types.js";

/**
 * Default timeout for vector search queries (ms)
 */
export const DEFAULT_VECTOR_TIMEOUT_MS = 10;

/**
 * Default timeout for graph traversal queries (ms)
 */
export const DEFAULT_GRAPH_TIMEOUT_MS = 5;

/**
 * Default timeout for combined (hybrid) queries (ms)
 */
export const DEFAULT_COMBINED_TIMEOUT_MS = 20;

/**
 * Default cache TTL (1 hour in ms)
 */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Stale embedding threshold (24 hours in ms)
 */
export const STALE_EMBEDDING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Timeout rate alert threshold (5%)
 */
export const TIMEOUT_RATE_ALERT_THRESHOLD = 0.05;

/**
 * Query type enum
 */
export const QueryType = z.enum(["vector", "graph", "combined"]);
export type QueryType = z.infer<typeof QueryType>;

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
	vectorTimeoutMs: DEFAULT_VECTOR_TIMEOUT_MS,
	graphTimeoutMs: DEFAULT_GRAPH_TIMEOUT_MS,
	combinedTimeoutMs: DEFAULT_COMBINED_TIMEOUT_MS,
};
