/**
 * Account API Types
 *
 * Types for Alpaca trading account information.
 */

import { z } from "zod";

// ============================================
// Account Status
// ============================================

export const AccountStatusSchema = z.enum([
  "ACTIVE",
  "SUBMITTED",
  "APPROVAL_PENDING",
  "APPROVED",
  "REJECTED",
  "CLOSED",
  "DISABLED",
]);

export type AccountStatus = z.infer<typeof AccountStatusSchema>;

// ============================================
// Account
// ============================================

export const AccountSchema = z.object({
  id: z.string(),
  status: AccountStatusSchema,
  currency: z.string(),
  cash: z.number(),
  portfolioValue: z.number(),
  buyingPower: z.number(),
  daytradeCount: z.number(),
  patternDayTrader: z.boolean(),
  tradingBlocked: z.boolean(),
  transfersBlocked: z.boolean(),
  accountBlocked: z.boolean(),
  shortingEnabled: z.boolean(),
  longMarketValue: z.number(),
  shortMarketValue: z.number(),
  equity: z.number(),
  lastEquity: z.number(),
  multiplier: z.number(),
  initialMargin: z.number(),
  maintenanceMargin: z.number(),
  sma: z.number(),
  createdAt: z.string(),
});

export type Account = z.infer<typeof AccountSchema>;

// ============================================
// Portfolio History
// ============================================

export const PortfolioHistoryTimeframeSchema = z.enum(["1Min", "5Min", "15Min", "1H", "1D"]);

export type PortfolioHistoryTimeframe = z.infer<typeof PortfolioHistoryTimeframeSchema>;

export const PortfolioHistoryPeriodSchema = z.enum(["1D", "1W", "1M", "3M", "1A", "all"]);

export type PortfolioHistoryPeriod = z.infer<typeof PortfolioHistoryPeriodSchema>;

export const PortfolioHistoryPointSchema = z.object({
  timestamp: z.number(),
  equity: z.number(),
  profitLoss: z.number(),
  profitLossPct: z.number(),
});

export type PortfolioHistoryPoint = z.infer<typeof PortfolioHistoryPointSchema>;

export const PortfolioHistorySchema = z.object({
  timestamp: z.array(z.number()),
  equity: z.array(z.number()),
  profitLoss: z.array(z.number()),
  profitLossPct: z.array(z.number()),
  timeframe: PortfolioHistoryTimeframeSchema,
  baseValue: z.number(),
});

export type PortfolioHistory = z.infer<typeof PortfolioHistorySchema>;
