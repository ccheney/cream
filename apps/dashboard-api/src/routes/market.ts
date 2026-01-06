/**
 * Market Data API Routes
 *
 * Routes for quotes, candles, indicators, and market regime.
 *
 * @see docs/plans/ui/05-api-endpoints.md Market Data section
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

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
  rsi14: z.number(),
  stochK: z.number(),
  stochD: z.number(),
  sma20: z.number(),
  sma50: z.number(),
  sma200: z.number(),
  ema12: z.number(),
  ema26: z.number(),
  atr14: z.number(),
  bbUpper: z.number(),
  bbMiddle: z.number(),
  bbLower: z.number(),
  macdLine: z.number(),
  macdSignal: z.number(),
  macdHist: z.number(),
});

const RegimeStatusSchema = z.object({
  label: z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]),
  confidence: z.number(),
  vix: z.number(),
  sectorRotation: z.record(z.string(), z.number()),
  updatedAt: z.string(),
});

const NewsItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  title: z.string(),
  source: z.string(),
  url: z.string(),
  publishedAt: z.string(),
  sentiment: z.number(),
  summary: z.string().nullable(),
});

const IndexQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  last: z.number(),
  change: z.number(),
  changePct: z.number(),
  timestamp: z.string(),
});

// ============================================
// Mock Data Generators
// ============================================

function generateMockQuote(symbol: string): z.infer<typeof QuoteSchema> {
  const base = 100 + Math.random() * 400;
  const spread = base * 0.001;
  return {
    symbol,
    bid: Math.round((base - spread) * 100) / 100,
    ask: Math.round((base + spread) * 100) / 100,
    last: Math.round(base * 100) / 100,
    volume: Math.floor(Math.random() * 10000000),
    timestamp: new Date().toISOString(),
  };
}

function generateMockCandles(_symbol: string, count: number): z.infer<typeof CandleSchema>[] {
  const candles: z.infer<typeof CandleSchema>[] = [];
  let price = 100 + Math.random() * 400;
  const now = Date.now();

  for (let i = count - 1; i >= 0; i--) {
    const volatility = price * 0.02;
    const open = price;
    const change = (Math.random() - 0.5) * volatility;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    candles.push({
      timestamp: new Date(now - i * 3600000).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 1000000),
    });

    price = close;
  }

  return candles;
}

function generateMockIndicators(
  symbol: string,
  timeframe: string
): z.infer<typeof IndicatorsSchema> {
  const price = 100 + Math.random() * 400;
  const atr = price * 0.02;

  return {
    symbol,
    timeframe,
    rsi14: 30 + Math.random() * 40,
    stochK: Math.random() * 100,
    stochD: Math.random() * 100,
    sma20: price * (0.98 + Math.random() * 0.04),
    sma50: price * (0.95 + Math.random() * 0.1),
    sma200: price * (0.9 + Math.random() * 0.2),
    ema12: price * (0.99 + Math.random() * 0.02),
    ema26: price * (0.98 + Math.random() * 0.04),
    atr14: atr,
    bbUpper: price + 2 * atr,
    bbMiddle: price,
    bbLower: price - 2 * atr,
    macdLine: (Math.random() - 0.5) * 5,
    macdSignal: (Math.random() - 0.5) * 4,
    macdHist: (Math.random() - 0.5) * 2,
  };
}

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
      content: {
        "application/json": {
          schema: z.array(QuoteSchema),
        },
      },
      description: "Batch quotes",
    },
  },
  tags: ["Market"],
});

app.openapi(quotesRoute, (c) => {
  const { symbols } = c.req.valid("query");
  const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
  const quotes = symbolList.map(generateMockQuote);
  return c.json(quotes);
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
      content: {
        "application/json": {
          schema: QuoteSchema,
        },
      },
      description: "Quote",
    },
  },
  tags: ["Market"],
});

app.openapi(quoteRoute, (c) => {
  const { symbol } = c.req.valid("param");
  return c.json(generateMockQuote(symbol.toUpperCase()));
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
      content: {
        "application/json": {
          schema: z.array(CandleSchema),
        },
      },
      description: "Candle data",
    },
  },
  tags: ["Market"],
});

app.openapi(candlesRoute, (c) => {
  const { symbol } = c.req.valid("param");
  const { limit } = c.req.valid("query");
  return c.json(generateMockCandles(symbol.toUpperCase(), limit));
});

// GET /indicators/:symbol - Indicators
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
      content: {
        "application/json": {
          schema: IndicatorsSchema,
        },
      },
      description: "Technical indicators",
    },
  },
  tags: ["Market"],
});

app.openapi(indicatorsRoute, (c) => {
  const { symbol } = c.req.valid("param");
  const { timeframe } = c.req.valid("query");
  return c.json(generateMockIndicators(symbol.toUpperCase(), timeframe));
});

// GET /regime - Current market regime
const regimeRoute = createRoute({
  method: "get",
  path: "/regime",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RegimeStatusSchema,
        },
      },
      description: "Market regime",
    },
  },
  tags: ["Market"],
});

app.openapi(regimeRoute, (c) => {
  const labels: z.infer<typeof RegimeStatusSchema>["label"][] = [
    "BULL_TREND",
    "BEAR_TREND",
    "RANGE",
    "HIGH_VOL",
    "LOW_VOL",
  ];

  const labelIndex = Math.floor(Math.random() * labels.length);

  return c.json({
    label: labels[labelIndex] ?? "RANGE",
    confidence: 0.6 + Math.random() * 0.35,
    vix: 12 + Math.random() * 20,
    sectorRotation: {
      XLK: Math.random() * 2 - 1,
      XLF: Math.random() * 2 - 1,
      XLE: Math.random() * 2 - 1,
      XLV: Math.random() * 2 - 1,
      XLI: Math.random() * 2 - 1,
    },
    updatedAt: new Date().toISOString(),
  });
});

// GET /news/:symbol - Symbol news
const newsRoute = createRoute({
  method: "get",
  path: "/news/:symbol",
  request: {
    params: z.object({
      symbol: z.string(),
    }),
    query: z.object({
      limit: z.coerce.number().min(1).max(50).default(10),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(NewsItemSchema),
        },
      },
      description: "News items",
    },
  },
  tags: ["Market"],
});

app.openapi(newsRoute, (c) => {
  const { symbol } = c.req.valid("param");
  const { limit } = c.req.valid("query");

  const sources = ["Reuters", "Bloomberg", "WSJ", "CNBC"] as const;
  const news: z.infer<typeof NewsItemSchema>[] = [];
  for (let i = 0; i < limit; i++) {
    news.push({
      id: `news-${i}`,
      symbol: symbol.toUpperCase(),
      title: `${symbol.toUpperCase()} News Headline ${i + 1}`,
      source: sources[i % sources.length] ?? "Reuters",
      url: `https://example.com/news/${i}`,
      publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
      sentiment: Math.random() * 2 - 1,
      summary: `Summary of news article ${i + 1} about ${symbol.toUpperCase()}.`,
    });
  }

  return c.json(news);
});

// GET /indices - Market indices
const indicesRoute = createRoute({
  method: "get",
  path: "/indices",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(IndexQuoteSchema),
        },
      },
      description: "Index quotes",
    },
  },
  tags: ["Market"],
});

app.openapi(indicesRoute, (c) => {
  const indices = [
    { symbol: "SPY", name: "S&P 500" },
    { symbol: "QQQ", name: "NASDAQ 100" },
    { symbol: "DIA", name: "Dow Jones" },
    { symbol: "IWM", name: "Russell 2000" },
    { symbol: "VIX", name: "CBOE Volatility" },
  ];

  return c.json(
    indices.map((idx) => {
      const last = 100 + Math.random() * 400;
      const change = (Math.random() - 0.5) * 10;
      return {
        symbol: idx.symbol,
        name: idx.name,
        last: Math.round(last * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePct: Math.round((change / last) * 10000) / 100,
        timestamp: new Date().toISOString(),
      };
    })
  );
});

// ============================================
// Export
// ============================================

export const marketRoutes = app;
export default marketRoutes;
