/**
 * Polymarket API Types and Schemas
 *
 * Zod schemas for parsing and validating Polymarket API responses.
 */

import { z } from "zod";

/**
 * Rate limits for Polymarket APIs (requests per 10 seconds)
 * @see https://docs.polymarket.com/getting-started/rate-limits
 */
export const POLYMARKET_RATE_LIMITS = {
	general: 15000,
	clob_book_price: 1500,
	data_trades: 200,
	gamma_markets: 300,
	gamma_events: 500,
};

/**
 * Helper to parse JSON-encoded string arrays from Polymarket API
 * The API returns outcomes/outcomePrices as JSON strings like "[\"Yes\", \"No\"]"
 */
const jsonStringArray = z.union([z.array(z.string()), z.string()]).transform((val): string[] => {
	if (Array.isArray(val)) {
		return val;
	}
	try {
		const parsed = JSON.parse(val);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
});

/**
 * Polymarket market response schema (from Gamma API)
 */
export const PolymarketMarketSchema = z.object({
	id: z.string(),
	question: z.string(),
	slug: z.string().optional(),
	outcomes: jsonStringArray.optional(),
	outcomePrices: jsonStringArray.optional(),
	volume: z.union([z.string(), z.number()]).optional().nullable(),
	volume24hr: z.union([z.string(), z.number()]).optional().nullable(),
	liquidity: z.union([z.string(), z.number()]).optional().nullable(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	endDate: z.string().optional(),
	createdAt: z.string().optional(),
	clobTokenIds: jsonStringArray.optional(),
});
export type PolymarketMarket = z.infer<typeof PolymarketMarketSchema>;

/**
 * Polymarket event response schema (from Gamma API)
 */
export const PolymarketEventSchema = z.object({
	id: z.string(),
	title: z.string(),
	slug: z.string().optional(),
	description: z.string().optional(),
	markets: z.array(PolymarketMarketSchema).optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	active: z.boolean().optional(),
});
export type PolymarketEvent = z.infer<typeof PolymarketEventSchema>;

/**
 * CLOB price response schema
 */
export const ClobPriceSchema = z.object({
	price: z.string(),
	side: z.string().optional(),
});
export type ClobPrice = z.infer<typeof ClobPriceSchema>;

/**
 * CLOB orderbook response schema
 */
export const ClobOrderbookSchema = z.object({
	market: z.string().optional(),
	asset_id: z.string().optional(),
	hash: z.string().optional(),
	bids: z
		.array(
			z.object({
				price: z.string(),
				size: z.string(),
			}),
		)
		.optional(),
	asks: z
		.array(
			z.object({
				price: z.string(),
				size: z.string(),
			}),
		)
		.optional(),
});
export type ClobOrderbook = z.infer<typeof ClobOrderbookSchema>;

/**
 * Default search queries for relevant market types
 */
export const DEFAULT_SEARCH_QUERIES: Record<string, string[]> = {
	FED_RATE: ["Federal Reserve", "Fed rate", "interest rate", "FOMC"],
	ECONOMIC_DATA: ["inflation", "CPI", "GDP", "unemployment", "jobs"],
	RECESSION: ["recession", "economic downturn"],
	GEOPOLITICAL: ["tariff", "trade war", "sanctions"],
	REGULATORY: ["SEC", "regulation", "antitrust"],
	ELECTION: ["election", "president", "congress"],
};

export interface PolymarketClientOptions {
	clobEndpoint?: string;
	gammaEndpoint?: string;
	searchQueries?: string[];
}
