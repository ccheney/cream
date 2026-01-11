/**
 * Portfolio API Types
 *
 * Types for portfolio summary, positions, equity curves, and performance metrics.
 */

import { z } from "zod";

// ============================================
// Portfolio Summary
// ============================================

export const PortfolioSummarySchema = z.object({
  nav: z.number(),
  cash: z.number(),
  equity: z.number(),
  buyingPower: z.number(),
  grossExposure: z.number(),
  netExposure: z.number(),
  positionCount: z.number(),
  todayPnl: z.number(),
  todayPnlPct: z.number(),
  totalPnl: z.number(),
  totalPnlPct: z.number(),
  lastUpdated: z.string(),
});

export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

// ============================================
// Positions
// ============================================

export const PositionSideSchema = z.enum(["LONG", "SHORT"]);
export type PositionSide = z.infer<typeof PositionSideSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: PositionSideSchema,
  qty: z.number(),
  avgEntry: z.number(),
  currentPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  unrealizedPnl: z.number().nullable(),
  unrealizedPnlPct: z.number().nullable(),
  thesisId: z.string().nullable(),
  daysHeld: z.number(),
  openedAt: z.string(),
});

export type Position = z.infer<typeof PositionSchema>;

// ============================================
// Equity Curve
// ============================================

export const EquityPointSchema = z.object({
  timestamp: z.string(),
  nav: z.number(),
  drawdown: z.number(),
  drawdownPct: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

// ============================================
// Performance Metrics
// ============================================

export const PeriodMetricsSchema = z.object({
  return: z.number(),
  returnPct: z.number(),
  trades: z.number(),
  winRate: z.number(),
});

export type PeriodMetrics = z.infer<typeof PeriodMetricsSchema>;

export const PerformanceMetricsSchema = z.object({
  periods: z.object({
    today: PeriodMetricsSchema,
    week: PeriodMetricsSchema,
    month: PeriodMetricsSchema,
    ytd: PeriodMetricsSchema,
    total: PeriodMetricsSchema,
  }),
  sharpeRatio: z.number(),
  sortinoRatio: z.number(),
  maxDrawdown: z.number(),
  maxDrawdownPct: z.number(),
  winRate: z.number(),
  profitFactor: z.number(),
  avgWin: z.number(),
  avgLoss: z.number(),
  totalTrades: z.number(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
