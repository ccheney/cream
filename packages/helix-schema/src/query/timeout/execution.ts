/**
 * Core timeout execution for HelixDB queries.
 * @module
 */

import { DEFAULT_TIMEOUT_CONFIG, type QueryType } from "./constants.js";
import type { QueryFunction, TimeoutConfig } from "./types.js";

/**
 * Get timeout for a query type.
 *
 * @param queryType - Type of query
 * @param config - Timeout configuration
 * @returns Timeout in milliseconds
 */
export function getTimeoutForQueryType(
  queryType: QueryType,
  config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG
): number {
  switch (queryType) {
    case "vector":
      return config.vectorTimeoutMs;
    case "graph":
      return config.graphTimeoutMs;
    case "combined":
      return config.combinedTimeoutMs;
    default:
      return config.combinedTimeoutMs;
  }
}

/**
 * Execute a query with timeout.
 *
 * @param queryFn - Query function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Query result or timeout error
 */
export async function withTimeout<T>(
  queryFn: QueryFunction<T>,
  timeoutMs: number
): Promise<{ data: T[]; timedOut: boolean; executionTimeMs: number }> {
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), timeoutMs)
      ),
    ]);

    return {
      data: result,
      timedOut: false,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "Query timeout";
    return {
      data: [],
      timedOut: isTimeout,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
