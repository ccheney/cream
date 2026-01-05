/**
 * Trading Cycle Workflow Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";

import {
  loadStateStep,
  LoadStateOutputSchema,
  PositionSchema,
  OrderSchema,
  ThesisStateSchema,
} from "../src/steps/loadState";

describe("Trading Cycle Workflow", () => {
  describe("Schema Validation", () => {
    it("should validate Position schema", () => {
      const validPosition = {
        symbol: "AAPL",
        quantity: 100,
        avgCost: 150.5,
        currentPrice: 155.0,
        unrealizedPnl: 450.0,
      };

      expect(() => PositionSchema.parse(validPosition)).not.toThrow();
    });

    it("should validate Position schema with optional fields", () => {
      const minimalPosition = {
        symbol: "AAPL",
        quantity: 100,
        avgCost: 150.5,
      };

      expect(() => PositionSchema.parse(minimalPosition)).not.toThrow();
    });

    it("should reject invalid Position schema", () => {
      const invalidPosition = {
        symbol: "AAPL",
        quantity: "100", // should be number
        avgCost: 150.5,
      };

      expect(() => PositionSchema.parse(invalidPosition)).toThrow();
    });

    it("should validate Order schema", () => {
      const validOrder = {
        orderId: "order-123",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        orderType: "LIMIT",
        status: "PENDING",
        filledQty: 0,
      };

      expect(() => OrderSchema.parse(validOrder)).not.toThrow();
    });

    it("should validate Order schema with SELL side", () => {
      const sellOrder = {
        orderId: "order-456",
        symbol: "TSLA",
        side: "SELL",
        quantity: 50,
        orderType: "MARKET",
        status: "FILLED",
      };

      expect(() => OrderSchema.parse(sellOrder)).not.toThrow();
    });

    it("should reject invalid Order side", () => {
      const invalidOrder = {
        orderId: "order-789",
        symbol: "NVDA",
        side: "INVALID", // should be BUY or SELL
        quantity: 25,
        orderType: "LIMIT",
        status: "PENDING",
      };

      expect(() => OrderSchema.parse(invalidOrder)).toThrow();
    });

    it("should validate ThesisState schema", () => {
      const validThesis = {
        thesisId: "thesis-001",
        symbol: "MSFT",
        direction: "LONG",
        entryPrice: 400.0,
        stopLoss: 380.0,
        takeProfit: 450.0,
        status: "ACTIVE",
      };

      expect(() => ThesisStateSchema.parse(validThesis)).not.toThrow();
    });

    it("should validate ThesisState with SHORT direction", () => {
      const shortThesis = {
        thesisId: "thesis-002",
        symbol: "COIN",
        direction: "SHORT",
        entryPrice: 250.0,
        stopLoss: 275.0,
        takeProfit: 200.0,
        status: "ACTIVE",
      };

      expect(() => ThesisStateSchema.parse(shortThesis)).not.toThrow();
    });

    it("should validate ThesisState with FLAT direction", () => {
      const flatThesis = {
        thesisId: "thesis-003",
        symbol: "AMD",
        direction: "FLAT",
        status: "CLOSED",
      };

      expect(() => ThesisStateSchema.parse(flatThesis)).not.toThrow();
    });

    it("should validate LoadStateOutput schema", () => {
      const validOutput = {
        positions: [
          { symbol: "AAPL", quantity: 100, avgCost: 150.5 },
          { symbol: "MSFT", quantity: 50, avgCost: 400.0 },
        ],
        openOrders: [
          {
            orderId: "order-123",
            symbol: "NVDA",
            side: "BUY",
            quantity: 25,
            orderType: "LIMIT",
            status: "PENDING",
          },
        ],
        thesisStates: [
          {
            thesisId: "thesis-001",
            symbol: "AAPL",
            direction: "LONG",
            status: "ACTIVE",
          },
        ],
        accountBalance: 100000,
        buyingPower: 50000,
        timestamp: new Date().toISOString(),
      };

      expect(() => LoadStateOutputSchema.parse(validOutput)).not.toThrow();
    });

    it("should validate empty LoadStateOutput", () => {
      const emptyOutput = {
        positions: [],
        openOrders: [],
        thesisStates: [],
        accountBalance: 100000,
        buyingPower: 100000,
        timestamp: new Date().toISOString(),
      };

      expect(() => LoadStateOutputSchema.parse(emptyOutput)).not.toThrow();
    });
  });

  describe("loadStateStep", () => {
    it("should have correct step id", () => {
      expect(loadStateStep.id).toBe("load-state");
    });

    it("should have correct description", () => {
      expect(loadStateStep.description).toBe(
        "Load portfolio positions, open orders, and thesis states"
      );
    });

    it("should have retry configuration", () => {
      expect(loadStateStep.retries).toBe(3);
    });

    it("should execute and return mock data", async () => {
      const input = {
        cycleId: "cycle-001",
        environment: "BACKTEST" as const,
      };

      // @ts-expect-error - accessing internal execute function
      const result = await loadStateStep.execute({ inputData: input });

      expect(result).toBeDefined();
      expect(result.positions).toEqual([]);
      expect(result.openOrders).toEqual([]);
      expect(result.thesisStates).toEqual([]);
      expect(result.accountBalance).toBe(100000);
      expect(result.buyingPower).toBe(100000);
      expect(result.timestamp).toBeDefined();
    });

    it("should return ISO-8601 timestamp", async () => {
      const input = {
        cycleId: "cycle-002",
        environment: "PAPER" as const,
      };

      // @ts-expect-error - accessing internal execute function
      const result = await loadStateStep.execute({ inputData: input });

      // Verify timestamp is valid ISO-8601
      const parsed = new Date(result.timestamp);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });
  });

  describe("Input Schema Validation", () => {
    const inputSchema = loadStateStep.inputSchema;

    it("should accept BACKTEST environment", () => {
      const input = { cycleId: "test-001", environment: "BACKTEST" };
      expect(() => inputSchema.parse(input)).not.toThrow();
    });

    it("should accept PAPER environment", () => {
      const input = { cycleId: "test-002", environment: "PAPER" };
      expect(() => inputSchema.parse(input)).not.toThrow();
    });

    it("should accept LIVE environment", () => {
      const input = { cycleId: "test-003", environment: "LIVE" };
      expect(() => inputSchema.parse(input)).not.toThrow();
    });

    it("should reject invalid environment", () => {
      const input = { cycleId: "test-004", environment: "INVALID" };
      expect(() => inputSchema.parse(input)).toThrow();
    });

    it("should reject missing cycleId", () => {
      const input = { environment: "BACKTEST" };
      expect(() => inputSchema.parse(input)).toThrow();
    });

    it("should reject missing environment", () => {
      const input = { cycleId: "test-005" };
      expect(() => inputSchema.parse(input)).toThrow();
    });
  });
});
