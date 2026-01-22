/**
 * Polymarket CLOB Client
 *
 * Client for interacting with the Polymarket prediction market APIs.
 * Uses the Gamma API for market metadata and the CLOB API for prices.
 *
 * We implement read-only access using REST APIs directly, avoiding the
 * heavy ethereum wallet dependencies in @polymarket/clob-client.
 *
 * @see https://docs.polymarket.com/developers/clob-api/overview
 * @see https://docs.polymarket.com/developers/gamma-markets-api/overview
 */

import type { PolymarketConfig } from "@cream/config";
import type {
	PredictionMarketEvent,
	PredictionMarketScores,
	PredictionMarketType,
} from "@cream/domain";
import type { PredictionMarketProvider } from "../../types.js";
import {
	createRateLimiterState,
	enforceRateLimit,
	getMarketTypeFromQuery,
	handleApiError,
	type RateLimiterState,
} from "./helpers.js";
import { calculateScores } from "./scoring.js";
import { transformEvent, transformMarket } from "./transform.js";
import {
	type ClobOrderbook,
	ClobOrderbookSchema,
	DEFAULT_SEARCH_QUERIES,
	POLYMARKET_RATE_LIMITS,
	type PolymarketClientOptions,
	type PolymarketEvent,
	PolymarketEventSchema,
	PolymarketMarketSchema,
} from "./types.js";

export {
	type ClobOrderbook,
	ClobOrderbookSchema,
	type ClobPrice,
	ClobPriceSchema,
	DEFAULT_SEARCH_QUERIES,
	POLYMARKET_RATE_LIMITS,
	type PolymarketClientOptions,
	type PolymarketEvent,
	PolymarketEventSchema,
	type PolymarketMarket,
	PolymarketMarketSchema,
} from "./types.js";

/**
 * Client for the Polymarket prediction markets APIs
 *
 * Uses REST APIs directly for read-only access, avoiding ethereum dependencies.
 */
export class PolymarketClient implements PredictionMarketProvider {
	readonly platform = "POLYMARKET" as const;

	private readonly clobEndpoint: string;
	private readonly gammaEndpoint: string;
	private readonly searchQueries: string[];
	private readonly rateLimiter: RateLimiterState;

	constructor(options: PolymarketClientOptions = {}) {
		this.clobEndpoint = options.clobEndpoint ?? "https://clob.polymarket.com";
		this.gammaEndpoint = options.gammaEndpoint ?? "https://gamma-api.polymarket.com";
		this.searchQueries = options.searchQueries ?? ["Federal Reserve", "inflation", "recession"];
		this.rateLimiter = createRateLimiterState();
	}

	async fetchMarkets(
		marketTypes: (typeof PredictionMarketType.options)[number][],
	): Promise<PredictionMarketEvent[]> {
		const queries = this.collectSearchQueries(marketTypes);
		const events = await this.fetchEventsForQueries(queries);
		return this.deduplicateEvents(events);
	}

	async fetchMarketByTicker(marketId: string): Promise<PredictionMarketEvent | null> {
		await enforceRateLimit(this.rateLimiter, POLYMARKET_RATE_LIMITS.gamma_markets);

		try {
			const response = await fetch(`${this.gammaEndpoint}/markets/${marketId}`);

			if (!response.ok) {
				if (response.status === 404) {
					return null;
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			const parsed = PolymarketMarketSchema.safeParse(data);

			if (!parsed.success) {
				return null;
			}

			return transformMarket(parsed.data, "ECONOMIC_DATA");
		} catch (error) {
			handleApiError(error);
			return null;
		}
	}

	calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores {
		return calculateScores(events);
	}

	async searchMarkets(query: string): Promise<PolymarketEvent[]> {
		await enforceRateLimit(this.rateLimiter, POLYMARKET_RATE_LIMITS.gamma_markets);

		try {
			const params = new URLSearchParams({
				q: query,
				events_status: "open",
			});

			const response = await fetch(`${this.gammaEndpoint}/public-search?${params}`);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as { events?: unknown[] };
			const eventData = data.events;

			if (!Array.isArray(eventData)) {
				return [];
			}

			return eventData
				.map((item) => PolymarketEventSchema.safeParse(item))
				.filter((result) => result.success)
				.map((result) => result.data);
		} catch (error) {
			handleApiError(error);
			return [];
		}
	}

	async getMidpoint(tokenId: string): Promise<number | null> {
		await enforceRateLimit(this.rateLimiter, POLYMARKET_RATE_LIMITS.clob_book_price);

		try {
			const response = await fetch(`${this.clobEndpoint}/midpoint?token_id=${tokenId}`);

			if (!response.ok) {
				return null;
			}

			const data = (await response.json()) as { mid?: string };

			if (typeof data.mid === "string") {
				return Number.parseFloat(data.mid);
			}

			return null;
		} catch {
			return null;
		}
	}

	async getOrderbook(tokenId: string): Promise<ClobOrderbook | null> {
		await enforceRateLimit(this.rateLimiter, POLYMARKET_RATE_LIMITS.clob_book_price);

		try {
			const response = await fetch(`${this.clobEndpoint}/book?token_id=${tokenId}`);

			if (!response.ok) {
				return null;
			}

			const data = await response.json();
			const parsed = ClobOrderbookSchema.safeParse(data);

			return parsed.success ? parsed.data : null;
		} catch {
			return null;
		}
	}

	private collectSearchQueries(
		marketTypes: (typeof PredictionMarketType.options)[number][],
	): Set<string> {
		const queries = new Set<string>();

		for (const type of marketTypes) {
			const typeQueries = DEFAULT_SEARCH_QUERIES[type] ?? [];
			for (const q of typeQueries) {
				queries.add(q);
			}
		}

		if (queries.size === 0) {
			for (const q of this.searchQueries) {
				queries.add(q);
			}
		}

		return queries;
	}

	private async fetchEventsForQueries(queries: Set<string>): Promise<PredictionMarketEvent[]> {
		const events: PredictionMarketEvent[] = [];

		for (const query of queries) {
			await enforceRateLimit(this.rateLimiter, POLYMARKET_RATE_LIMITS.gamma_markets);

			try {
				const searchResults = await this.searchMarkets(query);

				for (const event of searchResults) {
					const transformed = transformEvent(event, getMarketTypeFromQuery(query));
					if (transformed) {
						events.push(transformed);
					}
				}
			} catch (error) {
				handleApiError(error);
			}
		}

		return events;
	}

	private deduplicateEvents(events: PredictionMarketEvent[]): PredictionMarketEvent[] {
		const seen = new Set<string>();

		return events.filter((e) => {
			if (seen.has(e.eventId)) {
				return false;
			}
			seen.add(e.eventId);
			return true;
		});
	}
}

export function createPolymarketClient(config: PolymarketConfig): PolymarketClient {
	return new PolymarketClient({
		clobEndpoint: config.clob_endpoint,
		gammaEndpoint: config.gamma_endpoint,
		searchQueries: config.search_queries,
	});
}

export function createPolymarketClientFromEnv(): PolymarketClient {
	const clobEndpoint =
		Bun.env.POLYMARKET_CLOB_ENDPOINT ??
		Bun.env.POLYMARKET_CLOB_ENDPOINT ??
		"https://clob.polymarket.com";
	const gammaEndpoint =
		Bun.env.POLYMARKET_GAMMA_ENDPOINT ??
		Bun.env.POLYMARKET_GAMMA_ENDPOINT ??
		"https://gamma-api.polymarket.com";

	return new PolymarketClient({
		clobEndpoint,
		gammaEndpoint,
	});
}
