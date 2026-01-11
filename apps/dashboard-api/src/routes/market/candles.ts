/**
 * Candle Routes
 *
 * Endpoints for OHLCV candlestick data.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import type { AlpacaTimeframe } from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import {
  CACHE_VERSION,
  type Candle,
  CandleSchema,
  ErrorSchema,
  getAlpacaClient,
  getCached,
  getDaysAgo,
  getTodayNY,
  isMarketHours,
  setCache,
  type Timeframe,
  TimeframeSchema,
} from "./types.js";

const app = new OpenAPIHono();

// Map internal timeframes to Alpaca timeframes
const ALPACA_TIMEFRAME_MAP: Record<Timeframe, AlpacaTimeframe> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "1h": "1Hour",
  "4h": "4Hour",
  "1d": "1Day",
};

// ============================================
// Routes
// ============================================

const candlesRoute = createRoute({
  method: "get",
  path: "/candles/:symbol",
  request: {
    params: z.object({
      symbol: z.string(),
    }),
    query: z.object({
      timeframe: TimeframeSchema.default("1h"),
      limit: z.coerce.number().min(1).max(1000).default(500),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(CandleSchema) } },
      description: "Candle data",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Market data service unavailable",
    },
  },
  tags: ["Market"],
});

app.openapi(candlesRoute, async (c) => {
  log.debug("Candles endpoint hit");
  const { symbol } = c.req.valid("param");
  const { timeframe, limit } = c.req.valid("query");
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `candles:${CACHE_VERSION}:${upperSymbol}:${timeframe}:${limit}`;

  const cached = getCached<Candle[]>(cacheKey);
  if (cached) {
    log.debug({ cacheKey, count: cached.length }, "Cache hit for candles");
    return c.json(cached, 200);
  }
  log.debug({ cacheKey }, "Cache miss for candles - fetching fresh data");

  const client = getAlpacaClient();
  const alpacaTimeframe = ALPACA_TIMEFRAME_MAP[timeframe as Timeframe];
  const todayNY = getTodayNY();
  const isIntraday = timeframe !== "1d";

  let fromStr: string;
  if (isIntraday) {
    fromStr = getDaysAgo(7);
  } else {
    fromStr = getDaysAgo(365);
  }

  // Scale fetchLimit based on timeframe to ensure enough market-hours bars survive filtering
  const safetyFactor = timeframe === "1m" ? 1.5 : timeframe === "5m" ? 3 : 5;
  const fetchLimit = Math.min(Math.ceil(limit * safetyFactor) + 100, 10000);

  try {
    const bars = await client.getBars(upperSymbol, alpacaTimeframe, fromStr, todayNY, fetchLimit);

    log.debug(
      {
        symbol: upperSymbol,
        timeframe,
        count: bars.length,
        from: fromStr,
        to: todayNY,
      },
      "Fetched candles from Alpaca"
    );

    if (!bars || bars.length === 0) {
      log.warn({ symbol: upperSymbol, timeframe }, "No candle data returned from Alpaca");
      throw new HTTPException(503, {
        message: `No candle data available for ${upperSymbol}`,
      });
    }

    // Filter to market hours for intraday timeframes
    let filteredBars = bars;
    if (isIntraday) {
      const beforeCount = bars.length;
      filteredBars = bars.filter((bar) => isMarketHours(new Date(bar.timestamp)));
      log.debug(
        { symbol: upperSymbol, timeframe, beforeCount, afterCount: filteredBars.length },
        "Applied market hours filter"
      );
    }

    // Sort by timestamp ascending
    filteredBars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Take the most recent 'limit' bars
    const startIndex = Math.max(0, filteredBars.length - limit);
    const recentBars = filteredBars.slice(startIndex);

    if (recentBars.length > 0) {
      const first = recentBars[0];
      const last = recentBars[recentBars.length - 1];
      log.debug(
        {
          symbol: upperSymbol,
          timeframe,
          count: recentBars.length,
          firstTimestamp: first?.timestamp,
          lastTimestamp: last?.timestamp,
        },
        "Returning candles"
      );
    }

    const candles: Candle[] = recentBars.map((bar) => ({
      timestamp: bar.timestamp, // Already ISO format from Alpaca
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));

    setCache(cacheKey, candles);
    return c.json(candles, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch candles for ${upperSymbol}: ${message}`,
    });
  }
});

export default app;
