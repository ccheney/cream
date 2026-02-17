/**
 * FRED API client implementation.
 */

import type { z } from "zod";
import { FREDClientError } from "./error.js";
import { RateLimiter } from "./rate-limiter.js";
import {
	type FREDObservationsResponse,
	FREDObservationsResponseSchema,
	type FREDReleaseDatesResponse,
	FREDReleaseDatesResponseSchema,
	type FREDReleaseSeriesResponse,
	FREDReleaseSeriesResponseSchema,
	type FREDReleasesResponse,
	FREDReleasesResponseSchema,
} from "./schemas.js";

export const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

/**
 * FRED API rate limits.
 * Free tier: 120 requests/minute
 */
export const FRED_RATE_LIMITS = {
	free: { maxRequests: 120, intervalMs: 60000 },
} as const;

/**
 * Configuration for FREDClient.
 */
export interface FREDClientConfig {
	/** FRED API key */
	apiKey: string;
	/** Base URL (defaults to FRED API URL) */
	baseUrl?: string;
	/** Request timeout in ms (default: 30000) */
	timeout?: number;
	/** Max retries for failed requests (default: 3) */
	retries?: number;
	/** Base delay between retries in ms (default: 2000) */
	retryDelay?: number;
}

const DEFAULT_FRED_CONFIG: Required<Omit<FREDClientConfig, "apiKey">> = {
	baseUrl: FRED_BASE_URL,
	timeout: 30000,
	retries: 3,
	retryDelay: 2000,
};

const sleep = Bun.sleep;

/**
 * FRED API client with rate limiting and retry logic.
 */
export class FREDClient {
	private readonly config: Required<FREDClientConfig>;
	private readonly rateLimiter: RateLimiter;

	constructor(config: FREDClientConfig) {
		this.config = {
			...DEFAULT_FRED_CONFIG,
			...config,
		};
		this.rateLimiter = new RateLimiter(
			FRED_RATE_LIMITS.free.maxRequests,
			FRED_RATE_LIMITS.free.intervalMs,
		);
	}

	private async request<T>(
		endpoint: string,
		params: Record<string, string | number | boolean> = {},
		schema: z.ZodType<T>,
	): Promise<T> {
		await this.rateLimiter.acquire();
		const url = this.buildRequestUrl(endpoint, params);
		let lastError: FREDClientError | null = null;

		for (let attempt = 0; attempt <= this.config.retries; attempt++) {
			try {
				return await this.executeRequest(url, schema);
			} catch (error) {
				lastError = this.normalizeRequestError(error, endpoint);
				if (this.shouldSkipRetry(lastError.code)) {
					throw lastError;
				}
				if (attempt < this.config.retries) {
					await this.waitBeforeRetry(lastError.code, attempt);
				}
			}
		}

		throw lastError ?? new FREDClientError("FRED API request failed", "API_ERROR");
	}

	private buildRequestUrl(
		endpoint: string,
		params: Record<string, string | number | boolean>,
	): URL {
		const url = new URL(`${this.config.baseUrl}${endpoint}`);
		url.searchParams.set("api_key", this.config.apiKey);
		url.searchParams.set("file_type", "json");
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				url.searchParams.set(key, String(value));
			}
		}
		return url;
	}

	private async executeRequest<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
		try {
			const response = await fetch(url.toString(), {
				method: "GET",
				signal: controller.signal,
				headers: { Accept: "application/json" },
			});
			this.assertResponseStatus(response, url.pathname);
			const rawData = await response.json();
			const result = schema.safeParse(rawData);
			if (!result.success) {
				throw new FREDClientError(
					`FRED API response validation failed: ${result.error.message}`,
					"VALIDATION_ERROR",
					result.error,
				);
			}
			return result.data;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private assertResponseStatus(response: Response, endpoint: string): void {
		if (response.status === 429) {
			throw new FREDClientError("FRED API rate limited", "RATE_LIMITED");
		}
		if (response.status === 401) {
			throw new FREDClientError("Invalid FRED API key", "UNAUTHORIZED");
		}
		if (response.status === 404) {
			throw new FREDClientError(`FRED endpoint not found: ${endpoint}`, "NOT_FOUND");
		}
		if (!response.ok) {
			throw new FREDClientError(
				`FRED API error: ${response.status} ${response.statusText}`,
				"API_ERROR",
			);
		}
	}

	private normalizeRequestError(error: unknown, endpoint: string): FREDClientError {
		if (error instanceof FREDClientError) {
			return error;
		}
		if (error instanceof Error && error.name === "AbortError") {
			return new FREDClientError(
				`FRED API request timed out after ${this.config.timeout}ms`,
				"TIMEOUT",
				error,
			);
		}
		if (error instanceof Error) {
			return new FREDClientError(
				`FRED API network error: ${error.message}`,
				"NETWORK_ERROR",
				error,
			);
		}
		return new FREDClientError(`Unknown FRED API error for ${endpoint}`, "API_ERROR", error);
	}

	private shouldSkipRetry(code: FREDClientError["code"]): boolean {
		return code === "UNAUTHORIZED" || code === "NOT_FOUND" || code === "VALIDATION_ERROR";
	}

	private async waitBeforeRetry(code: FREDClientError["code"], attempt: number): Promise<void> {
		if (code === "RATE_LIMITED") {
			await sleep(20000);
			return;
		}
		const backoff = this.config.retryDelay * 2 ** attempt;
		const jitter = Math.random() * 1000;
		await sleep(backoff + jitter);
	}

	/**
	 * Get upcoming release dates across all releases.
	 */
	async getReleaseDates(
		params: {
			realtime_start?: string;
			realtime_end?: string;
			limit?: number;
			offset?: number;
			order_by?: "release_date" | "release_id" | "release_name";
			sort_order?: "asc" | "desc";
			include_release_dates_with_no_data?: boolean;
		} = {},
	): Promise<FREDReleaseDatesResponse> {
		return this.request("/releases/dates", params, FREDReleaseDatesResponseSchema);
	}

	/**
	 * Get all releases.
	 */
	async getReleases(
		params: {
			realtime_start?: string;
			realtime_end?: string;
			limit?: number;
			offset?: number;
			order_by?: "release_id" | "name" | "press_release" | "realtime_start" | "realtime_end";
			sort_order?: "asc" | "desc";
		} = {},
	): Promise<FREDReleasesResponse> {
		return this.request("/releases", params, FREDReleasesResponseSchema);
	}

	/**
	 * Get series belonging to a specific release.
	 */
	async getReleaseSeries(
		releaseId: number,
		params: {
			realtime_start?: string;
			realtime_end?: string;
			limit?: number;
			offset?: number;
			order_by?:
				| "series_id"
				| "title"
				| "units"
				| "frequency"
				| "seasonal_adjustment"
				| "realtime_start"
				| "realtime_end"
				| "last_updated"
				| "observation_start"
				| "observation_end"
				| "popularity";
			sort_order?: "asc" | "desc";
			filter_variable?: string;
			filter_value?: string;
		} = {},
	): Promise<FREDReleaseSeriesResponse> {
		return this.request(
			"/release/series",
			{ release_id: releaseId, ...params },
			FREDReleaseSeriesResponseSchema,
		);
	}

	/**
	 * Get observations (data points) for a series.
	 */
	async getObservations(
		seriesId: string,
		params: {
			realtime_start?: string;
			realtime_end?: string;
			limit?: number;
			offset?: number;
			sort_order?: "asc" | "desc";
			observation_start?: string;
			observation_end?: string;
			units?: "lin" | "chg" | "ch1" | "pch" | "pc1" | "pca" | "cch" | "cca" | "log";
			frequency?: "d" | "w" | "bw" | "m" | "q" | "sa" | "a";
			aggregation_method?: "avg" | "sum" | "eop";
		} = {},
	): Promise<FREDObservationsResponse> {
		return this.request(
			"/series/observations",
			{ series_id: seriesId, ...params },
			FREDObservationsResponseSchema,
		);
	}

	/**
	 * Get release dates for a specific release.
	 */
	async getReleaseSchedule(
		releaseId: number,
		params: {
			realtime_start?: string;
			realtime_end?: string;
			limit?: number;
			offset?: number;
			sort_order?: "asc" | "desc";
			include_release_dates_with_no_data?: boolean;
		} = {},
	): Promise<FREDReleaseDatesResponse> {
		return this.request(
			"/release/dates",
			{ release_id: releaseId, ...params },
			FREDReleaseDatesResponseSchema,
		);
	}

	/**
	 * Get the latest (most recent) value for a series.
	 */
	async getLatestValue(seriesId: string): Promise<{ date: string; value: number } | null> {
		const response = await this.getObservations(seriesId, {
			sort_order: "desc",
			limit: 1,
		});
		const [observation] = response.observations;
		if (!observation || observation.value === null) {
			return null;
		}
		const numericValue = Number.parseFloat(observation.value);
		if (Number.isNaN(numericValue)) {
			return null;
		}
		return {
			date: observation.date,
			value: numericValue,
		};
	}
}

/**
 * Create a FREDClient instance with the given configuration.
 */
export function createFREDClient(config: FREDClientConfig): FREDClient {
	return new FREDClient(config);
}

/**
 * Create a FREDClient instance using environment variables.
 */
export function createFREDClientFromEnv(): FREDClient {
	const apiKey = Bun.env.FRED_API_KEY;
	if (!apiKey) {
		throw new Error("FRED_API_KEY environment variable is required");
	}
	return new FREDClient({ apiKey });
}
