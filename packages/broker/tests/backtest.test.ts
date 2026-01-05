/**
 * Backtest Adapter Tests
 */

import { describe, test, expect, beforeEach } from "bun:test";
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
      const order = await adapter.submitOrder({
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
      expect(closedOrders[0].status).toBe("filled");
    });
  });

  describe("Position operations", () => {
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
});

describe("createBrokerClient factory", () => {
  test("creates backtest adapter for BACKTEST environment", () => {
    const client = createBrokerClient({ environment: "BACKTEST" });
    expect(client.getEnvironment()).toBe("BACKTEST");
  });

  test("creates backtest adapter with configuration", async () => {
    const client = createBrokerClient({
      environment: "BACKTEST",
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
      expect(() =>
        createBrokerClient({
          environment: "PAPER",
        })
      ).toThrow("ALPACA_KEY and ALPACA_SECRET are required");
    } finally {
      // Restore env vars
      if (savedKey) process.env.ALPACA_KEY = savedKey;
      if (savedSecret) process.env.ALPACA_SECRET = savedSecret;
    }
  });

  test("throws error for unknown environment", () => {
    expect(() =>
      createBrokerClient({
        environment: "UNKNOWN" as any,
      })
    ).toThrow("Unknown environment");
  });
});
