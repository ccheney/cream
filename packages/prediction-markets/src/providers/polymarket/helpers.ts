/**
 * Polymarket API Helper Functions
 *
 * Utility functions for rate limiting, error handling, and common operations.
 */

import type { PredictionMarketType } from "@cream/domain";
import { AuthenticationError, RateLimitError } from "../../types.js";
import { DEFAULT_SEARCH_QUERIES, POLYMARKET_RATE_LIMITS } from "./types.js";

export interface RateLimiterState {
  lastRequestTime: number;
  requestCount: number;
}

/**
 * Create a new rate limiter state
 */
export function createRateLimiterState(): RateLimiterState {
  return {
    lastRequestTime: 0,
    requestCount: 0,
  };
}

/**
 * Enforce rate limiting for Polymarket API requests
 */
export async function enforceRateLimit(
  state: RateLimiterState,
  rateLimit: number = POLYMARKET_RATE_LIMITS.gamma_markets
): Promise<void> {
  const now = Date.now();
  const elapsed = now - state.lastRequestTime;

  if (elapsed < 10000) {
    state.requestCount++;
    if (state.requestCount >= rateLimit) {
      const waitTime = 10000 - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      state.requestCount = 0;
    }
  } else {
    state.requestCount = 1;
  }

  state.lastRequestTime = Date.now();
}

/**
 * Handle API errors and convert to appropriate error types
 */
export function handleApiError(error: unknown): never {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      throw new AuthenticationError("POLYMARKET", "Authentication failed - check API credentials");
    }

    if (message.includes("429") || message.includes("rate limit")) {
      throw new RateLimitError("POLYMARKET", 10000);
    }
  }

  throw error;
}

/**
 * Parse a numeric value that may be a string or number
 */
export function parseNumericValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "string" ? Number.parseFloat(value) : value;
}

/**
 * Get market type from search query
 */
export function getMarketTypeFromQuery(
  query: string
): (typeof PredictionMarketType.options)[number] {
  const queryLower = query.toLowerCase();

  for (const [type, queries] of Object.entries(DEFAULT_SEARCH_QUERIES)) {
    for (const q of queries) {
      if (queryLower.includes(q.toLowerCase())) {
        return type as (typeof PredictionMarketType.options)[number];
      }
    }
  }

  return "ECONOMIC_DATA";
}

/**
 * Get related instruments for a market type
 */
export function getRelatedInstruments(marketType: string): string[] {
  switch (marketType) {
    case "FED_RATE":
      return ["XLF", "TLT", "IYR", "SHY"];
    case "ECONOMIC_DATA":
      return ["SPY", "QQQ", "TLT"];
    case "RECESSION":
      return ["SPY", "VIX", "TLT", "GLD"];
    default:
      return [];
  }
}
