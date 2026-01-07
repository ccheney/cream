/**
 * Execute Orders Step
 *
 * Step 10: Send approved orders to execution engine via gRPC.
 */

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

    // In backtest mode, simulate order execution
    if (isBacktest()) {
      const decisions = adjustedPlan?.decisions ?? [];
      const orderIds = decisions
        .filter((d: { action: string }) => d.action !== "HOLD")
        .map((_: unknown, i: number) => `backtest-order-${Date.now()}-${i}`);

      return {
        ordersSubmitted: orderIds.length,
        ordersRejected: 0,
        orderIds,
        errors: [],
      };
    }

    // In PAPER/LIVE mode, submit orders to execution engine
    // TODO: Wire up gRPC execution client when Rust backend is running
    // For now, generate mock order IDs
    const decisions = adjustedPlan?.decisions ?? [];
    const orderIds = decisions
      .filter((d: { action: string }) => d.action !== "HOLD")
      .map((_: unknown, i: number) => `order-${Date.now()}-${i}`);

    return {
      ordersSubmitted: orderIds.length,
      ordersRejected: 0,
      orderIds,
      errors: [],
    };
  },
});
