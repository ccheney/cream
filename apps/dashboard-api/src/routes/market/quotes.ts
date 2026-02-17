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

interface SnapshotLike {
	latestQuote?: { bidPrice?: number; askPrice?: number; timestamp?: string | Date };
	latestTrade?: { price?: number; timestamp?: string | Date };
	dailyBar?: { close?: number; volume?: number; timestamp?: string | Date };
	prevDailyBar?: { close?: number };
}

function resolveTimestamp(snapshot: SnapshotLike): string {
	const timestamp =
		snapshot.latestTrade?.timestamp ??
		snapshot.latestQuote?.timestamp ??
		snapshot.dailyBar?.timestamp ??
		new Date().toISOString();
	return typeof timestamp === "string" ? timestamp : new Date(timestamp).toISOString();
}

function buildQuoteFromSnapshot(
	symbol: string,
	snapshot: SnapshotLike | undefined,
): Quote | QuoteError {
	if (!snapshot) {
		return { symbol, error: "No data available" };
	}
	const bid =
		snapshot.latestQuote?.bidPrice ?? snapshot.latestTrade?.price ?? snapshot.dailyBar?.close ?? 0;
	const ask =
		snapshot.latestQuote?.askPrice ?? snapshot.latestTrade?.price ?? snapshot.dailyBar?.close ?? 0;
	const lastPrice = snapshot.latestTrade?.price ?? snapshot.dailyBar?.close ?? 0;
	const prevClose = snapshot.prevDailyBar?.close ?? lastPrice;
	const changePercent = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;

	return {
		symbol,
		bid: Math.round(bid * 100) / 100,
		ask: Math.round(ask * 100) / 100,
		last: lastPrice,
		volume: snapshot.dailyBar?.volume ?? 0,
		prevClose,
		changePercent: Math.round(changePercent * 100) / 100,
		timestamp: resolveTimestamp(snapshot),
	};
}

function setCachedQuote(symbol: string, quote: Quote | QuoteError): void {
	if (!isQuoteError(quote)) {
		setCache(`quote:${symbol}`, quote);
	}
}

function getCachedBatchResults(symbols: string[]): {
	results: Map<string, Quote | QuoteError>;
	uncachedSymbols: string[];
} {
	const results = new Map<string, Quote | QuoteError>();
	const uncachedSymbols: string[] = [];
	for (const symbol of symbols) {
		const cached = getCached<Quote>(`quote:${symbol}`);
		if (cached) {
			results.set(symbol, cached);
		} else {
			uncachedSymbols.push(symbol);
		}
	}
	return { results, uncachedSymbols };
}

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
		const snapshots = await client.getSnapshots([symbol]);
		const quote = buildQuoteFromSnapshot(symbol, snapshots.get(symbol) as SnapshotLike | undefined);
		setCachedQuote(symbol, quote);
		return quote;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { symbol, error: message };
	}
}

async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, Quote | QuoteError>> {
	const client = getAlpacaClient();
	const { results, uncachedSymbols } = getCachedBatchResults(symbols);

	if (uncachedSymbols.length === 0) {
		return results;
	}

	try {
		const snapshots = await client.getSnapshots(uncachedSymbols);
		for (const symbol of uncachedSymbols) {
			const quote = buildQuoteFromSnapshot(
				symbol,
				snapshots.get(symbol) as SnapshotLike | undefined,
			);
			setCachedQuote(symbol, quote);
			results.set(symbol, quote);
		}
	} catch (_err) {
		for (const symbol of uncachedSymbols) {
			if (results.has(symbol)) continue;
			const result = await fetchQuote(symbol);
			results.set(symbol, result);
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
