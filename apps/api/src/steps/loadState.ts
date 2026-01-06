/**
 * Load State Step
 *
 * Step 1: Load portfolio positions, open orders, and thesis states from Turso.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const PositionSchema = z.object({
  symbol: z.string(),
  quantity: z.number(),
  avgCost: z.number(),
  currentPrice: z.number().optional(),
  unrealizedPnl: z.number().optional(),
});

export const OrderSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number(),
  orderType: z.string(),
  status: z.string(),
  filledQty: z.number().optional(),
});

export const ThesisStateSchema = z.object({
  thesisId: z.string(),
  symbol: z.string(),
  direction: z.enum(["LONG", "SHORT", "FLAT"]),
  entryPrice: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  status: z.enum(["ACTIVE", "CLOSED", "PENDING"]),
});

export const LoadStateOutputSchema = z.object({
  positions: z.array(PositionSchema),
  openOrders: z.array(OrderSchema),
  thesisStates: z.array(ThesisStateSchema),
  accountBalance: z.number(),
  buyingPower: z.number(),
  timestamp: z.string(),
});

export type LoadStateOutput = z.infer<typeof LoadStateOutputSchema>;

export const loadStateStep = createStep({
  id: "load-state",
  description: "Load portfolio positions, open orders, and thesis states",
  inputSchema: z.object({
    cycleId: z.string(),
    environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  }),
  outputSchema: LoadStateOutputSchema,
  retries: 3,
  execute: async ({ inputData }) => {
    // TODO: Implement actual database queries
    // For now, return mock data
    return {
      positions: [],
      openOrders: [],
      thesisStates: [],
      accountBalance: 100000,
      buyingPower: 100000,
      timestamp: new Date().toISOString(),
    };
  },
});
