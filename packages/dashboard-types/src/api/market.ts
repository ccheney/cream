/**
 * Market Data API Types
 *
 * Types for quotes, candles, technical indicators, market regime, and news.
 */

import { z } from "zod";

// ============================================
// Quotes
// ============================================

export const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  timestamp: z.string(),
});

export type Quote = z.infer<typeof QuoteSchema>;

// ============================================
// Candles (OHLCV)
// ============================================

export const CandleSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export type Candle = z.infer<typeof CandleSchema>;

// ============================================
// Technical Indicators
// ============================================

export const IndicatorsSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  rsi14: z.number(),
  atr14: z.number(),
  sma20: z.number(),
  sma50: z.number(),
  sma200: z.number(),
  ema12: z.number(),
  ema26: z.number(),
  macd: z.number(),
  macdSignal: z.number(),
  macdHist: z.number(),
  bbUpper: z.number(),
  bbMiddle: z.number(),
  bbLower: z.number(),
  timestamp: z.string(),
});

export type Indicators = z.infer<typeof IndicatorsSchema>;

// ============================================
// Market Regime
// ============================================

export const RegimeSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  indicators: z.object({
    vix: z.number(),
    breadth: z.number(),
    momentum: z.number(),
  }),
  timestamp: z.string(),
});

export type Regime = z.infer<typeof RegimeSchema>;

// ============================================
// News
// ============================================

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  url: z.string(),
  symbols: z.array(z.string()),
  sentiment: z.number(),
  publishedAt: z.string(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;
