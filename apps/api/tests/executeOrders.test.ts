/**
 * Execute Orders Step Tests
 *
 * Tests deterministic mock order ID generation and step execution.
 */

import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ExecutionResultSchema,
  executeOrdersStep,
  ValidationResultSchema,
} from "../src/steps/executeOrders";

// Store original env
const originalEnv = process.env.CREAM_ENV;

beforeEach(() => {
  // Ensure BACKTEST mode for tests
  process.env.CREAM_ENV = "BACKTEST";
});

describe("Execute Orders Step", () => {
  describe("Schema Validation", () => {
    it("should validate input with approved plan", () => {
      const validInput = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-001",
              symbol: "AAPL",
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
            },
          ],
        },
      };

      expect(() => ValidationResultSchema.parse(validInput)).not.toThrow();
    });

    it("should validate input with rejected plan", () => {
      const rejectedInput = {
        approved: false,
        violations: ["Position size exceeds limit"],
      };

      expect(() => ValidationResultSchema.parse(rejectedInput)).not.toThrow();
    });

    it("should validate output schema", () => {
      const validOutput = {
        ordersSubmitted: 2,
        ordersRejected: 0,
        orderIds: ["backtest-abc123", "backtest-def456"],
        errors: [],
      };

      expect(() => ExecutionResultSchema.parse(validOutput)).not.toThrow();
    });

    it("should validate output with errors", () => {
      const outputWithErrors = {
        ordersSubmitted: 1,
        ordersRejected: 1,
        orderIds: ["backtest-abc123"],
        errors: ["TSLA: Insufficient buying power"],
      };

      expect(() => ExecutionResultSchema.parse(outputWithErrors)).not.toThrow();
    });
  });

  describe("Deterministic Order ID Generation", () => {
    it("should generate deterministic order IDs in backtest mode", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-aapl-001",
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result1 = await executeOrdersStep.execute({ inputData: input });
      // @ts-expect-error - accessing internal execute function
      const result2 = await executeOrdersStep.execute({ inputData: input });

      // Order IDs should be identical for the same input
      expect(result1.orderIds).toEqual(result2.orderIds);
      expect(result1.orderIds[0]).toMatch(/^backtest-[0-9a-f]+$/);
    });

    it("should generate different order IDs for different cycle IDs", async () => {
      const input1 = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-001",
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      const input2 = {
        ...input1,
        adjustedPlan: {
          ...input1.adjustedPlan,
          cycleId: "cycle-002", // Different cycle ID
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result1 = await executeOrdersStep.execute({ inputData: input1 });
      // @ts-expect-error - accessing internal execute function
      const result2 = await executeOrdersStep.execute({ inputData: input2 });

      // Order IDs should differ when cycle ID is different
      expect(result1.orderIds[0]).not.toEqual(result2.orderIds[0]);
    });

    it("should generate different order IDs for different decision IDs", async () => {
      const baseInput = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-001",
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      const input1 = baseInput;
      const input2 = {
        ...baseInput,
        adjustedPlan: {
          ...baseInput.adjustedPlan,
          decisions: [
            {
              ...baseInput.adjustedPlan.decisions[0],
              decisionId: "dec-002", // Different decision ID
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result1 = await executeOrdersStep.execute({ inputData: input1 });
      // @ts-expect-error - accessing internal execute function
      const result2 = await executeOrdersStep.execute({ inputData: input2 });

      // Order IDs should differ when decision ID is different
      expect(result1.orderIds[0]).not.toEqual(result2.orderIds[0]);
    });

    it("should use instrumentId as fallback when decisionId is missing", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              // No decisionId
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result1 = await executeOrdersStep.execute({ inputData: input });
      // @ts-expect-error - accessing internal execute function
      const result2 = await executeOrdersStep.execute({ inputData: input });

      // Should still be deterministic using instrumentId
      expect(result1.orderIds).toEqual(result2.orderIds);
      expect(result1.orderIds[0]).toMatch(/^backtest-[0-9a-f]+$/);
    });

    it("should use index-based fallback when both decisionId and instrumentId are missing", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              // No decisionId, no instrumentId
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result1 = await executeOrdersStep.execute({ inputData: input });
      // @ts-expect-error - accessing internal execute function
      const result2 = await executeOrdersStep.execute({ inputData: input });

      // Should still be deterministic using index
      expect(result1.orderIds).toEqual(result2.orderIds);
      expect(result1.orderIds[0]).toMatch(/^backtest-[0-9a-f]+$/);
    });
  });

  describe("Step Execution", () => {
    it("should have correct step id", () => {
      expect(executeOrdersStep.id).toBe("execute-orders");
    });

    it("should have correct description", () => {
      expect(executeOrdersStep.description).toBe("Send approved orders to execution engine");
    });

    it("should return empty result when not approved", async () => {
      const input = {
        approved: false,
        violations: ["Risk limit exceeded"],
      };

      // @ts-expect-error - accessing internal execute function
      const result = await executeOrdersStep.execute({ inputData: input });

      expect(result.ordersSubmitted).toBe(0);
      expect(result.ordersRejected).toBe(0);
      expect(result.orderIds).toEqual([]);
      expect(result.errors).toContain("Plan not approved");
    });

    it("should skip HOLD decisions", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-001",
              instrumentId: "AAPL",
              action: "HOLD", // Should be skipped
              direction: "FLAT",
              size: { value: 0, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
            {
              decisionId: "dec-002",
              instrumentId: "MSFT",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result = await executeOrdersStep.execute({ inputData: input });

      // Only MSFT should be included (AAPL HOLD is skipped)
      expect(result.ordersSubmitted).toBe(1);
      expect(result.orderIds).toHaveLength(1);
    });

    it("should handle multiple tradable decisions", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [
            {
              decisionId: "dec-001",
              instrumentId: "AAPL",
              action: "BUY",
              direction: "LONG",
              size: { value: 100, unit: "SHARES" },
              strategyFamily: "MOMENTUM",
              timeHorizon: "SWING",
            },
            {
              decisionId: "dec-002",
              instrumentId: "MSFT",
              action: "SELL",
              direction: "FLAT",
              size: { value: 50, unit: "SHARES" },
              strategyFamily: "MEAN_REVERSION",
              timeHorizon: "INTRADAY",
            },
          ],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result = await executeOrdersStep.execute({ inputData: input });

      expect(result.ordersSubmitted).toBe(2);
      expect(result.orderIds).toHaveLength(2);
      expect(result.errors).toEqual([]);

      // Each order ID should be unique
      expect(result.orderIds[0]).not.toEqual(result.orderIds[1]);
    });

    it("should handle empty decisions array", async () => {
      const input = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "cycle-001",
          timestamp: new Date().toISOString(),
          decisions: [],
        },
      };

      // @ts-expect-error - accessing internal execute function
      const result = await executeOrdersStep.execute({ inputData: input });

      expect(result.ordersSubmitted).toBe(0);
      expect(result.orderIds).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should handle missing adjustedPlan", async () => {
      const input = {
        approved: true,
        violations: [],
        // No adjustedPlan
      };

      // @ts-expect-error - accessing internal execute function
      const result = await executeOrdersStep.execute({ inputData: input });

      expect(result.ordersSubmitted).toBe(0);
      expect(result.orderIds).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });
});

// Restore original env
afterAll(() => {
  if (originalEnv !== undefined) {
    process.env.CREAM_ENV = originalEnv;
  }
});
