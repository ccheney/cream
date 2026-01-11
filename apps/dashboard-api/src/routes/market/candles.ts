/**
 * Candle Routes
 *
 * Endpoints for OHLCV candlestick data.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import {
  CACHE_VERSION,
  type Candle,
  CandleSchema,
  ErrorSchema,
  getCached,
  getDaysAgo,
  getPolygonClient,
  getTodayNY,
  isMarketHours,
  setCache,
  TIMESPAN_MAP,
  type Timeframe,
  TimeframeSchema,
} from "./types.js";

const app = new OpenAPIHono();

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

  const client = getPolygonClient();
  const tf = TIMESPAN_MAP[timeframe as Timeframe];
  const todayNY = getTodayNY();

  let fromStr: string;
  if (tf.timespan === "day") {
    fromStr = getDaysAgo(365);
  } else {
    fromStr = getDaysAgo(7);
  }

  // Scale fetchLimit based on timeframe to ensure enough market-hours bars survive filtering
  const safetyFactor = tf.multiplier <= 1 ? 1.5 : tf.multiplier <= 5 ? 3 : 5;
  const fetchLimit = Math.min(Math.ceil(limit * safetyFactor) + 100, 50000);

  try {
    const response = await client.getAggregates(
      upperSymbol,
      tf.multiplier,
      tf.timespan,
      fromStr,
      todayNY,
      { limit: fetchLimit, sort: "desc" }
    );

    log.debug(
      {
        symbol: upperSymbol,
        timeframe,
        count: response.results?.length ?? 0,
        from: fromStr,
        to: todayNY,
      },
      "Fetched candles from API"
    );

    if (!response.results || response.results.length === 0) {
      log.warn({ symbol: upperSymbol, timeframe }, "No candle data returned from API");
      throw new HTTPException(503, {
        message: `No candle data available for ${upperSymbol}`,
      });
    }

    let filteredResults = response.results;
    if (tf.timespan !== "day") {
      const beforeCount = response.results.length;
      filteredResults = response.results.filter((bar) => isMarketHours(new Date(bar.t)));
      log.debug(
        { symbol: upperSymbol, timeframe, beforeCount, afterCount: filteredResults.length },
        "Applied market hours filter"
      );
    }

    filteredResults.sort((a, b) => a.t - b.t);

    const startIndex = Math.max(0, filteredResults.length - limit);
    const recentResults = filteredResults.slice(startIndex);

    if (recentResults.length > 0) {
      const first = recentResults[0];
      const last = recentResults[recentResults.length - 1];
      const firstTimestamp = first ? new Date(first.t).toISOString() : null;
      const lastTimestamp = last ? new Date(last.t).toISOString() : null;
      log.debug(
        {
          symbol: upperSymbol,
          timeframe,
          count: recentResults.length,
          firstTimestamp,
          lastTimestamp,
        },
        "Returning candles"
      );
    }

    const candles: Candle[] = recentResults.map((bar) => ({
      timestamp: new Date(bar.t).toISOString(),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
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
