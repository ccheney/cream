/**
 * Base REST Client with Rate Limiting and Retry Logic
 *
 * Provides a robust HTTP client foundation for all data provider APIs.
 * Features:
 * - Rate limiting (token bucket algorithm)
 * - Retry with exponential backoff
 * - Request/response logging
 * - Error classification
 *
 * @see docs/plans/02-data-layer.md
 */

import type { z } from "zod";
import { log } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";

// ============================================
// Types
// ============================================

/**
 * Rate limiter configuration.
 */
export interface RateLimitConfig {
	/** Maximum requests per interval */
	maxRequests: number;
	/** Interval in milliseconds */
	intervalMs: number;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number;
	/** Initial delay in milliseconds */
	initialDelayMs: number;
	/** Maximum delay in milliseconds */
	maxDelayMs: number;
	/** Backoff multiplier */
	backoffMultiplier: number;
}

/**
 * Client configuration.
 */
export interface ClientConfig {
	/** Base URL for the API */
	baseUrl: string;
	/** API key for authentication */
	apiKey?: string;
	/** Rate limiting configuration */
	rateLimit?: RateLimitConfig;
	/** Retry configuration */
	retry?: RetryConfig;
	/** Request timeout in milliseconds */
	timeoutMs?: number;
	/** Additional headers */
	headers?: Record<string, string>;
}

/**
 * Request options.
 */
export interface RequestOptions {
	/** HTTP method */
	method?: "GET" | "POST" | "PUT" | "DELETE";
	/** Query parameters */
	params?: Record<string, string | number | boolean | undefined>;
	/** Request body */
	body?: unknown;
	/** Additional headers */
	headers?: Record<string, string>;
	/** Override timeout */
	timeoutMs?: number;
	/** Skip rate limiting */
	skipRateLimit?: boolean;
}

/**
 * API error response.
 */
export interface ApiError {
	status: number;
	statusText: string;
	message: string;
	retryable: boolean;
	response?: unknown;
}

interface PreparedRequest {
	url: string;
	headers: Record<string, string>;
	timeout: number;
	method: "GET" | "POST" | "PUT" | "DELETE";
	body?: string;
	path: string;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
	maxRequests: 100,
	intervalMs: 60000, // 100 requests per minute
};

export const DEFAULT_RETRY: RetryConfig = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
};

export const DEFAULT_TIMEOUT_MS = 30000;

export { RateLimiter };

// ============================================
// Base REST Client
// ============================================

/**
 * Base REST client with rate limiting and retry logic.
 */
export class RestClient {
	private rateLimiter?: RateLimiter;
	private config: Required<Pick<ClientConfig, "baseUrl" | "timeoutMs">> & ClientConfig;

	constructor(config: ClientConfig) {
		this.config = {
			...config,
			timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		};

		if (config.rateLimit) {
			this.rateLimiter = new RateLimiter(config.rateLimit);
		}
	}

	/**
	 * Make an HTTP request with rate limiting and retry.
	 */
	async request<S extends z.ZodTypeAny>(
		path: string,
		options: RequestOptions,
		schema: S,
	): Promise<z.output<S>>;
	async request(path: string, options?: RequestOptions): Promise<unknown>;
	async request<S extends z.ZodTypeAny>(
		path: string,
		options: RequestOptions = {},
		schema?: S,
	): Promise<z.output<S> | unknown> {
		await this.acquireRateLimitToken(options.skipRateLimit ?? false);

		const prepared = this.prepareRequest(path, options);
		log.debug(
			{ method: prepared.method, path: prepared.path, timeout: prepared.timeout },
			"Market data API request",
		);

		return this.executeWithRetry(prepared, schema);
	}

	/**
	 * Make a GET request with schema validation.
	 */
	async get<S extends z.ZodTypeAny>(
		path: string,
		params: Record<string, string | number | boolean | undefined>,
		schema: S,
	): Promise<z.output<S>>;
	/**
	 * Make a GET request with explicit type hint (no validation).
	 */
	async get<T>(path: string): Promise<T>;
	/**
	 * Make a GET request (untyped).
	 */
	async get(
		path: string,
		params?: Record<string, string | number | boolean | undefined>,
	): Promise<unknown>;
	async get<S extends z.ZodTypeAny>(
		path: string,
		params?: Record<string, string | number | boolean | undefined>,
		schema?: S,
	): Promise<z.output<S> | unknown> {
		if (schema) {
			return this.request(path, { method: "GET", params }, schema);
		}
		return this.request(path, { method: "GET", params });
	}

	/**
	 * Make a POST request.
	 */
	async post<S extends z.ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.output<S>>;
	async post(path: string, body?: unknown): Promise<unknown>;
	async post<S extends z.ZodTypeAny>(
		path: string,
		body?: unknown,
		schema?: S,
	): Promise<z.output<S> | unknown> {
		if (schema) {
			return this.request(path, { method: "POST", body }, schema);
		}
		return this.request(path, { method: "POST", body });
	}

	/**
	 * Execute the actual HTTP request.
	 */
	private async executeRequest(
		url: string,
		options: {
			method: string;
			headers: Record<string, string>;
			body?: string;
			timeout: number;
		},
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), options.timeout);

		try {
			const response = await fetch(url, {
				method: options.method,
				headers: options.headers,
				body: options.body,
				signal: controller.signal,
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw {
					status: response.status,
					statusText: response.statusText,
					body,
				};
			}

			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private prepareRequest(path: string, options: RequestOptions): PreparedRequest {
		return {
			url: this.buildUrl(path, options.params),
			headers: this.buildHeaders(options.headers),
			timeout: options.timeoutMs ?? this.config.timeoutMs,
			method: options.method ?? "GET",
			body: options.body ? JSON.stringify(options.body) : undefined,
			path,
		};
	}

	private async acquireRateLimitToken(skipRateLimit: boolean): Promise<void> {
		if (skipRateLimit || !this.rateLimiter) {
			return;
		}

		await this.rateLimiter.acquire();
	}

	private async executeWithRetry<S extends z.ZodTypeAny>(
		prepared: PreparedRequest,
		schema?: S,
	): Promise<z.output<S> | unknown> {
		const retryConfig = this.config.retry ?? DEFAULT_RETRY;
		const startTime = Date.now();
		let lastError: ApiError | undefined;

		for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
			try {
				return await this.executeAndParseResponse(prepared, schema, startTime);
			} catch (error) {
				lastError = this.classifyError(error);
				const isFinalAttempt = attempt >= retryConfig.maxRetries;

				if (!lastError.retryable || isFinalAttempt) {
					this.logAndThrowError(prepared, lastError, startTime);
				}

				await this.delayBeforeRetry(prepared, retryConfig, attempt, lastError);
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	private async executeAndParseResponse<S extends z.ZodTypeAny>(
		prepared: PreparedRequest,
		schema: S | undefined,
		startTime: number,
	): Promise<z.output<S> | unknown> {
		const response = await this.executeRequest(prepared.url, {
			method: prepared.method,
			headers: prepared.headers,
			body: prepared.body,
			timeout: prepared.timeout,
		});

		const data = await response.json();
		const latencyMs = Date.now() - startTime;

		log.debug(
			{ method: prepared.method, path: prepared.path, status: response.status, latencyMs },
			"Market data API response",
		);

		return schema ? schema.parse(data) : data;
	}

	private logAndThrowError(prepared: PreparedRequest, error: ApiError, startTime: number): never {
		const latencyMs = Date.now() - startTime;
		log.error(
			{
				method: prepared.method,
				path: prepared.path,
				status: error.status,
				error: error.message,
				latencyMs,
			},
			"Market data API error",
		);
		throw error;
	}

	private async delayBeforeRetry(
		prepared: PreparedRequest,
		retryConfig: RetryConfig,
		attempt: number,
		error: ApiError,
	): Promise<void> {
		const delay = Math.min(
			retryConfig.initialDelayMs * retryConfig.backoffMultiplier ** attempt,
			retryConfig.maxDelayMs,
		);

		log.warn(
			{
				method: prepared.method,
				path: prepared.path,
				attempt: attempt + 1,
				delayMs: delay,
				error: error.message,
			},
			"Market data API retry",
		);

		await this.sleep(delay);
	}

	/**
	 * Build the full URL with query parameters.
	 */
	private buildUrl(
		path: string,
		params?: Record<string, string | number | boolean | undefined>,
	): string {
		const url = new URL(path, this.config.baseUrl);

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) {
					url.searchParams.set(key, String(value));
				}
			}
		}

		return url.toString();
	}

	/**
	 * Build request headers.
	 */
	private buildHeaders(additional?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
			...this.config.headers,
			...additional,
		};

		if (this.config.apiKey) {
			headers.Authorization = `Bearer ${this.config.apiKey}`;
		}

		return headers;
	}

	/**
	 * Classify an error as retryable or not.
	 */
	private classifyError(error: unknown): ApiError {
		if (error instanceof Error) {
			if (error.name === "AbortError") {
				return {
					status: 0,
					statusText: "Timeout",
					message: "Request timed out",
					retryable: true,
				};
			}

			if (error.name === "ZodError") {
				return {
					status: 0,
					statusText: "Validation Error",
					message: error.message,
					retryable: false,
				};
			}

			return {
				status: 0,
				statusText: "Network Error",
				message: error.message,
				retryable: true,
			};
		}

		const httpError = error as {
			status: number;
			statusText: string;
			body?: string;
		};

		const retryable = [408, 429, 500, 502, 503, 504].includes(httpError.status);

		return {
			status: httpError.status,
			statusText: httpError.statusText,
			message: httpError.body ?? httpError.statusText,
			retryable,
			response: httpError.body,
		};
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a REST client with configuration.
 */
export function createRestClient(config: ClientConfig): RestClient {
	return new RestClient(config);
}
