/**
 * Alpaca Calendar and Clock API Client
 *
 * HTTP client for Alpaca's market calendar and clock endpoints.
 * Used by AlpacaCalendarService for PAPER/LIVE modes.
 *
 * @see https://docs.alpaca.markets/reference/getcalendar-1
 * @see https://docs.alpaca.markets/reference/getclock-1
 */

import { z } from "zod";
import {
  type AlpacaCalendarResponse,
  AlpacaCalendarResponseSchema,
  type AlpacaClockResponse,
  AlpacaClockResponseSchema,
  type CalendarDay,
  type MarketClock,
} from "./types";

// ============================================
// Types
// ============================================

export type AlpacaEnvironment = "PAPER" | "LIVE";

export interface AlpacaCalendarClientConfig {
  apiKey: string;
  apiSecret: string;
  environment: AlpacaEnvironment;
}

export type CalendarErrorCode =
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export class CalendarClientError extends Error {
  constructor(
    message: string,
    public readonly code: CalendarErrorCode,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = "CalendarClientError";
  }
}

// ============================================
// Constants
// ============================================

const ENDPOINTS = {
  PAPER: "https://paper-api.alpaca.markets",
  LIVE: "https://api.alpaca.markets",
} as const;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ============================================
// Utilities
// ============================================

/**
 * Map HTTP status to error code.
 */
function mapHttpStatusToErrorCode(status: number): CalendarErrorCode {
  switch (status) {
    case 401:
    case 403:
      return "INVALID_CREDENTIALS";
    case 429:
      return "RATE_LIMITED";
    default:
      return "UNKNOWN";
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format date to YYYY-MM-DD string.
 */
function formatDateStr(date: Date | string): string {
  if (typeof date === "string") {
    return date.slice(0, 10);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Map Alpaca calendar response to domain CalendarDay.
 */
function mapCalendarResponse(response: AlpacaCalendarResponse): CalendarDay {
  return {
    date: response.date,
    open: response.open,
    close: response.close,
    sessionOpen: response.session_open,
    sessionClose: response.session_close,
  };
}

/**
 * Map Alpaca clock response to domain MarketClock.
 */
function mapClockResponse(response: AlpacaClockResponse): MarketClock {
  return {
    isOpen: response.is_open,
    timestamp: new Date(response.timestamp),
    nextOpen: new Date(response.next_open),
    nextClose: new Date(response.next_close),
  };
}

// ============================================
// Client Implementation
// ============================================

/**
 * Alpaca Calendar and Clock API client.
 *
 * Features:
 * - Authenticated requests using APCA-API-KEY-ID/APCA-API-SECRET-KEY headers
 * - Automatic retry with exponential backoff for transient errors
 * - Zod validation of API responses
 * - Maps snake_case wire types to camelCase domain types
 *
 * @example
 * ```typescript
 * const client = new AlpacaCalendarClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   environment: "PAPER",
 * });
 *
 * const calendar = await client.getCalendar("2026-01-01", "2026-01-31");
 * const clock = await client.getClock();
 * ```
 */
export class AlpacaCalendarClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: AlpacaCalendarClientConfig) {
    this.baseUrl = ENDPOINTS[config.environment];
    this.headers = {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
      "Content-Type": "application/json",
    };
  }

  /**
   * Get market calendar for a date range.
   *
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @returns Array of calendar days in the range
   */
  async getCalendar(start: Date | string, end: Date | string): Promise<CalendarDay[]> {
    const startStr = formatDateStr(start);
    const endStr = formatDateStr(end);
    const path = `/v2/calendar?start=${startStr}&end=${endStr}`;

    const rawResponse = await this.request<unknown[]>(path);

    // Validate each item in the response array
    const validated = z.array(AlpacaCalendarResponseSchema).safeParse(rawResponse);
    if (!validated.success) {
      throw new CalendarClientError(
        `Invalid calendar response: ${validated.error.message}`,
        "VALIDATION_ERROR"
      );
    }

    return validated.data.map(mapCalendarResponse);
  }

  /**
   * Get current market clock status.
   *
   * @returns Current market clock with open status and next open/close times
   */
  async getClock(): Promise<MarketClock> {
    const path = "/v2/clock";
    const rawResponse = await this.request<unknown>(path);

    const validated = AlpacaClockResponseSchema.safeParse(rawResponse);
    if (!validated.success) {
      throw new CalendarClientError(
        `Invalid clock response: ${validated.error.message}`,
        "VALIDATION_ERROR"
      );
    }

    return mapClockResponse(validated.data);
  }

  /**
   * Make an authenticated request with retry logic.
   */
  private async request<T>(path: string, retries = MAX_RETRIES): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.headers,
        });

        if (!response.ok) {
          const errorCode = mapHttpStatusToErrorCode(response.status);

          // Retry on rate limiting
          if (response.status === 429 && attempt < retries) {
            const backoffMs = INITIAL_BACKOFF_MS * 2 ** attempt;
            await sleep(backoffMs);
            continue;
          }

          const errorBody = await response.text();
          let errorMessage = `Alpaca Calendar API error: ${response.status}`;

          try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.message || errorMessage;
          } catch {
            errorMessage = errorBody || errorMessage;
          }

          throw new CalendarClientError(errorMessage, errorCode);
        }

        const text = await response.text();
        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof CalendarClientError) {
          throw error;
        }

        // Retry on network errors
        if (attempt < retries) {
          const backoffMs = INITIAL_BACKOFF_MS * 2 ** attempt;
          await sleep(backoffMs);
          continue;
        }

        throw new CalendarClientError(
          `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
          "NETWORK_ERROR",
          error instanceof Error ? error : undefined
        );
      }
    }

    // Should not reach here, but TypeScript needs this
    throw new CalendarClientError("Max retries exceeded", "NETWORK_ERROR");
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new AlpacaCalendarClient instance.
 *
 * @param config - Client configuration
 * @returns Configured client instance
 */
export function createAlpacaCalendarClient(
  config: AlpacaCalendarClientConfig
): AlpacaCalendarClient {
  return new AlpacaCalendarClient(config);
}
