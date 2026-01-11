/**
 * Backtest Adapter Position Operations Tests
 */

import { describe, expect, test } from "bun:test";
import { createBacktestAdapter } from "../src/adapters/backtest.js";
import {
  createBuyOrderRequest,
  createFixedPriceProvider,
  createSellOrderRequest,
  createSymbolPriceProvider,
} from "./fixtures.js";

describe("BacktestAdapter Position operations", () => {
  describe("Position errors", () => {
    test("throws when closing non-existent position", async () => {
      const adapter = createBacktestAdapter({ initialCash: 100000 });
      await expect(adapter.closePosition("NONEXISTENT")).rejects.toThrow("Position not found");
    });

    test("throws when closing more than held", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createFixedPriceProvider(100),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

      await expect(adapter.closePosition("AAPL", 20)).rejects.toThrow(
        "Cannot close more than held"
      );
    });

    test("rejects sell order with insufficient shares", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createFixedPriceProvider(100),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 5));

      const order = await adapter.submitOrder(createSellOrderRequest(adapter, "AAPL", 10));
      expect(order.status).toBe("rejected");
    });
  });

  describe("Position listing", () => {
    test("lists all positions", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createSymbolPriceProvider({ AAPL: 150, MSFT: 400 }),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
      await adapter.submitOrder(createBuyOrderRequest(adapter, "MSFT", 5));

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(2);
    });
  });

  describe("Position closing", () => {
    test("closes specific position", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createFixedPriceProvider(150),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
      await adapter.closePosition("AAPL");

      const position = await adapter.getPosition("AAPL");
      expect(position).toBeNull();
    });

    test("closes partial position", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createFixedPriceProvider(150),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
      await adapter.closePosition("AAPL", 5);

      const position = await adapter.getPosition("AAPL");
      expect(position?.qty).toBe(5);
    });

    test("closes all positions", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: createSymbolPriceProvider({ AAPL: 150, MSFT: 400 }),
      });

      await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
      await adapter.submitOrder(createBuyOrderRequest(adapter, "MSFT", 5));

      await adapter.closeAllPositions();

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(0);
    });
  });
});
