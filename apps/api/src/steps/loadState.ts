/**
 * Load State Step
 *
 * Step 1: Load portfolio positions, open orders, and thesis states from Turso.
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

import { getOrdersRepo, getPositionsRepo, getThesisStateRepo } from "../db.js";

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

/**
 * Map thesis state to direction for agent context
 */
function mapThesisStateToDirection(
  state: "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED"
): "LONG" | "SHORT" | "FLAT" {
  switch (state) {
    case "ENTERED":
    case "ADDING":
    case "MANAGING":
    case "EXITING":
      return "LONG"; // Active position states
    default:
      return "FLAT";
  }
}

/**
 * Map thesis state to status for agent context
 */
function mapThesisStateToStatus(
  state: "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED"
): "ACTIVE" | "CLOSED" | "PENDING" {
  switch (state) {
    case "ENTERED":
    case "ADDING":
    case "MANAGING":
    case "EXITING":
      return "ACTIVE";
    case "CLOSED":
      return "CLOSED";
    default:
      return "PENDING";
  }
}

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
    const { environment } = inputData;

    // Create context at step boundary
    const ctx = createStepContext();

    // In backtest mode, return empty state for faster execution
    if (isBacktest(ctx)) {
      return {
        positions: [],
        openOrders: [],
        thesisStates: [],
        accountBalance: 100000,
        buyingPower: 100000,
        timestamp: new Date().toISOString(),
      };
    }

    // Fetch repositories
    const [positionsRepo, ordersRepo, thesisRepo] = await Promise.all([
      getPositionsRepo(),
      getOrdersRepo(),
      getThesisStateRepo(),
    ]);

    // Fetch data in parallel
    const [openPositions, activeOrders, activeTheses, portfolioSummary] = await Promise.all([
      positionsRepo.findOpen(environment),
      ordersRepo.findActive(environment),
      thesisRepo.findActive(environment),
      positionsRepo.getPortfolioSummary(environment),
    ]);

    // Map positions to output schema
    const positions = openPositions.map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgEntryPrice,
      currentPrice: p.currentPrice ?? undefined,
      unrealizedPnl: p.unrealizedPnl ?? undefined,
    }));

    // Map orders to output schema
    const openOrders = activeOrders.map((o) => ({
      orderId: o.id,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      orderType: o.orderType,
      status: o.status,
      filledQty: o.filledQuantity > 0 ? o.filledQuantity : undefined,
    }));

    // Map thesis states to output schema
    const thesisStates = activeTheses.map((t) => ({
      thesisId: t.thesisId,
      symbol: t.instrumentId,
      direction: mapThesisStateToDirection(t.state),
      entryPrice: t.entryPrice ?? undefined,
      stopLoss: t.currentStop ?? undefined,
      takeProfit: t.currentTarget ?? undefined,
      status: mapThesisStateToStatus(t.state),
    }));

    // Calculate account balance and buying power
    // In real implementation, this would come from broker API
    const accountBalance = portfolioSummary.totalCostBasis + portfolioSummary.totalUnrealizedPnl;
    const buyingPower = Math.max(0, 100000 - portfolioSummary.totalMarketValue);

    return {
      positions,
      openOrders,
      thesisStates,
      accountBalance,
      buyingPower,
      timestamp: new Date().toISOString(),
    };
  },
});
