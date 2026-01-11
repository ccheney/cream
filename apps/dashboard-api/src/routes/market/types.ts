/**
 * Market Route Types
 *
 * Shared schemas, cache utilities, and types used across market routes.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
  type AlpacaMarketDataClient,
  createAlpacaClientFromEnv,
  isAlpacaConfigured,
} from "@cream/marketdata";
import { z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

// ============================================
// Zod Schemas
// ============================================

export const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  prevClose: z.number().optional(),
  changePercent: z.number().optional(),
  timestamp: z.string(),
});

export const CandleSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const IndicatorsSchema = z.object({
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

export const RegimeStatusSchema = z.object({
  label: z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]),
  confidence: z.number(),
  vix: z.number(),
  sectorRotation: z.record(z.string(), z.number()),
  updatedAt: z.string(),
});

export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]);

// ============================================
// Types
// ============================================

export type Quote = z.infer<typeof QuoteSchema>;
export type Candle = z.infer<typeof CandleSchema>;
export type Indicators = z.infer<typeof IndicatorsSchema>;
export type RegimeStatus = z.infer<typeof RegimeStatusSchema>;
export type Timeframe = z.infer<typeof TimeframeSchema>;

export interface QuoteError {
  symbol: string;
  error: string;
}

export interface TimespanConfig {
  multiplier: number;
  timespan: "minute" | "hour" | "day";
}

// ============================================
// Constants
// ============================================

export const CACHE_TTL_MS = 60000; // 60 seconds
export const CACHE_VERSION = "v6"; // Bump to invalidate cache

export const MARKET_OPEN_HOUR = 7;
export const MARKET_OPEN_MINUTE = 0; // 7:00 AM ET
export const MARKET_CLOSE_HOUR = 17;
export const MARKET_CLOSE_MINUTE = 0; // 5:00 PM ET

export const TIMESPAN_MAP: Record<Timeframe, TimespanConfig> = {
  "1m": { multiplier: 1, timespan: "minute" },
  "5m": { multiplier: 5, timespan: "minute" },
  "15m": { multiplier: 15, timespan: "minute" },
  "1h": { multiplier: 1, timespan: "hour" },
  "4h": { multiplier: 4, timespan: "hour" },
  "1d": { multiplier: 1, timespan: "day" },
};

// ============================================
// Cache
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
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

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================
// Alpaca Client Singleton
// ============================================

let alpacaClient: AlpacaMarketDataClient | null = null;

export function getAlpacaClient(): AlpacaMarketDataClient {
  if (alpacaClient) {
    return alpacaClient;
  }

  if (!isAlpacaConfigured()) {
    throw new HTTPException(503, {
      message: "Market data service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
    });
  }

  alpacaClient = createAlpacaClientFromEnv();
  return alpacaClient;
}

// Legacy alias for gradual migration
export const getPolygonClient = getAlpacaClient;

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a timestamp falls within extended market hours (ET).
 * Returns true for 7:00 AM - 5:00 PM ET on weekdays.
 */
export function isMarketHours(timestamp: Date): boolean {
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = etFormatter.formatToParts(timestamp);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const timeInMinutes = hour * 60 + minute;
  const openInMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const closeInMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;

  return timeInMinutes >= openInMinutes && timeInMinutes <= closeInMinutes;
}

/**
 * Get today's date in NY timezone formatted as YYYY-MM-DD.
 */
export function getTodayNY(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Get a date N days ago formatted as YYYY-MM-DD.
 */
export function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
