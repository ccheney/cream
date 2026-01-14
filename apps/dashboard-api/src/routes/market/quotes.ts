/**
 * Quote Routes
 *
 * Endpoints for single and batch stock quotes.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
	ErrorSchema,
	getAlpacaClient,
	getCached,
	type Quote,
	type QuoteError,
	QuoteSchema,
	setCache,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Helper Functions
// ============================================

async function fetchQuote(symbol: string): Promise<Quote | QuoteError> {
	const cacheKey = `quote:${symbol}`;
	const cached = getCached<Quote>(cacheKey);
	if (cached) {
		return cached;
	}

	const client = getAlpacaClient();

	try {
		// Use Alpaca snapshot which provides latest quote, trade, and daily bar
		const snapshots = await client.getSnapshots([symbol]);
		const snapshot = snapshots.get(symbol);

		if (!snapshot) {
			return { symbol, error: "No data available" };
		}

		const latestQuote = snapshot.latestQuote;
		const latestTrade = snapshot.latestTrade;
		const dailyBar = snapshot.dailyBar;
		const prevBar = snapshot.prevDailyBar;

		// Determine prices from available data
		const bid = latestQuote?.bidPrice ?? latestTrade?.price ?? dailyBar?.close ?? 0;
		const ask = latestQuote?.askPrice ?? latestTrade?.price ?? dailyBar?.close ?? 0;
		const lastPrice = latestTrade?.price ?? dailyBar?.close ?? 0;
		const volume = dailyBar?.volume ?? 0;
		// Use previous day's close for accurate % change - don't fall back to today's bar
		const prevClose = prevBar?.close ?? lastPrice;

		// Calculate change percent
		const changePercent = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;

		// Determine timestamp from available data
		const timestamp =
			latestTrade?.timestamp ??
			latestQuote?.timestamp ??
			dailyBar?.timestamp ??
			new Date().toISOString();

		const quote: Quote = {
			symbol,
			bid: Math.round(bid * 100) / 100,
			ask: Math.round(ask * 100) / 100,
			last: lastPrice,
			volume,
			prevClose,
			changePercent: Math.round(changePercent * 100) / 100,
			timestamp: typeof timestamp === "string" ? timestamp : new Date(timestamp).toISOString(),
		};
		setCache(cacheKey, quote);
		return quote;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { symbol, error: message };
	}
}

async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, Quote | QuoteError>> {
	const client = getAlpacaClient();
	const results = new Map<string, Quote | QuoteError>();

	// Check cache first
	const uncachedSymbols: string[] = [];
	for (const symbol of symbols) {
		const cacheKey = `quote:${symbol}`;
		const cached = getCached<Quote>(cacheKey);
		if (cached) {
			results.set(symbol, cached);
		} else {
			uncachedSymbols.push(symbol);
		}
	}

	if (uncachedSymbols.length === 0) {
		return results;
	}

	try {
		// Fetch snapshots for all uncached symbols at once
		const snapshots = await client.getSnapshots(uncachedSymbols);

		for (const symbol of uncachedSymbols) {
			const snapshot = snapshots.get(symbol);

			if (!snapshot) {
				results.set(symbol, { symbol, error: "No data available" });
				continue;
			}

			const latestQuote = snapshot.latestQuote;
			const latestTrade = snapshot.latestTrade;
			const dailyBar = snapshot.dailyBar;
			const prevBar = snapshot.prevDailyBar;

			const bid = latestQuote?.bidPrice ?? latestTrade?.price ?? dailyBar?.close ?? 0;
			const ask = latestQuote?.askPrice ?? latestTrade?.price ?? dailyBar?.close ?? 0;
			const lastPrice = latestTrade?.price ?? dailyBar?.close ?? 0;
			const volume = dailyBar?.volume ?? 0;
			// Use previous day's close for accurate % change - don't fall back to today's bar
			const prevClose = prevBar?.close ?? lastPrice;
			const changePercent = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
			const timestamp =
				latestTrade?.timestamp ??
				latestQuote?.timestamp ??
				dailyBar?.timestamp ??
				new Date().toISOString();

			const quote: Quote = {
				symbol,
				bid: Math.round(bid * 100) / 100,
				ask: Math.round(ask * 100) / 100,
				last: lastPrice,
				volume,
				prevClose,
				changePercent: Math.round(changePercent * 100) / 100,
				timestamp: typeof timestamp === "string" ? timestamp : new Date(timestamp).toISOString(),
			};

			const cacheKey = `quote:${symbol}`;
			setCache(cacheKey, quote);
			results.set(symbol, quote);
		}
	} catch (_err) {
		// If batch fetch fails, try individual fetches
		for (const symbol of uncachedSymbols) {
			if (!results.has(symbol)) {
				const result = await fetchQuote(symbol);
				results.set(symbol, result);
			}
		}
	}

	return results;
}

function isQuoteError(result: Quote | QuoteError): result is QuoteError {
	return "error" in result;
}

// ============================================
// Routes
// ============================================

const quotesRoute = createRoute({
	method: "get",
	path: "/quotes",
	request: {
		query: z.object({
			symbols: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(QuoteSchema) } },
			description: "Batch quotes",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(quotesRoute, async (c) => {
	const { symbols } = c.req.valid("query");
	const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());

	// Use batch fetch for efficiency
	const resultsMap = await fetchQuotesBatch(symbolList);

	const results = symbolList
		.map((s) => resultsMap.get(s))
		.filter((r): r is Quote | QuoteError => r !== undefined);
	const successful = results.filter((r): r is Quote => !isQuoteError(r));

	if (successful.length === 0) {
		throw new HTTPException(503, {
			message: "Failed to fetch quotes from market data provider",
		});
	}

	return c.json(successful, 200);
});

const quoteRoute = createRoute({
	method: "get",
	path: "/quote/:symbol",
	request: {
		params: z.object({
			symbol: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: QuoteSchema } },
			description: "Quote",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(quoteRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const upperSymbol = symbol.toUpperCase();

	const result = await fetchQuote(upperSymbol);

	if (isQuoteError(result)) {
		throw new HTTPException(503, {
			message: `Failed to fetch quote for ${upperSymbol}: ${result.error}`,
		});
	}

	return c.json(result, 200);
});

export default app;
