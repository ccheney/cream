/**
 * Execute Orders Step
 *
 * Step 10: Send approved orders to execution engine.
 *
 * Uses @cream/broker for direct Alpaca API integration.
 * The Rust gRPC execution engine provides additional features
 * (bracket orders, TWAP/VWAP tactics) but broker package is the primary path.
 */

import {
  type AlpacaClient,
  createBrokerClient,
  generateOrderId,
  type OrderRequest,
  type OrderSide,
  type OrderType,
} from "@cream/broker";
import { isBacktest } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const ValidationResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.string()),
  adjustedPlan: z.any().optional(),
});

export const ExecutionResultSchema = z.object({
  ordersSubmitted: z.number(),
  ordersRejected: z.number(),
  orderIds: z.array(z.string()),
  errors: z.array(z.string()),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// Decision from the trading plan
interface Decision {
  decisionId: string;
  instrumentId: string;
  action: "BUY" | "SELL" | "HOLD" | "CLOSE";
  direction: "LONG" | "SHORT" | "FLAT";
  size: {
    value: number;
    unit: "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
  };
  stopLoss?: { price: number; type: "FIXED" | "TRAILING" };
  takeProfit?: { price: number };
  strategyFamily: string;
  timeHorizon: string;
}

// Singleton broker client
let brokerClient: AlpacaClient | null = null;

function getBrokerClient(): AlpacaClient | null {
  if (brokerClient) {
    return brokerClient;
  }

  // Check for required credentials
  const apiKey = process.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  brokerClient = createBrokerClient();
  return brokerClient;
}

/**
 * Convert decision to order request
 */
function decisionToOrderRequest(decision: Decision): OrderRequest | null {
  // Skip HOLD and FLAT decisions
  if (decision.action === "HOLD" || decision.direction === "FLAT") {
    return null;
  }

  // Map action/direction to side
  let side: OrderSide;
  if (decision.action === "BUY") {
    side = "buy";
  } else if (decision.action === "SELL" || decision.action === "CLOSE") {
    side = "sell";
  } else {
    return null;
  }

  // For short positions, invert the side
  if (decision.direction === "SHORT") {
    side = side === "buy" ? "sell" : "buy";
  }

  // Determine order type (market for immediate execution)
  const orderType: OrderType = "market";

  // Build order request
  const orderRequest: OrderRequest = {
    clientOrderId: generateOrderId("cream"),
    symbol: decision.instrumentId,
    qty: decision.size.value,
    side,
    type: orderType,
    timeInForce: decision.timeHorizon === "INTRADAY" ? "day" : "gtc",
  };

  return orderRequest;
}

export const executeOrdersStep = createStep({
  id: "execute-orders",
  description: "Send approved orders to execution engine",
  inputSchema: ValidationResultSchema,
  outputSchema: ExecutionResultSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    const { approved, adjustedPlan } = inputData;

    // If not approved, skip execution
    if (!approved) {
      return {
        ordersSubmitted: 0,
        ordersRejected: 0,
        orderIds: [],
        errors: ["Plan not approved"],
      };
    }

    const decisions = (adjustedPlan?.decisions ?? []) as Decision[];
    const tradableDecisions = decisions.filter((d) => d.action !== "HOLD");

    // In backtest mode, simulate order execution
    if (isBacktest()) {
      const orderIds = tradableDecisions.map(
        (_: unknown, i: number) => `backtest-order-${Date.now()}-${i}`
      );

      return {
        ordersSubmitted: orderIds.length,
        ordersRejected: 0,
        orderIds,
        errors: [],
      };
    }

    // In PAPER/LIVE mode, submit orders via broker client
    const client = getBrokerClient();
    if (!client) {
      // No broker credentials - return mock order IDs for dev/testing
      const orderIds = tradableDecisions.map(
        (_: unknown, i: number) => `mock-order-${Date.now()}-${i}`
      );
      return {
        ordersSubmitted: orderIds.length,
        ordersRejected: 0,
        orderIds,
        errors: ["Broker credentials not configured - using mock orders"],
      };
    }

    // Submit orders in parallel
    const orderPromises = tradableDecisions.map(async (decision) => {
      const orderRequest = decisionToOrderRequest(decision);
      if (!orderRequest) {
        return { success: false, error: `Invalid decision: ${decision.decisionId}` };
      }

      try {
        const order = await client.submitOrder(orderRequest);
        return { success: true, orderId: order.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `${decision.instrumentId}: ${message}` };
      }
    });

    const results = await Promise.all(orderPromises);

    const submitted = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success);

    return {
      ordersSubmitted: submitted.length,
      ordersRejected: rejected.length,
      orderIds: submitted.map((r) => r.orderId).filter((id): id is string => id !== undefined),
      errors: rejected.map((r) => r.error).filter((e): e is string => e !== undefined),
    };
  },
});
