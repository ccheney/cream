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

// ============================================
// Rate Limiter
// ============================================

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
	private tokens: number;
	private lastRefill: number;

	constructor(private config: RateLimitConfig) {
		this.tokens = config.maxRequests;
		this.lastRefill = Date.now();
	}

	/**
	 * Acquire a token for making a request.
	 * Returns immediately if tokens are available, otherwise waits.
	 */
	async acquire(): Promise<void> {
		this.refill();

		if (this.tokens > 0) {
			this.tokens--;
			return;
		}

		// Wait until next refill
		const waitTime = this.config.intervalMs - (Date.now() - this.lastRefill);
		if (waitTime > 0) {
			await this.sleep(waitTime);
			this.refill();
		}

		this.tokens--;
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;

		if (elapsed >= this.config.intervalMs) {
			this.tokens = this.config.maxRequests;
			this.lastRefill = now;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

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
		const url = this.buildUrl(path, options.params);
		const headers = this.buildHeaders(options.headers);
		const timeout = options.timeoutMs ?? this.config.timeoutMs;
		const method = options.method ?? "GET";

		// Apply rate limiting
		if (!options.skipRateLimit && this.rateLimiter) {
			await this.rateLimiter.acquire();
		}

		const retryConfig = this.config.retry ?? DEFAULT_RETRY;
		let lastError: ApiError | undefined;
		const startTime = Date.now();

		log.debug({ method, path, timeout }, "Market data API request");

		for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
			try {
				const response = await this.executeRequest(url, {
					method,
					headers,
					body: options.body ? JSON.stringify(options.body) : undefined,
					timeout,
				});

				// Parse and validate response
				const data = await response.json();

				const latencyMs = Date.now() - startTime;
				log.debug({ method, path, status: response.status, latencyMs }, "Market data API response");

				if (schema) {
					return schema.parse(data);
				}

				return data;
			} catch (error) {
				lastError = this.classifyError(error);

				if (!lastError.retryable || attempt >= retryConfig.maxRetries) {
					const latencyMs = Date.now() - startTime;
					log.error(
						{ method, path, status: lastError.status, error: lastError.message, latencyMs },
						"Market data API error",
					);
					throw lastError;
				}

				// Exponential backoff
				const delay = Math.min(
					retryConfig.initialDelayMs * retryConfig.backoffMultiplier ** attempt,
					retryConfig.maxDelayMs,
				);

				log.warn(
					{ method, path, attempt: attempt + 1, delayMs: delay, error: lastError.message },
					"Market data API retry",
				);

				await this.sleep(delay);
			}
		}

		throw lastError ?? new Error("Request failed");
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
			// Timeout or network error
			if (error.name === "AbortError") {
				return {
					status: 0,
					statusText: "Timeout",
					message: "Request timed out",
					retryable: true,
				};
			}

			// Zod validation errors are not retryable
			if (error.name === "ZodError") {
				return {
					status: 0,
					statusText: "Validation Error",
					message: error.message,
					retryable: false,
				};
			}

			// Network error
			return {
				status: 0,
				statusText: "Network Error",
				message: error.message,
				retryable: true,
			};
		}

		// HTTP error response
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
