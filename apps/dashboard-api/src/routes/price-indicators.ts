/**
 * Price Indicators API Routes
 *
 * Lightweight endpoint for price-based technical indicators.
 * Uses the IndicatorService from @cream/indicators for calculations.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { AlpacaTimeframe } from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../logger.js";
import {
  ErrorSchema,
  getAlpacaClient,
  getCached,
  isMarketHours,
  setCache,
  type Timeframe,
  TimeframeSchema,
} from "./market/types.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const PriceIndicatorsResponseSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  timestamp: z.string(),
  indicators: z.object({
    // Momentum
    rsi_14: z.number().nullable(),

    // Volatility
    atr_14: z.number().nullable(),

    // Trend - SMAs
    sma_20: z.number().nullable(),
    sma_50: z.number().nullable(),
    sma_200: z.number().nullable(),

    // Trend - EMAs
    ema_9: z.number().nullable(),
    ema_12: z.number().nullable(),
    ema_21: z.number().nullable(),
    ema_26: z.number().nullable(),

    // MACD
    macd_line: z.number().nullable(),
    macd_signal: z.number().nullable(),
    macd_histogram: z.number().nullable(),

    // Bollinger Bands
    bollinger_upper: z.number().nullable(),
    bollinger_middle: z.number().nullable(),
    bollinger_lower: z.number().nullable(),
    bollinger_bandwidth: z.number().nullable(),
    bollinger_percentb: z.number().nullable(),

    // Stochastic
    stochastic_k: z.number().nullable(),
    stochastic_d: z.number().nullable(),
  }),
});

type PriceIndicatorsResponse = z.infer<typeof PriceIndicatorsResponseSchema>;

// ============================================
// Timeframe Configuration
// ============================================

const ALPACA_TIMEFRAME_MAP: Record<Timeframe, AlpacaTimeframe> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "1h": "1Hour",
  "4h": "4Hour",
  "1d": "1Day",
};

// Bars needed for each timeframe to calculate all indicators
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1m": 5, // ~5 trading days for intraday
  "5m": 10,
  "15m": 30,
  "1h": 60,
  "4h": 120,
  "1d": 300, // ~300 trading days for daily
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

function bollingerBands(
  data: number[],
  period: number,
  stdDevMultiplier: number
): { upper: number; middle: number; lower: number; bandwidth: number; percentB: number } | null {
  if (data.length < period) {
    return null;
  }
  const slice = data.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + (val - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const bandwidth = (upper - lower) / middle;
  const lastPrice = data[data.length - 1] ?? middle;
  const percentB = (lastPrice - lower) / (upper - lower);
  return { upper, middle, lower, bandwidth, percentB };
}

function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number,
  dPeriod: number
): { k: number; d: number } | null {
  if (closes.length < kPeriod + dPeriod - 1) {
    return null;
  }

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...highSlice);
    const lowest = Math.min(...lowSlice);
    const close = closes[i] ?? 0;
    const k = ((close - lowest) / (highest - lowest || 1)) * 100;
    kValues.push(k);
  }

  if (kValues.length < dPeriod) {
    return null;
  }
  const k = kValues[kValues.length - 1] ?? 0;
  const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

function roundTo4(value: number | null): number | null {
  return value !== null ? Math.round(value * 10000) / 10000 : null;
}

// ============================================
// Route Definition
// ============================================

const getPriceIndicatorsRoute = createRoute({
  method: "get",
  path: "/:symbol/price",
  request: {
    params: z.object({
      symbol: z.string().min(1).max(10),
    }),
    query: z.object({
      timeframe: TimeframeSchema.default("1h"),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: PriceIndicatorsResponseSchema } },
      description: "Price-based technical indicators for the symbol",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Market data service unavailable",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getPriceIndicatorsRoute, async (c) => {
  const { symbol } = c.req.valid("param");
  const { timeframe } = c.req.valid("query");
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `price-indicators:${upperSymbol}:${timeframe}`;

  // Check cache first
  const cached = getCached<PriceIndicatorsResponse>(cacheKey);
  if (cached) {
    log.debug({ symbol: upperSymbol, timeframe, cacheKey }, "Cache hit for price indicators");
    return c.json(cached, 200);
  }

  const client = getAlpacaClient();
  const alpacaTimeframe = ALPACA_TIMEFRAME_MAP[timeframe as Timeframe];
  const lookbackDays = LOOKBACK_DAYS[timeframe as Timeframe];
  const isIntraday = timeframe !== "1d";

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays);

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

    // Filter to market hours for intraday timeframes
    let filteredBars = bars;
    if (isIntraday) {
      filteredBars = bars.filter((bar) => isMarketHours(new Date(bar.timestamp)));
    }

    if (filteredBars.length === 0) {
      throw new HTTPException(503, {
        message: `No market hours data available for ${upperSymbol}`,
      });
    }

    const closes = filteredBars.map((b) => b.close);
    const highs = filteredBars.map((b) => b.high);
    const lows = filteredBars.map((b) => b.low);

    // Calculate EMAs for MACD
    const ema9Val = ema(closes, 9);
    const ema12Val = ema(closes, 12);
    const ema21Val = ema(closes, 21);
    const ema26Val = ema(closes, 26);

    // MACD calculations
    const macdLine = ema12Val !== null && ema26Val !== null ? ema12Val - ema26Val : null;

    // MACD signal line (9-period EMA of MACD line)
    let macdSignal: number | null = null;
    let macdHistogram: number | null = null;
    if (macdLine !== null && closes.length >= 26 + 9) {
      // Calculate MACD line series for signal line
      const macdSeries: number[] = [];
      for (let i = 25; i < closes.length; i++) {
        const shortEma = ema(closes.slice(0, i + 1), 12);
        const longEma = ema(closes.slice(0, i + 1), 26);
        if (shortEma !== null && longEma !== null) {
          macdSeries.push(shortEma - longEma);
        }
      }
      if (macdSeries.length >= 9) {
        macdSignal = ema(macdSeries, 9);
        if (macdSignal !== null) {
          macdHistogram = macdLine - macdSignal;
        }
      }
    }

    // Bollinger Bands
    const bb = bollingerBands(closes, 20, 2);

    // Stochastic
    const stoch = stochastic(highs, lows, closes, 14, 3);

    const response: PriceIndicatorsResponse = {
      symbol: upperSymbol,
      timeframe,
      timestamp: new Date().toISOString(),
      indicators: {
        // Momentum
        rsi_14: roundTo4(rsi(closes, 14)),

        // Volatility
        atr_14: roundTo4(atr(highs, lows, closes, 14)),

        // Trend - SMAs
        sma_20: roundTo4(sma(closes, 20)),
        sma_50: roundTo4(sma(closes, 50)),
        sma_200: roundTo4(sma(closes, 200)),

        // Trend - EMAs
        ema_9: roundTo4(ema9Val),
        ema_12: roundTo4(ema12Val),
        ema_21: roundTo4(ema21Val),
        ema_26: roundTo4(ema26Val),

        // MACD
        macd_line: roundTo4(macdLine),
        macd_signal: roundTo4(macdSignal),
        macd_histogram: roundTo4(macdHistogram),

        // Bollinger Bands
        bollinger_upper: roundTo4(bb?.upper ?? null),
        bollinger_middle: roundTo4(bb?.middle ?? null),
        bollinger_lower: roundTo4(bb?.lower ?? null),
        bollinger_bandwidth: roundTo4(bb?.bandwidth ?? null),
        bollinger_percentb: roundTo4(bb?.percentB ?? null),

        // Stochastic
        stochastic_k: roundTo4(stoch?.k ?? null),
        stochastic_d: roundTo4(stoch?.d ?? null),
      },
    };

    setCache(cacheKey, response);
    return c.json(response, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    log.warn(
      { symbol: upperSymbol, timeframe, error: message },
      "Failed to calculate price indicators"
    );
    throw new HTTPException(503, {
      message: `Failed to calculate price indicators for ${upperSymbol}: ${message}`,
    });
  }
});

export default app;
