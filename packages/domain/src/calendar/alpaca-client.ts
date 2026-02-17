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
import { CalendarClientError, type CalendarErrorCode } from "./client-error";
import {
	type AlpacaCalendarResponse,
	AlpacaCalendarResponseSchema,
	type AlpacaClockResponse,
	AlpacaClockResponseSchema,
	type CalendarDay,
	type MarketClock,
} from "./types";

export { CalendarClientError };
export type { CalendarErrorCode };

// ============================================
// Types
// ============================================

export type AlpacaEnvironment = "PAPER" | "LIVE";

export interface AlpacaCalendarClientConfig {
	apiKey: string;
	apiSecret: string;
	environment: AlpacaEnvironment;
	/** Maximum retry attempts (default: 3) */
	maxRetries?: number;
	/** Initial backoff in ms before exponential increase (default: 1000) */
	initialBackoffMs?: number;
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

const sleep = Bun.sleep;

interface RequestAttemptResult<T> {
	readonly shouldRetry: boolean;
	readonly data?: T;
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
 *   apiKey: Bun.env.ALPACA_KEY!,
 *   apiSecret: Bun.env.ALPACA_SECRET!,
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
	private readonly maxRetries: number;
	private readonly initialBackoffMs: number;

	constructor(config: AlpacaCalendarClientConfig) {
		this.baseUrl = ENDPOINTS[config.environment];
		this.headers = {
			"APCA-API-KEY-ID": config.apiKey,
			"APCA-API-SECRET-KEY": config.apiSecret,
			"Content-Type": "application/json",
		};
		this.maxRetries = config.maxRetries ?? MAX_RETRIES;
		this.initialBackoffMs = config.initialBackoffMs ?? INITIAL_BACKOFF_MS;
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
				"VALIDATION_ERROR",
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
				"VALIDATION_ERROR",
			);
		}

		return mapClockResponse(validated.data);
	}

	/**
	 * Make an authenticated request with retry logic.
	 */
	private async request<T>(path: string): Promise<T> {
		const url = `${this.baseUrl}${path}`;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			const result = await this.requestAttempt<T>(url, attempt);
			if (!result.shouldRetry) {
				if (result.data === undefined) {
					throw new CalendarClientError("Response data missing", "UNKNOWN");
				}
				return result.data;
			}
		}

		// Should not reach here, but TypeScript needs this
		throw new CalendarClientError("Max retries exceeded", "NETWORK_ERROR");
	}

	private async requestAttempt<T>(url: string, attempt: number): Promise<RequestAttemptResult<T>> {
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: this.headers,
			});
			if (!response.ok) {
				return this.handleHttpFailure(response, attempt);
			}
			return {
				shouldRetry: false,
				data: await this.parseJsonResponse<T>(response),
			};
		} catch (error) {
			if (error instanceof CalendarClientError) {
				throw error;
			}
			if (this.canRetry(attempt)) {
				await this.waitForRetry(attempt);
				return { shouldRetry: true };
			}
			throw this.createNetworkError(error);
		}
	}

	private async handleHttpFailure(
		response: Response,
		attempt: number,
	): Promise<RequestAttemptResult<never>> {
		if (response.status === 429 && this.canRetry(attempt)) {
			await this.waitForRetry(attempt);
			return { shouldRetry: true };
		}
		throw new CalendarClientError(
			await this.extractErrorMessage(response),
			mapHttpStatusToErrorCode(response.status),
		);
	}

	private async parseJsonResponse<T>(response: Response): Promise<T> {
		const text = await response.text();
		return JSON.parse(text) as T;
	}

	private async extractErrorMessage(response: Response): Promise<string> {
		const fallback = `Alpaca Calendar API error: ${response.status}`;
		const errorBody = await response.text();
		if (!errorBody) {
			return fallback;
		}
		try {
			const parsed = JSON.parse(errorBody) as { message?: unknown };
			return typeof parsed.message === "string" && parsed.message.length > 0
				? parsed.message
				: fallback;
		} catch {
			return errorBody;
		}
	}

	private canRetry(attempt: number): boolean {
		return attempt < this.maxRetries;
	}

	private async waitForRetry(attempt: number): Promise<void> {
		const backoffMs = this.initialBackoffMs * 2 ** attempt;
		await sleep(backoffMs);
	}

	private createNetworkError(error: unknown): CalendarClientError {
		const message = error instanceof Error ? error.message : "Unknown error";
		return new CalendarClientError(
			`Network error: ${message}`,
			"NETWORK_ERROR",
			error instanceof Error ? error : undefined,
		);
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
	config: AlpacaCalendarClientConfig,
): AlpacaCalendarClient {
	return new AlpacaCalendarClient(config);
}
