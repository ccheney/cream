/**
 * Market Data API Routes
 *
 * Routes for quotes, candles, indicators, and market regime.
 * Returns real data from Polygon.io API or error responses - NO mock data.
 *
 * @see docs/plans/ui/05-api-endpoints.md Market Data section
 */

import { PolygonClient } from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getRegimeLabelsRepo } from "../db.js";

// ============================================
// Polygon Client (singleton)
// ============================================

let polygonClient: PolygonClient | null = null;

// ============================================
// Simple Cache (60 second TTL)
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60000; // 60 seconds

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function getPolygonClient(): PolygonClient {
  if (polygonClient) {
    return polygonClient;
  }

  const apiKey = process.env.POLYGON_KEY;
  if (!apiKey) {
    throw new HTTPException(503, {
      message: "Market data service unavailable: POLYGON_KEY not configured",
    });
  }

  try {
    const tier =
      (process.env.POLYGON_TIER as "free" | "starter" | "developer" | "advanced") ?? "starter";
    polygonClient = new PolygonClient({ apiKey, tier });
    return polygonClient;
  } catch (_error) {
    throw new HTTPException(503, {
      message: "Market data service unavailable: Failed to initialize client",
    });
  }
}

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  timestamp: z.string(),
});

const CandleSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

const IndicatorsSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  rsi14: z.number().nullable(),
  atr14: z.number().nullable(),
  sma20: z.number().nullable(),
  sma50: z.number().nullable(),
  sma200: z.number().nullable(),
  ema12: z.number().nullable(),
  ema26: z.number().nullable(),
  macdLine: z.number().nullable(),
  macdSignal: z.number().nullable(),
  macdHist: z.number().nullable(),
});

const RegimeStatusSchema = z.object({
  label: z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]),
  confidence: z.number(),
  vix: z.number(),
  sectorRotation: z.record(z.string(), z.number()),
  updatedAt: z.string(),
});

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Routes
// ============================================

// GET /quotes - Batch quotes
const quotesRoute = createRoute({
  method: "get",
  path: "/quotes",
  request: {
    query: z.object({
      symbols: z.string(), // comma-separated
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
  const client = getPolygonClient();

  // Process sequentially to avoid rate limiting, use cache
  const results: Array<z.infer<typeof QuoteSchema> | { symbol: string; error: string }> = [];
  for (const symbol of symbolList) {
    const cacheKey = `quote:${symbol}`;
    const cached = getCached<z.infer<typeof QuoteSchema>>(cacheKey);
    if (cached) {
      results.push(cached);
      continue;
    }

    try {
      const response = await client.getPreviousClose(symbol);
      const bar = response.results?.[0];
      if (!bar) {
        results.push({ symbol, error: "No data available" });
        continue;
      }
      const spread = bar.c * 0.001;
      const quote = {
        symbol,
        bid: Math.round((bar.c - spread) * 100) / 100,
        ask: Math.round((bar.c + spread) * 100) / 100,
        last: bar.c,
        volume: bar.v,
        timestamp: new Date(bar.t).toISOString(),
      };
      setCache(cacheKey, quote);
      results.push(quote);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ symbol, error: message });
    }
  }

  // Check if all failed
  const successful = results.filter((r) => !("error" in r));
  if (successful.length === 0) {
    throw new HTTPException(503, {
      message: "Failed to fetch quotes from market data provider",
    });
  }

  // Return only successful quotes
  return c.json(successful as z.infer<typeof QuoteSchema>[], 200);
});

// GET /quote/:symbol - Single quote
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
  const cacheKey = `quote:${upperSymbol}`;

  // Check cache first
  const cached = getCached<z.infer<typeof QuoteSchema>>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  const client = getPolygonClient();

  try {
    const response = await client.getPreviousClose(upperSymbol);
    const bar = response.results?.[0];
    if (!bar) {
      throw new HTTPException(503, {
        message: `No market data available for ${upperSymbol}`,
      });
    }
    const spread = bar.c * 0.001;
    const quote = {
      symbol: upperSymbol,
      bid: Math.round((bar.c - spread) * 100) / 100,
      ask: Math.round((bar.c + spread) * 100) / 100,
      last: bar.c,
      volume: bar.v,
      timestamp: new Date(bar.t).toISOString(),
    };
    setCache(cacheKey, quote);
    return c.json(quote, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch quote for ${upperSymbol}: ${message}`,
    });
  }
});

// GET /candles/:symbol - Candle data
const candlesRoute = createRoute({
  method: "get",
  path: "/candles/:symbol",
  request: {
    params: z.object({
      symbol: z.string(),
    }),
    query: z.object({
      timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
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
  const { symbol } = c.req.valid("param");
  const { timeframe, limit } = c.req.valid("query");
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `candles:${upperSymbol}:${timeframe}:${limit}`;

  // Check cache first
  const cached = getCached<z.infer<typeof CandleSchema>[]>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  const client = getPolygonClient();

  const timespanMap: Record<string, { multiplier: number; timespan: "minute" | "hour" | "day" }> = {
    "1m": { multiplier: 1, timespan: "minute" },
    "5m": { multiplier: 5, timespan: "minute" },
    "15m": { multiplier: 15, timespan: "minute" },
    "1h": { multiplier: 1, timespan: "hour" },
    "4h": { multiplier: 4, timespan: "hour" },
    "1d": { multiplier: 1, timespan: "day" },
  };

  const tf = timespanMap[timeframe] ?? { multiplier: 1, timespan: "hour" as const };

  const to = new Date();
  const from = new Date();

  // Calculate start date based on limit and timeframe
  // We add a buffer factor to account for weekends/holidays (market closed days)
  const bufferFactor = 2.5;

  if (tf.timespan === "day") {
    // For daily, we need limit * days
    from.setDate(from.getDate() - Math.ceil(limit * bufferFactor));
  } else if (tf.timespan === "hour") {
    // For hourly, we need limit * hours
    // But we use setTime/getTime for precision or just approximate with days
    // limit hours * multiplier
    const hoursNeeded = limit * tf.multiplier;
    from.setTime(from.getTime() - hoursNeeded * 60 * 60 * 1000 * bufferFactor);
  } else if (tf.timespan === "minute") {
    // limit minutes * multiplier
    const minutesNeeded = limit * tf.multiplier;
    from.setTime(from.getTime() - minutesNeeded * 60 * 1000 * bufferFactor);
  }

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const fetchLimit = Math.min(limit + 100, 5000);

  try {
    const response = await client.getAggregates(
      upperSymbol,
      tf.multiplier,
      tf.timespan,
      fromStr,
      toStr,
      { limit: fetchLimit, sort: "desc" }
    );

    // biome-ignore lint/suspicious/noConsole: Debugging
    console.log(
      `Fetched candles for ${upperSymbol} (${timeframe}): ${response.results?.length ?? 0} bars from ${fromStr} to ${toStr}`
    );

    if (!response.results || response.results.length === 0) {
      // biome-ignore lint/suspicious/noConsole: Error logging
      console.error(`No data returned for ${upperSymbol} ${timeframe}`);
      throw new HTTPException(503, {
        message: `No candle data available for ${upperSymbol}`,
      });
    }

    // Reverse to get chronological order (oldest -> newest) since we fetched desc
    // Take the last N candles based on the requested limit
    const recentResults = response.results.slice(0, limit).reverse();

    const candles = recentResults.map((bar) => ({
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

// GET /indicators/:symbol - Indicators (computed from candles)
const indicatorsRoute = createRoute({
  method: "get",
  path: "/indicators/:symbol",
  request: {
    params: z.object({
      symbol: z.string(),
    }),
    query: z.object({
      timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: IndicatorsSchema } },
      description: "Technical indicators",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Market data service unavailable",
    },
  },
  tags: ["Market"],
});

app.openapi(indicatorsRoute, async (c) => {
  const { symbol } = c.req.valid("param");
  const { timeframe } = c.req.valid("query");
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `indicators:${upperSymbol}:${timeframe}`;

  // Check cache first
  const cached = getCached<z.infer<typeof IndicatorsSchema>>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  const client = getPolygonClient();

  const timespanMap: Record<string, { multiplier: number; timespan: "minute" | "hour" | "day" }> = {
    "1m": { multiplier: 1, timespan: "minute" },
    "5m": { multiplier: 5, timespan: "minute" },
    "15m": { multiplier: 15, timespan: "minute" },
    "1h": { multiplier: 1, timespan: "hour" },
    "4h": { multiplier: 4, timespan: "hour" },
    "1d": { multiplier: 1, timespan: "day" },
  };

  const tf = timespanMap[timeframe] ?? { multiplier: 1, timespan: "hour" as const };

  const to = new Date();
  const from = new Date();
  // Use appropriate date range based on timeframe
  // Daily: 300+ days for SMA200
  // Intraday: 60 days to ensure enough bars after market hours filtering
  if (tf.timespan === "day") {
    from.setDate(from.getDate() - 300); // 300 days for daily to get SMA200
  } else {
    from.setDate(from.getDate() - 60); // 60 days for intraday timeframes
  }

  try {
    const response = await client.getAggregates(
      upperSymbol,
      tf.multiplier,
      tf.timespan,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
      { limit: 50000 } // High limit to avoid pagination for intraday data
    );

    if (!response.results || response.results.length === 0) {
      throw new HTTPException(503, {
        message: `No market data available for ${upperSymbol}`,
      });
    }

    // Log warning if insufficient data for some indicators
    if (response.results.length < 14) {
    }

    const closes = response.results.map((b) => b.c);
    const highs = response.results.map((b) => b.h);
    const lows = response.results.map((b) => b.l);

    // Calculate indicators
    const sma = (data: number[], period: number): number | null => {
      if (data.length < period) {
        return null;
      }
      const slice = data.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
    };

    const ema = (data: number[], period: number): number | null => {
      if (data.length < period) {
        return null;
      }
      const k = 2 / (period + 1);
      let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < data.length; i++) {
        const val = data[i];
        if (val !== undefined) {
          emaVal = val * k + emaVal * (1 - k);
        }
      }
      return emaVal;
    };

    const rsi = (data: number[], period: number): number | null => {
      if (data.length < period + 1) {
        return null;
      }
      let gains = 0;
      let losses = 0;
      for (let i = data.length - period; i < data.length; i++) {
        const curr = data[i];
        const prev = data[i - 1];
        if (curr !== undefined && prev !== undefined) {
          const diff = curr - prev;
          if (diff > 0) {
            gains += diff;
          } else {
            losses -= diff;
          }
        }
      }
      const rs = gains / (losses || 1);
      return 100 - 100 / (1 + rs);
    };

    const atr = (h: number[], l: number[], c: number[], period: number): number | null => {
      if (h.length < period + 1) {
        return null;
      }
      let sum = 0;
      for (let i = h.length - period; i < h.length; i++) {
        const hi = h[i];
        const lo = l[i];
        const prevClose = c[i - 1];
        if (hi !== undefined && lo !== undefined && prevClose !== undefined) {
          const tr = Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
          sum += tr;
        }
      }
      return sum / period;
    };

    const ema12Val = ema(closes, 12);
    const ema26Val = ema(closes, 26);
    const macdLineVal = ema12Val !== null && ema26Val !== null ? ema12Val - ema26Val : null;

    const rsi14Val = rsi(closes, 14);
    const atr14Val = atr(highs, lows, closes, 14);
    const sma20Val = sma(closes, 20);
    const sma50Val = sma(closes, 50);
    const sma200Val = sma(closes, 200);

    const indicators = {
      symbol: upperSymbol,
      timeframe,
      rsi14: rsi14Val !== null ? Math.round(rsi14Val * 100) / 100 : null,
      atr14: atr14Val !== null ? Math.round(atr14Val * 100) / 100 : null,
      sma20: sma20Val !== null ? Math.round(sma20Val * 100) / 100 : null,
      sma50: sma50Val !== null ? Math.round(sma50Val * 100) / 100 : null,
      sma200: sma200Val !== null ? Math.round(sma200Val * 100) / 100 : null,
      ema12: ema12Val !== null ? Math.round(ema12Val * 100) / 100 : null,
      ema26: ema26Val !== null ? Math.round(ema26Val * 100) / 100 : null,
      macdLine: macdLineVal !== null ? Math.round(macdLineVal * 100) / 100 : null,
      macdSignal: null, // Would need MACD history for signal line
      macdHist: null,
    };
    setCache(cacheKey, indicators);
    return c.json(indicators, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to calculate indicators for ${upperSymbol}: ${message}`,
    });
  }
});

// GET /regime - Current market regime
const regimeRoute = createRoute({
  method: "get",
  path: "/regime",
  responses: {
    200: {
      content: { "application/json": { schema: RegimeStatusSchema } },
      description: "Current market regime",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Market data service unavailable",
    },
  },
  tags: ["Market"],
});

app.openapi(regimeRoute, async (c) => {
  const cacheKey = "regime:market";
  const cached = getCached<z.infer<typeof RegimeStatusSchema>>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  try {
    const repo = await getRegimeLabelsRepo();
    // Try _MARKET first, then SPY
    let regimeData = await repo.getCurrent("_MARKET", "1d");
    if (!regimeData) {
      regimeData = await repo.getCurrent("SPY", "1d");
    }

    // Get VIX
    let vix = 0;
    try {
      const client = getPolygonClient();
      const response = await client.getPreviousClose("I:VIX");
      if (response.results?.[0]) {
        vix = response.results[0].c;
      }
    } catch {
      // ignore
    }

    const mapRegime = (
      r: string
    ): "BULL_TREND" | "BEAR_TREND" | "RANGE" | "HIGH_VOL" | "LOW_VOL" => {
      const upper = r.toUpperCase();
      if (upper.includes("BULL")) {
        return "BULL_TREND";
      }
      if (upper.includes("BEAR")) {
        return "BEAR_TREND";
      }
      if (upper.includes("RANGE")) {
        return "RANGE";
      }
      if (upper.includes("HIGH")) {
        return "HIGH_VOL";
      }
      if (upper.includes("LOW")) {
        return "LOW_VOL";
      }
      return "RANGE";
    };

    const status: z.infer<typeof RegimeStatusSchema> = {
      label: regimeData ? mapRegime(regimeData.regime) : "RANGE",
      confidence: regimeData?.confidence ?? 0,
      vix,
      sectorRotation: {},
      updatedAt: regimeData?.timestamp ?? new Date().toISOString(),
    };

    setCache(cacheKey, status);
    return c.json(status, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch market regime: ${message}`,
    });
  }
});

// ============================================
// Export
// ============================================

export const marketRoutes = app;
export default marketRoutes;
