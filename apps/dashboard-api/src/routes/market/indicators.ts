/**
 * Indicators Routes
 *
 * Endpoints for computed technical indicators (RSI, ATR, SMA, EMA, MACD).
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import type { AlpacaTimeframe } from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ErrorSchema,
  getAlpacaClient,
  getCached,
  type Indicators,
  IndicatorsSchema,
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
// Indicator Calculation Functions
// ============================================

function sma(data: number[], period: number): number | null {
  if (data.length < period) {
    return null;
  }
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(data: number[], period: number): number | null {
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
}

function rsi(data: number[], period: number): number | null {
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
}

function atr(highs: number[], lows: number[], closes: number[], period: number): number | null {
  if (highs.length < period + 1) {
    return null;
  }
  let sum = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const hi = highs[i];
    const lo = lows[i];
    const prevClose = closes[i - 1];
    if (hi !== undefined && lo !== undefined && prevClose !== undefined) {
      const tr = Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
      sum += tr;
    }
  }
  return sum / period;
}

function roundTo2(value: number | null): number | null {
  return value !== null ? Math.round(value * 100) / 100 : null;
}

// ============================================
// Routes
// ============================================

const indicatorsRoute = createRoute({
  method: "get",
  path: "/indicators/:symbol",
  request: {
    params: z.object({
      symbol: z.string(),
    }),
    query: z.object({
      timeframe: TimeframeSchema.default("1h"),
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

  const cached = getCached<Indicators>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  const client = getAlpacaClient();
  const alpacaTimeframe = ALPACA_TIMEFRAME_MAP[timeframe as Timeframe];
  const isIntraday = timeframe !== "1d";

  const to = new Date();
  const from = new Date();
  if (isIntraday) {
    from.setDate(from.getDate() - 60);
  } else {
    from.setDate(from.getDate() - 300);
  }

  try {
    const bars = await client.getBars(
      upperSymbol,
      alpacaTimeframe,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
      10000
    );

    if (!bars || bars.length === 0) {
      throw new HTTPException(503, {
        message: `No market data available for ${upperSymbol}`,
      });
    }

    // Filter to market hours for intraday
    let filteredBars = bars;
    if (isIntraday) {
      filteredBars = bars.filter((bar) => isMarketHours(new Date(bar.timestamp)));
    }

    const closes = filteredBars.map((b) => b.close);
    const highs = filteredBars.map((b) => b.high);
    const lows = filteredBars.map((b) => b.low);

    const ema12Val = ema(closes, 12);
    const ema26Val = ema(closes, 26);
    const macdLineVal = ema12Val !== null && ema26Val !== null ? ema12Val - ema26Val : null;

    const indicators: Indicators = {
      symbol: upperSymbol,
      timeframe,
      rsi14: roundTo2(rsi(closes, 14)),
      atr14: roundTo2(atr(highs, lows, closes, 14)),
      sma20: roundTo2(sma(closes, 20)),
      sma50: roundTo2(sma(closes, 50)),
      sma200: roundTo2(sma(closes, 200)),
      ema12: roundTo2(ema12Val),
      ema26: roundTo2(ema26Val),
      macdLine: roundTo2(macdLineVal),
      macdSignal: null,
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

export default app;
