/**
 * Kalshi API Client
 *
 * Client for interacting with the Kalshi prediction market API.
 * Uses RSA-PSS authentication and the official kalshi-typescript SDK.
 *
 * @see https://docs.kalshi.com/sdks/typescript/quickstart
 */

import type { KalshiConfig, KalshiRateLimitTier } from "@cream/config";
import type {
	PredictionMarketEvent,
	PredictionMarketScores,
	PredictionMarketType,
} from "@cream/domain";
import { Configuration, EventsApi, MarketApi } from "kalshi-typescript";
import { z } from "zod";
import { AuthenticationError, type PredictionMarketProvider, RateLimitError } from "../../types";

// ============================================
// Rate Limit Configuration
// ============================================

/**
 * Rate limits per tier (requests per second)
 * @see https://docs.kalshi.com/getting_started/rate_limits
 */
export const KALSHI_RATE_LIMITS: Record<KalshiRateLimitTier, { read: number; write: number }> = {
	basic: { read: 20, write: 10 },
	advanced: { read: 30, write: 30 },
	premier: { read: 100, write: 100 },
	prime: { read: 400, write: 400 },
};

// ============================================
// Response Schemas
// ============================================

/**
 * Kalshi market response schema
 */
export const KalshiMarketSchema = z.object({
	ticker: z.string(),
	event_ticker: z.string(),
	series_ticker: z.string().optional(),
	title: z.string(),
	subtitle: z.string().optional(),
	status: z.string(),
	yes_bid: z.number().optional(),
	yes_ask: z.number().optional(),
	no_bid: z.number().optional(),
	no_ask: z.number().optional(),
	last_price: z.number().optional(),
	volume: z.number().optional(),
	volume_24h: z.number().optional(),
	open_interest: z.number().optional(),
	close_time: z.string().optional(),
	expiration_time: z.string().optional(),
});
export type KalshiMarket = z.infer<typeof KalshiMarketSchema>;

/**
 * Kalshi event response schema
 */
export const KalshiEventSchema = z.object({
	event_ticker: z.string(),
	series_ticker: z.string().optional(),
	title: z.string(),
	category: z.string().optional(),
	markets: z.array(KalshiMarketSchema).optional(),
});
export type KalshiEvent = z.infer<typeof KalshiEventSchema>;

// ============================================
// Series Ticker Mapping
// ============================================

/**
 * Map market types to Kalshi series tickers
 */
export const MARKET_TYPE_TO_SERIES: Record<string, string[]> = {
	FED_RATE: ["KXFED", "KXFOMC"],
	ECONOMIC_DATA: ["KXCPI", "KXGDP", "KXJOBS", "KXPCE"],
	RECESSION: ["KXREC"],
	GEOPOLITICAL: [],
	REGULATORY: [],
	ELECTION: ["KXPRES"],
};

// ============================================
// Client Options
// ============================================

export interface KalshiClientOptions {
	/** API key ID from Kalshi */
	apiKeyId: string;
	/** Path to RSA private key file */
	privateKeyPath?: string;
	/** RSA private key as PEM string */
	privateKeyPem?: string;
	/** API base URL */
	basePath?: string;
	/** Rate limit tier */
	tier?: KalshiRateLimitTier;
}

// ============================================
// Kalshi Client
// ============================================

/**
 * Client for the Kalshi prediction markets API
 */
export class KalshiClient implements PredictionMarketProvider {
	readonly platform = "KALSHI" as const;

	private readonly config: Configuration;
	private readonly marketApi: MarketApi;
	private readonly eventsApi: EventsApi;
	private readonly rateLimits: { read: number; write: number };

	private lastRequestTime = 0;
	private requestCount = 0;

	constructor(options: KalshiClientOptions) {
		if (!options.privateKeyPath && !options.privateKeyPem) {
			throw new AuthenticationError(
				"KALSHI",
				"Either privateKeyPath or privateKeyPem must be provided",
			);
		}

		this.config = new Configuration({
			apiKey: options.apiKeyId,
			privateKeyPath: options.privateKeyPath,
			privateKeyPem: options.privateKeyPem,
			basePath: options.basePath ?? "https://api.elections.kalshi.com/trade-api/v2",
		});

		this.marketApi = new MarketApi(this.config);
		this.eventsApi = new EventsApi(this.config);
		this.rateLimits = KALSHI_RATE_LIMITS[options.tier ?? "basic"];
	}

	/**
	 * Fetch markets by market types
	 */
	async fetchMarkets(
		marketTypes: (typeof PredictionMarketType.options)[number][],
	): Promise<PredictionMarketEvent[]> {
		const seriesTickers = marketTypes.flatMap((type) => MARKET_TYPE_TO_SERIES[type] ?? []);
		const events: PredictionMarketEvent[] = [];

		for (const seriesTicker of seriesTickers) {
			await this.enforceRateLimit();
			try {
				// getMarkets(limit?, cursor?, eventTicker?, seriesTicker?, ...)
				const response = await this.marketApi.getMarkets(
					undefined,
					undefined,
					undefined,
					seriesTicker,
				);
				const markets = response.data.markets ?? [];

				for (const market of markets) {
					const parsed = KalshiMarketSchema.safeParse(market);
					if (parsed.success) {
						events.push(this.transformMarket(parsed.data, this.getMarketType(seriesTicker)));
					}
				}
			} catch (error) {
				this.handleApiError(error);
			}
		}

		return events;
	}

	/**
	 * Fetch a specific market by ticker
	 */
	async fetchMarketByTicker(ticker: string): Promise<PredictionMarketEvent | null> {
		await this.enforceRateLimit();

		try {
			const response = await this.marketApi.getMarket(ticker);
			const market = response.data.market;

			const parsed = KalshiMarketSchema.safeParse(market);
			if (!parsed.success) {
				return null;
			}

			return this.transformMarket(parsed.data, "FED_RATE");
		} catch (error) {
			this.handleApiError(error);
			return null;
		}
	}

	/**
	 * Calculate aggregated scores from prediction market events
	 */
	calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores {
		const scores: PredictionMarketScores = {};

		// Find Fed rate markets
		const fedMarkets = events.filter((e) => e.payload.marketType === "FED_RATE");
		if (fedMarkets.length > 0) {
			// Look for cut vs hike probabilities
			for (const market of fedMarkets) {
				const _question = market.payload.marketQuestion.toLowerCase();
				for (const outcome of market.payload.outcomes) {
					const outcomeLower = outcome.outcome.toLowerCase();
					if (outcomeLower.includes("cut") || outcomeLower.includes("decrease")) {
						scores.fedCutProbability = Math.max(scores.fedCutProbability ?? 0, outcome.probability);
					}
					if (outcomeLower.includes("hike") || outcomeLower.includes("increase")) {
						scores.fedHikeProbability = Math.max(
							scores.fedHikeProbability ?? 0,
							outcome.probability,
						);
					}
				}
			}
		}

		// Find recession markets
		const recessionMarkets = events.filter((e) =>
			e.payload.marketQuestion.toLowerCase().includes("recession"),
		);
		if (recessionMarkets.length > 0) {
			const [market] = recessionMarkets;
			if (!market) {
				return scores;
			}
			const yesOutcome = market.payload.outcomes.find((o) => o.outcome.toLowerCase() === "yes");
			if (yesOutcome) {
				scores.recessionProbability12m = yesOutcome.probability;
			}
		}

		// Calculate macro uncertainty from multiple signals
		const uncertaintySignals: number[] = [];
		if (scores.fedCutProbability !== undefined && scores.fedHikeProbability !== undefined) {
			// High uncertainty when cut and hike are both possible
			const maxProb = Math.max(scores.fedCutProbability, scores.fedHikeProbability);
			const minProb = Math.min(scores.fedCutProbability, scores.fedHikeProbability);
			if (maxProb > 0) {
				uncertaintySignals.push(minProb / maxProb); // Ratio indicates uncertainty
			}
		}

		if (uncertaintySignals.length > 0) {
			scores.macroUncertaintyIndex =
				uncertaintySignals.reduce((a, b) => a + b, 0) / uncertaintySignals.length;
		}

		return scores;
	}

	/**
	 * Get event details
	 */
	async getEventDetails(eventTicker: string): Promise<KalshiEvent | null> {
		await this.enforceRateLimit();

		try {
			const response = await this.eventsApi.getEvent(eventTicker, true);
			const event = response.data.event;

			if (!event) {
				return null;
			}

			const parsed = KalshiEventSchema.safeParse(event);
			return parsed.success ? parsed.data : null;
		} catch (error) {
			this.handleApiError(error);
			return null;
		}
	}

	// ============================================
	// Private Methods
	// ============================================

	/**
	 * Transform Kalshi market to PredictionMarketEvent
	 */
	private transformMarket(
		market: KalshiMarket,
		marketType: (typeof PredictionMarketType.options)[number],
	): PredictionMarketEvent {
		const outcomes = [];

		// Kalshi markets are typically Yes/No binary
		if (market.yes_bid !== undefined || market.yes_ask !== undefined) {
			const yesPrice = market.last_price ?? market.yes_bid ?? 0;
			outcomes.push({
				outcome: "Yes",
				probability: yesPrice / 100,
				price: yesPrice / 100,
				volume24h: market.volume_24h,
			});
		}

		if (market.no_bid !== undefined || market.no_ask !== undefined) {
			const noPrice = 100 - (market.last_price ?? market.yes_bid ?? 100);
			outcomes.push({
				outcome: "No",
				probability: noPrice / 100,
				price: noPrice / 100,
			});
		}

		return {
			eventId: `pm_kalshi_${market.ticker}`,
			eventType: "PREDICTION_MARKET",
			eventTime: market.expiration_time ?? market.close_time ?? new Date().toISOString(),
			payload: {
				platform: "KALSHI",
				marketType,
				marketTicker: market.ticker,
				marketQuestion: market.title,
				outcomes,
				lastUpdated: new Date().toISOString(),
				openInterest: market.open_interest,
				volume24h: market.volume_24h,
				liquidityScore: this.calculateLiquidityScore(market),
			},
			relatedInstrumentIds: this.getRelatedInstruments(marketType),
		};
	}

	/**
	 * Get market type from series ticker
	 */
	private getMarketType(seriesTicker: string): (typeof PredictionMarketType.options)[number] {
		for (const [type, tickers] of Object.entries(MARKET_TYPE_TO_SERIES)) {
			if (tickers.includes(seriesTicker)) {
				return type as (typeof PredictionMarketType.options)[number];
			}
		}
		return "ECONOMIC_DATA";
	}

	/**
	 * Calculate liquidity score (0-1) based on volume and spread
	 */
	private calculateLiquidityScore(market: KalshiMarket): number {
		let score = 0;

		// Volume component (normalized)
		if (market.volume_24h !== undefined && market.volume_24h > 0) {
			// Assume 100k volume is high liquidity
			score += Math.min(market.volume_24h / 100000, 0.5);
		}

		// Spread component
		if (market.yes_bid !== undefined && market.yes_ask !== undefined) {
			const spread = market.yes_ask - market.yes_bid;
			// Tight spread (<3 cents) = high liquidity
			score += Math.max(0, 0.5 - spread / 6);
		}

		return Math.min(score, 1);
	}

	/**
	 * Get related instrument IDs for a market type
	 */
	private getRelatedInstruments(marketType: string): string[] {
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

	/**
	 * Enforce rate limiting
	 */
	private async enforceRateLimit(): Promise<void> {
		const now = Date.now();
		const elapsed = now - this.lastRequestTime;

		if (elapsed < 1000) {
			this.requestCount++;
			if (this.requestCount >= this.rateLimits.read) {
				const waitTime = 1000 - elapsed;
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				this.requestCount = 0;
			}
		} else {
			this.requestCount = 1;
		}

		this.lastRequestTime = Date.now();
	}

	/**
	 * Handle API errors
	 */
	private handleApiError(error: unknown): never {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();

			if (message.includes("401") || message.includes("unauthorized")) {
				throw new AuthenticationError("KALSHI", "Authentication failed - check API credentials");
			}

			if (message.includes("429") || message.includes("rate limit")) {
				throw new RateLimitError("KALSHI", 60000);
			}
		}

		throw error;
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create Kalshi client from config
 */
export function createKalshiClient(config: KalshiConfig): KalshiClient {
	if (!config.api_key_id) {
		throw new AuthenticationError("KALSHI", "api_key_id is required");
	}

	return new KalshiClient({
		apiKeyId: config.api_key_id,
		privateKeyPath: config.private_key_path,
		basePath: config.base_path,
		tier: config.rate_limit_tier,
	});
}

/**
 * Create Kalshi client from environment variables
 */
export function createKalshiClientFromEnv(): KalshiClient {
	const apiKeyId = Bun.env.KALSHI_API_KEY_ID;
	const privateKeyPath = Bun.env.KALSHI_PRIVATE_KEY_PATH;

	if (!apiKeyId) {
		throw new AuthenticationError("KALSHI", "KALSHI_API_KEY_ID environment variable is required");
	}

	if (!privateKeyPath) {
		throw new AuthenticationError(
			"KALSHI",
			"KALSHI_PRIVATE_KEY_PATH environment variable is required",
		);
	}

	return new KalshiClient({
		apiKeyId,
		privateKeyPath,
	});
}
