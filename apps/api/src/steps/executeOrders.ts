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
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { log } from "../logger.js";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

export const ValidationResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.string()),
  adjustedPlan: z
    .object({
      cycleId: z.string().optional(),
      decisions: z
        .array(
          z
            .object({
              decisionId: z.string().optional(),
              symbol: z.string().optional(),
              instrumentId: z.string().optional(),
            })
            .passthrough()
        )
        .optional(),
    })
    .passthrough()
    .optional(),
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

/**
 * Generate a deterministic mock order ID from cycle and decision IDs.
 *
 * Uses a simple hash function to create reproducible order IDs for
 * backtesting and mock execution modes.
 *
 * @param prefix - Order ID prefix (e.g., "backtest", "mock")
 * @param cycleId - The trading cycle identifier
 * @param decisionId - The decision identifier
 * @returns Deterministic order ID in format: {prefix}-{hash}
 */
function generateDeterministicOrderId(prefix: string, cycleId: string, decisionId: string): string {
  // Simple hash: combine cycleId and decisionId, then create a deterministic identifier
  const input = `${cycleId}:${decisionId}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string (8 chars)
  const hexHash = Math.abs(hash).toString(16).padStart(8, "0");
  return `${prefix}-${hexHash}`;
}

// Singleton broker client
let brokerClient: AlpacaClient | null = null;
let brokerClientEnvironment: string | null = null;

function getBrokerClient(ctx: ExecutionContext): AlpacaClient | null {
  // Re-create client if environment changed
  if (brokerClient && brokerClientEnvironment === ctx.environment) {
    return brokerClient;
  }

  // Check for required credentials
  const apiKey = process.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  brokerClient = createBrokerClient(ctx);
  brokerClientEnvironment = ctx.environment;
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
      log.info("Order execution skipped - plan not approved");
      return {
        ordersSubmitted: 0,
        ordersRejected: 0,
        orderIds: [],
        errors: ["Plan not approved"],
      };
    }

    const decisions = (adjustedPlan?.decisions ?? []) as unknown as Decision[];
    const tradableDecisions = decisions.filter((d) => d.action !== "HOLD");

    log.info(
      { totalDecisions: decisions.length, tradableDecisions: tradableDecisions.length },
      "Starting order execution"
    );

    // Create context at step boundary
    const ctx = createStepContext();

    // Extract cycleId for deterministic order ID generation
    const cycleId = adjustedPlan?.cycleId ?? "unknown-cycle";

    // In backtest mode, simulate order execution with deterministic order IDs
    if (isBacktest(ctx)) {
      const orderIds = tradableDecisions.map((decision: Decision, index: number) => {
        // Use decisionId if available, otherwise fall back to symbol/instrumentId or index
        const decisionIdentifier =
          decision.decisionId || decision.instrumentId || `decision-${index}`;
        return generateDeterministicOrderId("backtest", cycleId, decisionIdentifier);
      });

      log.debug(
        { cycleId, orderCount: orderIds.length },
        "Backtest mode - generated deterministic order IDs"
      );

      return {
        ordersSubmitted: orderIds.length,
        ordersRejected: 0,
        orderIds,
        errors: [],
      };
    }

    // In PAPER/LIVE mode, submit orders via broker client
    const client = getBrokerClient(ctx);
    if (!client) {
      // No broker credentials - return deterministic mock order IDs for dev/testing
      log.warn({ cycleId }, "Broker credentials not configured - using mock order IDs");
      const orderIds = tradableDecisions.map((decision: Decision, index: number) => {
        // Use decisionId if available, otherwise fall back to symbol/instrumentId or index
        const decisionIdentifier =
          decision.decisionId || decision.instrumentId || `decision-${index}`;
        return generateDeterministicOrderId("mock", cycleId, decisionIdentifier);
      });
      return {
        ordersSubmitted: orderIds.length,
        ordersRejected: 0,
        orderIds,
        errors: ["Broker credentials not configured - using mock orders"],
      };
    }

    // Submit orders in parallel
    log.info(
      { environment: ctx.environment, orderCount: tradableDecisions.length },
      "Submitting orders to broker"
    );

    const orderPromises = tradableDecisions.map(async (decision) => {
      const orderRequest = decisionToOrderRequest(decision);
      if (!orderRequest) {
        log.warn({ decisionId: decision.decisionId }, "Invalid decision - skipping order");
        return { success: false, error: `Invalid decision: ${decision.decisionId}` };
      }

      try {
        const order = await client.submitOrder(orderRequest);
        log.info(
          { orderId: order.id, symbol: decision.instrumentId, action: decision.action },
          "Order submitted successfully"
        );
        return { success: true, orderId: order.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ symbol: decision.instrumentId, error: message }, "Order submission failed");
        return { success: false, error: `${decision.instrumentId}: ${message}` };
      }
    });

    const results = await Promise.all(orderPromises);

    const submitted = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success);

    log.info(
      { submitted: submitted.length, rejected: rejected.length },
      "Order execution complete"
    );

    return {
      ordersSubmitted: submitted.length,
      ordersRejected: rejected.length,
      orderIds: submitted.map((r) => r.orderId).filter((id): id is string => id !== undefined),
      errors: rejected.map((r) => r.error).filter((e): e is string => e !== undefined),
    };
  },
});
