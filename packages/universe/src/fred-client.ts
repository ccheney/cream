/**
 * FRED (Federal Reserve Economic Data) API Client
 *
 * Provides access to economic release dates and observations from the St. Louis Fed.
 *
 * @see https://fred.stlouisfed.org/docs/api/fred/
 */

import { z } from "zod";

// ============================================
// API Configuration
// ============================================

export const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

/**
 * FRED API rate limits.
 * Free tier: 120 requests/minute
 */
export const FRED_RATE_LIMITS = {
	free: { maxRequests: 120, intervalMs: 60000 },
} as const;

// ============================================
// Response Schemas
// ============================================

/**
 * Single release date entry from /fred/releases/dates endpoint.
 * Used when fetching release dates across all releases.
 */
export const FREDReleaseDateSchema = z.object({
	release_id: z.union([z.number(), z.string().transform(Number)]),
	release_name: z.string().optional(),
	date: z.string(), // YYYY-MM-DD
});
export type FREDReleaseDate = z.infer<typeof FREDReleaseDateSchema>;

/**
 * Response from /fred/releases/dates endpoint.
 * Returns upcoming release dates for all economic data releases.
 */
export const FREDReleaseDatesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	// API uses both 'release_dates' and 'release_date' depending on endpoint
	release_dates: z.array(FREDReleaseDateSchema).optional(),
	release_date: z.array(FREDReleaseDateSchema).optional(),
});
export type FREDReleaseDatesResponse = z.infer<typeof FREDReleaseDatesResponseSchema>;

/**
 * Single observation data point.
 * Value can be '.' for missing data, which transforms to null.
 */
export const FREDObservationSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	date: z.string(), // YYYY-MM-DD
	value: z.string().transform((v) => (v === "." ? null : v)),
});
export type FREDObservation = z.infer<typeof FREDObservationSchema>;

/**
 * Response from /fred/series/observations endpoint.
 * Returns historical observations for a specific data series.
 */
export const FREDObservationsResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	observation_start: z.string(),
	observation_end: z.string(),
	units: z.string(),
	output_type: z.number(),
	file_type: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	observations: z.array(FREDObservationSchema),
});
export type FREDObservationsResponse = z.infer<typeof FREDObservationsResponseSchema>;

/**
 * Single release entry from /fred/releases endpoint.
 */
export const FREDReleaseSchema = z.object({
	id: z.number(),
	realtime_start: z.string(),
	realtime_end: z.string(),
	name: z.string(),
	press_release: z.boolean(),
	link: z.string().optional(),
});
export type FREDRelease = z.infer<typeof FREDReleaseSchema>;

/**
 * Response from /fred/releases endpoint.
 * Returns list of all economic data releases.
 */
export const FREDReleasesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	releases: z.array(FREDReleaseSchema),
});
export type FREDReleasesResponse = z.infer<typeof FREDReleasesResponseSchema>;

/**
 * Series metadata from /fred/series endpoint.
 */
export const FREDSeriesSchema = z.object({
	id: z.string(),
	realtime_start: z.string(),
	realtime_end: z.string(),
	title: z.string(),
	observation_start: z.string(),
	observation_end: z.string(),
	frequency: z.string(),
	frequency_short: z.string(),
	units: z.string(),
	units_short: z.string(),
	seasonal_adjustment: z.string(),
	seasonal_adjustment_short: z.string(),
	last_updated: z.string(),
	popularity: z.number(),
	notes: z.string().optional(),
});
export type FREDSeries = z.infer<typeof FREDSeriesSchema>;

/**
 * Response from /fred/release/series endpoint.
 * Returns series belonging to a specific release.
 */
export const FREDReleaseSeriesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	seriess: z.array(FREDSeriesSchema), // FRED API uses 'seriess' (not a typo)
});
export type FREDReleaseSeriesResponse = z.infer<typeof FREDReleaseSeriesResponseSchema>;

// ============================================
// Static Registries
// ============================================

/**
 * Key economic releases tracked by the system.
 * Release IDs are from FRED's official release calendar.
 * @see https://fred.stlouisfed.org/releases/calendar
 */
export const FRED_RELEASES = {
	CPI: { id: 10, name: "Consumer Price Index", series: ["CPIAUCSL", "CPILFESL", "CPIUFDSL"] },
	EMPLOYMENT: { id: 50, name: "Employment Situation", series: ["PAYEMS", "UNRATE", "CIVPART"] },
	GDP: { id: 53, name: "Gross Domestic Product", series: ["GDPC1", "GDP", "A191RL1Q225SBEA"] },
	FOMC: { id: 101, name: "FOMC Press Release", series: ["FEDFUNDS", "DFEDTARU", "DFEDTARL"] },
	RETAIL_SALES: {
		id: 9,
		name: "Advance Monthly Sales for Retail and Food Services",
		series: ["RSAFS", "RSXFS"],
	},
	INDUSTRIAL_PRODUCTION: {
		id: 13,
		name: "G.17 Industrial Production and Capacity Utilization",
		series: ["INDPRO", "TCU", "CUMFNS"],
	},
	PERSONAL_INCOME: {
		id: 46,
		name: "Personal Income and Outlays",
		series: ["PCE", "PCEPI", "PI", "PSAVERT"],
	},
	TREASURY_RATES: {
		id: 18,
		name: "H.15 Selected Interest Rates",
		series: ["DGS10", "DGS2", "DGS30", "T10Y2Y"],
	},
	CONSUMER_SENTIMENT: { id: 14, name: "Surveys of Consumers", series: ["UMCSENT"] },
	HOUSING_STARTS: { id: 40, name: "New Residential Construction", series: ["HOUST", "PERMIT"] },
	DURABLE_GOODS: {
		id: 37,
		name: "Advance Report on Durable Goods",
		series: ["DGORDER", "NEWORDER"],
	},
	ISM_MANUFACTURING: {
		id: 29,
		name: "ISM Manufacturing: PMI Composite Index",
		series: ["MANEMP", "NAPM"],
	},
	TRADE_BALANCE: {
		id: 99,
		name: "U.S. International Trade in Goods and Services",
		series: ["BOPGSTB", "IEAXGS", "IEAMGS"],
	},
	PPI: { id: 11, name: "Producer Price Index", series: ["PPIACO", "PPIFGS", "PPIFIS"] },
	JOLTS: {
		id: 154,
		name: "Job Openings and Labor Turnover Survey",
		series: ["JTSJOL", "JTSQUR", "JTSHIR"],
	},
} as const;

export type FREDReleaseId = keyof typeof FRED_RELEASES;

/**
 * Data series metadata for common economic indicators.
 */
export const FRED_SERIES = {
	// Inflation
	CPIAUCSL: { name: "CPI All Urban Consumers", unit: "index", frequency: "monthly" },
	CPILFESL: { name: "CPI Less Food and Energy", unit: "index", frequency: "monthly" },
	CPIUFDSL: { name: "CPI Food", unit: "index", frequency: "monthly" },
	PCEPI: { name: "PCE Price Index", unit: "index", frequency: "monthly" },
	PPIACO: { name: "PPI All Commodities", unit: "index", frequency: "monthly" },
	PPIFGS: { name: "PPI Finished Goods", unit: "index", frequency: "monthly" },
	PPIFIS: { name: "PPI Final Demand Services", unit: "index", frequency: "monthly" },

	// Employment
	PAYEMS: { name: "All Employees, Total Nonfarm", unit: "thousands", frequency: "monthly" },
	UNRATE: { name: "Unemployment Rate", unit: "percent", frequency: "monthly" },
	CIVPART: { name: "Labor Force Participation Rate", unit: "percent", frequency: "monthly" },
	JTSJOL: { name: "Job Openings", unit: "thousands", frequency: "monthly" },
	JTSQUR: { name: "Quits Rate", unit: "percent", frequency: "monthly" },
	JTSHIR: { name: "Hires", unit: "thousands", frequency: "monthly" },

	// GDP & Output
	GDPC1: { name: "Real GDP", unit: "billions", frequency: "quarterly" },
	GDP: { name: "Nominal GDP", unit: "billions", frequency: "quarterly" },
	A191RL1Q225SBEA: { name: "Real GDP Growth Rate", unit: "percent", frequency: "quarterly" },
	INDPRO: { name: "Industrial Production Index", unit: "index", frequency: "monthly" },
	TCU: { name: "Capacity Utilization", unit: "percent", frequency: "monthly" },
	CUMFNS: { name: "Capacity Utilization Manufacturing", unit: "percent", frequency: "monthly" },

	// Consumer
	PCE: { name: "Personal Consumption Expenditures", unit: "billions", frequency: "monthly" },
	PI: { name: "Personal Income", unit: "billions", frequency: "monthly" },
	PSAVERT: { name: "Personal Saving Rate", unit: "percent", frequency: "monthly" },
	RSAFS: { name: "Retail Sales", unit: "millions", frequency: "monthly" },
	RSXFS: { name: "Retail Sales Excluding Food Services", unit: "millions", frequency: "monthly" },
	UMCSENT: { name: "Consumer Sentiment", unit: "index", frequency: "monthly" },
	DGORDER: { name: "Durable Goods Orders", unit: "millions", frequency: "monthly" },
	NEWORDER: { name: "New Orders Nondefense Capital Goods", unit: "millions", frequency: "monthly" },

	// Interest Rates
	FEDFUNDS: { name: "Federal Funds Rate", unit: "percent", frequency: "daily" },
	DFEDTARU: { name: "Fed Funds Target Upper", unit: "percent", frequency: "daily" },
	DFEDTARL: { name: "Fed Funds Target Lower", unit: "percent", frequency: "daily" },
	DGS10: { name: "10-Year Treasury", unit: "percent", frequency: "daily" },
	DGS2: { name: "2-Year Treasury", unit: "percent", frequency: "daily" },
	DGS30: { name: "30-Year Treasury", unit: "percent", frequency: "daily" },
	T10Y2Y: { name: "10Y-2Y Treasury Spread", unit: "percent", frequency: "daily" },

	// Housing
	HOUST: { name: "Housing Starts", unit: "thousands", frequency: "monthly" },
	PERMIT: { name: "Building Permits", unit: "thousands", frequency: "monthly" },

	// Manufacturing
	MANEMP: { name: "Manufacturing Employment", unit: "thousands", frequency: "monthly" },
	NAPM: { name: "ISM Manufacturing PMI", unit: "index", frequency: "monthly" },

	// Trade
	BOPGSTB: { name: "Trade Balance Goods & Services", unit: "millions", frequency: "monthly" },
	IEAXGS: { name: "Exports of Goods & Services", unit: "billions", frequency: "monthly" },
	IEAMGS: { name: "Imports of Goods & Services", unit: "billions", frequency: "monthly" },
} as const;

export type FREDSeriesId = keyof typeof FRED_SERIES;

// ============================================
// Impact Classification
// ============================================

/**
 * Release IDs that have high market impact.
 * These releases typically cause significant market volatility.
 */
const HIGH_IMPACT_RELEASE_IDS = new Set([
	10, // CPI
	50, // Employment Situation
	53, // GDP
	101, // FOMC
	9, // Retail Sales
]);

/**
 * Release IDs with medium market impact.
 */
const MEDIUM_IMPACT_RELEASE_IDS = new Set([
	13, // Industrial Production
	46, // Personal Income
	18, // Treasury Rates
	40, // Housing Starts
	37, // Durable Goods
	11, // PPI
	154, // JOLTS
]);

export type ReleaseImpact = "high" | "medium" | "low";

/**
 * Classifies the market impact of a FRED release.
 * @param releaseId - The FRED release ID
 * @returns Impact level: 'high', 'medium', or 'low'
 */
export function classifyReleaseImpact(releaseId: number): ReleaseImpact {
	if (HIGH_IMPACT_RELEASE_IDS.has(releaseId)) {
		return "high";
	}
	if (MEDIUM_IMPACT_RELEASE_IDS.has(releaseId)) {
		return "medium";
	}
	return "low";
}

/**
 * Gets the release metadata by release ID.
 * @param releaseId - The FRED release ID
 * @returns Release metadata or undefined if not found
 */
export function getReleaseById(
	releaseId: number,
): { key: FREDReleaseId; name: string; series: readonly string[] } | undefined {
	for (const [key, release] of Object.entries(FRED_RELEASES)) {
		if (release.id === releaseId) {
			return { key: key as FREDReleaseId, name: release.name, series: release.series };
		}
	}
	return undefined;
}

// ============================================
// Client Configuration
// ============================================

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

// ============================================
// Client Error
// ============================================

/**
 * Error codes for FRED API errors.
 */
export type FREDErrorCode =
	| "RATE_LIMITED"
	| "UNAUTHORIZED"
	| "NOT_FOUND"
	| "VALIDATION_ERROR"
	| "NETWORK_ERROR"
	| "TIMEOUT"
	| "API_ERROR";

/**
 * Error thrown by FREDClient operations.
 */
export class FREDClientError extends Error {
	constructor(
		message: string,
		public readonly code: FREDErrorCode,
		public override readonly cause?: unknown,
	) {
		super(message, { cause });
		this.name = "FREDClientError";
	}
}

// ============================================
// Rate Limiter
// ============================================

/**
 * Simple token bucket rate limiter.
 * FRED free tier: 120 requests/minute
 */
class RateLimiter {
	private tokens: number;
	private lastRefill: number;
	private readonly maxTokens: number;
	private readonly refillIntervalMs: number;

	constructor(maxRequests: number, intervalMs: number) {
		this.maxTokens = maxRequests;
		this.tokens = maxRequests;
		this.refillIntervalMs = intervalMs;
		this.lastRefill = Date.now();
	}

	async acquire(): Promise<void> {
		this.refill();

		if (this.tokens > 0) {
			this.tokens--;
			return;
		}

		// Wait for next token
		const waitTime = this.refillIntervalMs - (Date.now() - this.lastRefill);
		if (waitTime > 0) {
			await sleep(waitTime);
			this.refill();
		}
		this.tokens--;
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;

		if (elapsed >= this.refillIntervalMs) {
			this.tokens = this.maxTokens;
			this.lastRefill = now;
		}
	}
}

/**
 * Sleep utility for delays.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// FRED Client
// ============================================

/**
 * FRED API client with rate limiting and retry logic.
 *
 * Features:
 * - Token bucket rate limiting (120 req/min)
 * - Exponential backoff with jitter for retries
 * - AbortController timeout for requests
 * - Zod validation on responses
 *
 * @example
 * ```typescript
 * const client = new FREDClient({ apiKey: Bun.env.FRED_API_KEY! });
 *
 * // Get upcoming release dates
 * const releaseDates = await client.getReleaseDates({
 *   include_release_dates_with_no_data: true,
 *   limit: 100,
 * });
 *
 * // Get series observations
 * const observations = await client.getObservations("CPIAUCSL", {
 *   observation_start: "2024-01-01",
 *   observation_end: "2024-12-31",
 * });
 * ```
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

	/**
	 * Make an HTTP request to the FRED API with rate limiting and retry.
	 */
	private async request<T>(
		endpoint: string,
		params: Record<string, string | number | boolean> = {},
		schema: z.ZodType<T>,
	): Promise<T> {
		// Acquire rate limit token
		await this.rateLimiter.acquire();

		const url = new URL(`${this.config.baseUrl}${endpoint}`);
		url.searchParams.set("api_key", this.config.apiKey);
		url.searchParams.set("file_type", "json");

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				url.searchParams.set(key, String(value));
			}
		}

		let lastError: FREDClientError | null = null;

		for (let attempt = 0; attempt <= this.config.retries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

				const response = await fetch(url.toString(), {
					method: "GET",
					signal: controller.signal,
					headers: {
						Accept: "application/json",
					},
				});

				clearTimeout(timeoutId);

				if (response.status === 429) {
					// Rate limited - wait 20 seconds and retry (FRED specific)
					lastError = new FREDClientError("FRED API rate limited", "RATE_LIMITED");
					if (attempt < this.config.retries) {
						await sleep(20000); // FRED requires 20s wait on 429
						continue;
					}
					throw lastError;
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

				const rawData = await response.json();

				// Validate with Zod schema
				const result = schema.safeParse(rawData);
				if (!result.success) {
					throw new FREDClientError(
						`FRED API response validation failed: ${result.error.message}`,
						"VALIDATION_ERROR",
						result.error,
					);
				}

				return result.data;
			} catch (error) {
				if (error instanceof FREDClientError) {
					// Don't retry on 4xx errors (except 429 which is handled above)
					if (["UNAUTHORIZED", "NOT_FOUND", "VALIDATION_ERROR"].includes(error.code)) {
						throw error;
					}
					lastError = error;
				} else if (error instanceof Error) {
					if (error.name === "AbortError") {
						lastError = new FREDClientError(
							`FRED API request timed out after ${this.config.timeout}ms`,
							"TIMEOUT",
							error,
						);
					} else {
						lastError = new FREDClientError(
							`FRED API network error: ${error.message}`,
							"NETWORK_ERROR",
							error,
						);
					}
				} else {
					lastError = new FREDClientError("Unknown FRED API error", "API_ERROR", error);
				}

				// Exponential backoff with jitter for retries
				if (attempt < this.config.retries) {
					const backoff = this.config.retryDelay * 2 ** attempt;
					const jitter = Math.random() * 1000;
					await sleep(backoff + jitter);
				}
			}
		}

		throw lastError ?? new FREDClientError("FRED API request failed", "API_ERROR");
	}

	// ============================================
	// Public API Methods
	// ============================================

	/**
	 * Get upcoming release dates across all releases.
	 *
	 * @param params - Query parameters
	 * @returns List of release dates
	 *
	 * @see https://fred.stlouisfed.org/docs/api/fred/releases_dates.html
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
	 *
	 * @param params - Query parameters
	 * @returns List of releases
	 *
	 * @see https://fred.stlouisfed.org/docs/api/fred/releases.html
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
	 *
	 * @param releaseId - FRED release ID
	 * @param params - Query parameters
	 * @returns List of series in the release
	 *
	 * @see https://fred.stlouisfed.org/docs/api/fred/release_series.html
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
			`/release/series`,
			{ release_id: releaseId, ...params },
			FREDReleaseSeriesResponseSchema,
		);
	}

	/**
	 * Get observations (data points) for a series.
	 *
	 * @param seriesId - FRED series ID (e.g., "CPIAUCSL")
	 * @param params - Query parameters
	 * @returns List of observations
	 *
	 * @see https://fred.stlouisfed.org/docs/api/fred/series_observations.html
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
			`/series/observations`,
			{ series_id: seriesId, ...params },
			FREDObservationsResponseSchema,
		);
	}

	/**
	 * Get release dates for a specific release.
	 *
	 * @param releaseId - FRED release ID
	 * @param params - Query parameters
	 * @returns List of release dates for the specific release
	 *
	 * @see https://fred.stlouisfed.org/docs/api/fred/release_dates.html
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
	 *
	 * Convenience method that fetches the most recent observation.
	 *
	 * @param seriesId - FRED series ID (e.g., "CPIAUCSL")
	 * @returns Latest value with date, or null if no data or value is missing
	 *
	 * @example
	 * ```typescript
	 * const latest = await client.getLatestValue("CPIAUCSL");
	 * if (latest) {
	 *   console.log(`CPI as of ${latest.date}: ${latest.value}`);
	 * }
	 * ```
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

// ============================================
// Factory Functions
// ============================================

/**
 * Create a FREDClient instance with the given configuration.
 *
 * @param config - Client configuration (apiKey required)
 * @returns Configured FREDClient instance
 *
 * @example
 * ```ts
 * const client = createFREDClient({ apiKey: 'your-api-key' });
 * const releases = await client.getReleaseDates();
 * ```
 */
export function createFREDClient(config: FREDClientConfig): FREDClient {
	return new FREDClient(config);
}

/**
 * Create a FREDClient instance using environment variables.
 *
 * Checks both `Bun.env.FRED_API_KEY` and `Bun.env.FRED_API_KEY`.
 *
 * @returns Configured FREDClient instance
 * @throws Error if FRED_API_KEY environment variable is not set
 *
 * @example
 * ```ts
 * // Assumes FRED_API_KEY is set in environment
 * const client = createFREDClientFromEnv();
 * const observations = await client.getObservations('GDP');
 * ```
 */
export function createFREDClientFromEnv(): FREDClient {
	const apiKey = Bun.env.FRED_API_KEY;

	if (!apiKey) {
		throw new Error("FRED_API_KEY environment variable is required");
	}

	return new FREDClient({ apiKey });
}
