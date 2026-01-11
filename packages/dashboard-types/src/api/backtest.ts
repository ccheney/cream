/**
 * Backtest API Types
 *
 * Types for backtest status, summary, metrics, trades, and equity curves.
 */

import { z } from "zod";

// ============================================
// Backtest Status
// ============================================

export const BacktestStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type BacktestStatus = z.infer<typeof BacktestStatusSchema>;

// ============================================
// Backtest Summary
// ============================================

export const BacktestSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: BacktestStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  initialCapital: z.number(),
  createdAt: z.string(),
});

export type BacktestSummary = z.infer<typeof BacktestSummarySchema>;

// ============================================
// Backtest Metrics
// ============================================

export const BacktestMetricsSchema = z.object({
  totalReturnPct: z.number(),
  sharpeRatio: z.number(),
  maxDrawdownPct: z.number(),
  winRate: z.number(),
  profitFactor: z.number(),
  totalTrades: z.number(),
});

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

// ============================================
// Backtest Detail (Extended)
// ============================================

export const BacktestDetailSchema = BacktestSummarySchema.extend({
  metrics: BacktestMetricsSchema.nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});

export type BacktestDetail = z.infer<typeof BacktestDetailSchema>;

// ============================================
// Backtest Trades
// ============================================

export const BacktestTradeActionSchema = z.enum(["BUY", "SELL"]);
export type BacktestTradeAction = z.infer<typeof BacktestTradeActionSchema>;

export const BacktestTradeSchema = z.object({
  id: z.string(),
  backtestId: z.string(),
  timestamp: z.string(),
  symbol: z.string(),
  action: BacktestTradeActionSchema,
  qty: z.number(),
  price: z.number(),
  pnl: z.number().nullable(),
});

export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

// ============================================
// Backtest Equity Curve
// ============================================

export const BacktestEquityPointSchema = z.object({
  timestamp: z.string(),
  nav: z.number(),
});

export type BacktestEquityPoint = z.infer<typeof BacktestEquityPointSchema>;
