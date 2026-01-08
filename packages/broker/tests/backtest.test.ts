/**
 * Backtest Adapter Tests
 */

import { createTestContext } from "@cream/domain";
import { beforeEach, describe, expect, test } from "bun:test";
import { createBacktestAdapter, createBacktestAdapterWithUtils } from "../src/adapters/backtest.js";
import { createBrokerClient } from "../src/factory.js";

describe("BacktestAdapter", () => {
  describe("createBacktestAdapter", () => {
    test("creates adapter with default configuration", () => {
      const adapter = createBacktestAdapter();
      expect(adapter).toBeDefined();
      expect(adapter.getEnvironment()).toBe("BACKTEST");
    });

    test("creates adapter with custom initial cash", async () => {
      const adapter = createBacktestAdapter({ initialCash: 50000 });
      const account = await adapter.getAccount();
      expect(account.cash).toBe(50000);
    });

    test("generates unique order IDs with prefix", () => {
      const adapter = createBacktestAdapter({ orderIdPrefix: "test" });
      const id1 = adapter.generateOrderId();
      const id2 = adapter.generateOrderId();

      expect(id1).toContain("test");
      expect(id2).toContain("test");
      expect(id1).not.toBe(id2);
    });
  });

  describe("Account operations", () => {
    test("returns account information", async () => {
      const adapter = createBacktestAdapter({ initialCash: 100000 });
      const account = await adapter.getAccount();

      expect(account.id).toBe("backtest-account");
      expect(account.status).toBe("ACTIVE");
      expect(account.currency).toBe("USD");
      expect(account.cash).toBe(100000);
      expect(account.portfolioValue).toBe(100000);
      expect(account.buyingPower).toBe(400000);
      expect(account.shortingEnabled).toBe(true);
    });

    test("market is always open in backtest", async () => {
      const adapter = createBacktestAdapter();
      expect(await adapter.isMarketOpen()).toBe(true);
    });
  });

  describe("Order operations", () => {
    let adapter: ReturnType<typeof createBacktestAdapter>;

    beforeEach(() => {
      adapter = createBacktestAdapter({
        initialCash: 100000,
        fillMode: "immediate",
        priceProvider: (symbol) => {
          const prices: Record<string, number> = {
            AAPL: 150,
            MSFT: 400,
            GOOGL: 140,
          };
          return prices[symbol];
        },
      });
    });

    test("submits and fills market buy order immediately", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      expect(order.status).toBe("filled");
      expect(order.filledQty).toBe(10);
      expect(order.filledAvgPrice).toBe(150);
    });

    test("submits and fills limit buy order immediately", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 5,
        side: "buy",
        type: "limit",
        timeInForce: "day",
        limitPrice: 155,
      });

      expect(order.status).toBe("filled");
      expect(order.filledQty).toBe(5);
    });

    test("creates position after buy order", async () => {
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const position = await adapter.getPosition("AAPL");
      expect(position).not.toBeNull();
      expect(position?.qty).toBe(10);
      expect(position?.side).toBe("long");
      expect(position?.avgEntryPrice).toBe(150);
    });

    test("updates position on additional buy", async () => {
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const position = await adapter.getPosition("AAPL");
      expect(position?.qty).toBe(20);
    });

    test("closes position on sell order", async () => {
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "sell",
        type: "market",
        timeInForce: "day",
      });

      const position = await adapter.getPosition("AAPL");
      expect(position).toBeNull();
    });

    test("rejects sell order without position", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "sell",
        type: "market",
        timeInForce: "day",
      });

      expect(order.status).toBe("rejected");
    });

    test("rejects buy order with insufficient funds", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100,
        priceProvider: () => 150,
      });

      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      expect(order.status).toBe("rejected");
    });

    test("cancels pending order", async () => {
      const adapter = createBacktestAdapter({ fillMode: "delayed" });

      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      expect(order.status).toBe("accepted");

      await adapter.cancelOrder(order.id);
      const canceledOrder = await adapter.getOrder(order.id);

      expect(canceledOrder?.status).toBe("canceled");
    });

    test("gets order by ID", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const fetched = await adapter.getOrder(order.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(order.id);
    });

    test("gets order by client order ID", async () => {
      const clientOrderId = adapter.generateOrderId();
      const _order = await adapter.submitOrder({
        clientOrderId,
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const fetched = await adapter.getOrder(clientOrderId);
      expect(fetched).not.toBeNull();
      expect(fetched?.clientOrderId).toBe(clientOrderId);
    });

    test("returns null for non-existent order", async () => {
      const order = await adapter.getOrder("non-existent");
      expect(order).toBeNull();
    });

    test("cancels order by client order ID", async () => {
      const adapter = createBacktestAdapter({ fillMode: "delayed" });
      const clientOrderId = adapter.generateOrderId();

      await adapter.submitOrder({
        clientOrderId,
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Cancel using clientOrderId
      await adapter.cancelOrder(clientOrderId);
      const order = await adapter.getOrder(clientOrderId);
      expect(order?.status).toBe("canceled");
    });

    test("throws when canceling non-existent order", async () => {
      const adapter = createBacktestAdapter();
      await expect(adapter.cancelOrder("non-existent-order")).rejects.toThrow("Order not found");
    });

    test("throws when canceling already filled order", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Order is filled in immediate mode
      expect(order.status).toBe("filled");

      await expect(adapter.cancelOrder(order.id)).rejects.toThrow("Cannot cancel completed order");
    });

    test("stop orders are accepted but not filled in immediate mode", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "stop",
        timeInForce: "day",
        stopPrice: 145,
      });

      expect(order.status).toBe("accepted");
      expect(order.filledQty).toBe(0);
    });

    test("stop_limit orders are accepted but not filled in immediate mode", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "stop_limit",
        timeInForce: "day",
        stopPrice: 145,
        limitPrice: 146,
      });

      expect(order.status).toBe("accepted");
      expect(order.filledQty).toBe(0);
    });

    test("handles multi-leg orders using legs array", async () => {
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        legs: [{ symbol: "AAPL", ratio: 1 }],
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      expect(order.symbol).toBe("AAPL");
    });

    test("uses default price when priceProvider returns undefined", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: () => undefined,
      });

      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "UNKNOWN",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Default price is 100
      expect(order.filledAvgPrice).toBe(100);
    });

    test("lists open orders", async () => {
      const adapter = createBacktestAdapter({ fillMode: "delayed" });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const openOrders = await adapter.getOrders("open");
      expect(openOrders.length).toBe(1);
    });

    test("lists closed orders", async () => {
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const closedOrders = await adapter.getOrders("closed");
      expect(closedOrders.length).toBe(1);
      expect(closedOrders[0]?.status).toBe("filled");
    });

    test("lists all orders", async () => {
      // Create a filled order
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Create an open order (stop order stays accepted)
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "GOOGL",
        qty: 5,
        side: "buy",
        type: "stop",
        timeInForce: "day",
        stopPrice: 130,
      });

      const allOrders = await adapter.getOrders("all");
      expect(allOrders.length).toBe(2);
    });

    test("getOrder finds by clientOrderId when not found by ID", async () => {
      const clientOrderId = adapter.generateOrderId();
      await adapter.submitOrder({
        clientOrderId,
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Use clientOrderId to find order (not the system-generated id)
      const order = await adapter.getOrder(clientOrderId);
      expect(order).not.toBeNull();
      expect(order?.clientOrderId).toBe(clientOrderId);
    });
  });

  describe("Position operations", () => {
    test("throws when closing non-existent position", async () => {
      const adapter = createBacktestAdapter({ initialCash: 100000 });
      await expect(adapter.closePosition("NONEXISTENT")).rejects.toThrow("Position not found");
    });

    test("throws when closing more than held", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: () => 100,
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await expect(adapter.closePosition("AAPL", 20)).rejects.toThrow(
        "Cannot close more than held"
      );
    });

    test("rejects sell order with insufficient shares", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: () => 100,
      });

      // Buy 5 shares
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 5,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Try to sell 10
      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "sell",
        type: "market",
        timeInForce: "day",
      });

      expect(order.status).toBe("rejected");
    });

    test("lists all positions", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: (symbol) => (symbol === "AAPL" ? 150 : 400),
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "MSFT",
        qty: 5,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(2);
    });

    test("closes specific position", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: () => 150,
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.closePosition("AAPL");

      const position = await adapter.getPosition("AAPL");
      expect(position).toBeNull();
    });

    test("closes partial position", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: () => 150,
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.closePosition("AAPL", 5);

      const position = await adapter.getPosition("AAPL");
      expect(position?.qty).toBe(5);
    });

    test("closes all positions", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        priceProvider: (symbol) => (symbol === "AAPL" ? 150 : 400),
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "AAPL",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "MSFT",
        qty: 5,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      await adapter.closeAllPositions();

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(0);
    });
  });

  describe("Slippage and commission", () => {
    test("applies slippage to buy orders", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        slippageBps: 10, // 0.1%
        priceProvider: () => 100,
      });

      const order = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "TEST",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Price should be 100 * 1.001 = 100.1
      expect(order.filledAvgPrice).toBeCloseTo(100.1, 2);
    });

    test("applies slippage to sell orders", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 100000,
        slippageBps: 10, // 0.1%
        priceProvider: () => 100,
      });

      // First buy
      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "TEST",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      // Then sell
      const sellOrder = await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "TEST",
        qty: 10,
        side: "sell",
        type: "market",
        timeInForce: "day",
      });

      // Price should be 100 * 0.999 = 99.9
      expect(sellOrder.filledAvgPrice).toBeCloseTo(99.9, 2);
    });

    test("deducts commission from cash", async () => {
      const adapter = createBacktestAdapter({
        initialCash: 10000,
        commission: 5,
        priceProvider: () => 100,
      });

      await adapter.submitOrder({
        clientOrderId: adapter.generateOrderId(),
        symbol: "TEST",
        qty: 10,
        side: "buy",
        type: "market",
        timeInForce: "day",
      });

      const account = await adapter.getAccount();
      // Initial 10000 - (100 * 10) - 5 commission = 8995
      expect(account.cash).toBe(8995);
    });
  });
});

describe("createBacktestAdapterWithUtils", () => {
  test("provides utility methods", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });

    expect(typeof adapter.setCash).toBe("function");
    expect(typeof adapter.triggerFills).toBe("function");
    expect(typeof adapter.updatePrices).toBe("function");
    expect(typeof adapter.reset).toBe("function");
    expect(typeof adapter.getCash).toBe("function");
  });

  test("setCash updates the cash value", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    adapter.setCash(50000);
    expect(adapter.getCash()).toBe(50000);
  });

  test("reset restores initial state", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    adapter.setCash(25000);
    adapter.updatePrices({ AAPL: 200 });
    adapter.reset();
    expect(adapter.getCash()).toBe(100000);
  });

  test("updatePrices stores price overrides", () => {
    const adapter = createBacktestAdapterWithUtils({
      initialCash: 100000,
      priceProvider: () => 100,
    });
    adapter.updatePrices({ AAPL: 200 });
    // The adapter uses its internal price provider which checks overrides
    expect(adapter.getCash()).toBe(100000);
  });

  test("triggerFills can be called", () => {
    const adapter = createBacktestAdapterWithUtils({ initialCash: 100000 });
    // Just verify it doesn't throw
    adapter.triggerFills();
  });
});

describe("createBrokerClient factory", () => {
  test("creates backtest adapter for BACKTEST environment", () => {
    const ctx = createTestContext("BACKTEST");
    const client = createBrokerClient(ctx);
    expect(client.getEnvironment()).toBe("BACKTEST");
  });

  test("creates backtest adapter with configuration", async () => {
    const ctx = createTestContext("BACKTEST");
    const client = createBrokerClient(ctx, {
      backtest: {
        initialCash: 50000,
      },
    });

    const account = await client.getAccount();
    expect(account.cash).toBe(50000);
  });

  test("throws error for PAPER/LIVE without credentials", () => {
    // Save and clear env vars for this test
    const savedKey = process.env.ALPACA_KEY;
    const savedSecret = process.env.ALPACA_SECRET;
    delete process.env.ALPACA_KEY;
    delete process.env.ALPACA_SECRET;

    try {
      const ctx = createTestContext("PAPER");
      expect(() => createBrokerClient(ctx)).toThrow(
        "ALPACA_KEY and ALPACA_SECRET are required"
      );
    } finally {
      // Restore env vars
      if (savedKey) {
        process.env.ALPACA_KEY = savedKey;
      }
      if (savedSecret) {
        process.env.ALPACA_SECRET = savedSecret;
      }
    }
  });

  test("throws error for unknown environment", () => {
    const ctx = createTestContext("UNKNOWN" as any);
    expect(() => createBrokerClient(ctx)).toThrow("Unknown environment");
  });

  test("creates Alpaca client for LIVE with valid credentials", () => {
    const ctx = createTestContext("LIVE");
    const client = createBrokerClient(ctx, {
      apiKey: "test-key",
      apiSecret: "test-secret",
    });
    expect(client.getEnvironment()).toBe("LIVE");
  });

  test("creates Alpaca client for PAPER with valid credentials", () => {
    const ctx = createTestContext("PAPER");
    const client = createBrokerClient(ctx, {
      apiKey: "test-key",
      apiSecret: "test-secret",
    });
    expect(client.getEnvironment()).toBe("PAPER");
  });
});
