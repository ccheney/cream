/**
 * Quote Routes
 *
 * Endpoints for single and batch stock quotes.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ErrorSchema,
  getCached,
  getDaysAgo,
  getPolygonClient,
  getTodayNY,
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

  const client = getPolygonClient();
  const todayNY = getTodayNY();
  const recentFrom = getDaysAgo(7);

  try {
    const recentBarsResponse = await client.getAggregates(symbol, 1, "day", recentFrom, todayNY, {
      limit: 5,
      sort: "desc",
    });

    const recentBars = recentBarsResponse.results ?? [];
    if (recentBars.length === 0) {
      return { symbol, error: "No data available" };
    }

    const latestBar = recentBars[0];
    const prevBar = recentBars[1];

    let lastPrice = latestBar?.c ?? 0;
    let lastVolume = latestBar?.v ?? 0;
    let lastTimestamp = latestBar ? new Date(latestBar.t) : new Date();
    const prevClose = prevBar?.c ?? lastPrice;

    try {
      const todayResponse = await client.getAggregates(symbol, 1, "minute", todayNY, todayNY, {
        limit: 1,
        sort: "desc",
      });
      const todayBar = todayResponse.results?.[0];
      if (todayBar) {
        lastPrice = todayBar.c;
        lastVolume = todayBar.v;
        lastTimestamp = new Date(todayBar.t);
      }
    } catch {
      // If today's intraday data unavailable, use daily bar
    }

    const changePercent = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
    const spread = lastPrice * 0.001;

    const quote: Quote = {
      symbol,
      bid: Math.round((lastPrice - spread) * 100) / 100,
      ask: Math.round((lastPrice + spread) * 100) / 100,
      last: lastPrice,
      volume: lastVolume,
      prevClose,
      changePercent: Math.round(changePercent * 100) / 100,
      timestamp: lastTimestamp.toISOString(),
    };
    setCache(cacheKey, quote);
    return quote;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { symbol, error: message };
  }
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

  const results: Array<Quote | QuoteError> = [];
  for (const symbol of symbolList) {
    const result = await fetchQuote(symbol);
    results.push(result);
  }

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
