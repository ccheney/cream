import { describe, it, expect, beforeEach } from "bun:test";
import {
  // Broker
  MockBrokerAdapter,
  createMockBroker,
  // Market Data
  MockPolygonAdapter,
  MockDatabentoAdapter,
  createMockPolygon,
  createMockDatabento,
  // HelixDB
  MockHelixDB,
  createMockHelixDB,
  // Turso
  MockTursoClient,
  createMockTurso,
} from "./index";

// ============================================
// Mock Broker Tests
// ============================================

describe("MockBrokerAdapter", () => {
  let broker: MockBrokerAdapter;

  beforeEach(() => {
    broker = createMockBroker({
      acceptDelay: 5,
      fillDelay: 10,
      deterministic: true,
    });
  });

  describe("order lifecycle", () => {
    it("submits order in PENDING status", async () => {
      const order = await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        quantity: 100,
        limitPrice: 175,
        timeInForce: "DAY",
      });

      expect(order.status).toBe("PENDING");
      expect(order.symbol).toBe("AAPL");
      expect(order.quantity).toBe(100);
      expect(order.filledQuantity).toBe(0);
    });

    it("fills order after delays", async () => {
      const order = await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        quantity: 100,
        limitPrice: 175,
        timeInForce: "DAY",
      });

      await broker.waitForOrders();

      const filled = await broker.getOrder(order.orderId);
      expect(filled?.status).toBe("FILLED");
      expect(filled?.filledQuantity).toBe(100);
      expect(filled?.avgFillPrice).toBe(175);
    });

    it("cancels pending order", async () => {
      const order = await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "LIMIT",
        quantity: 100,
        limitPrice: 175,
        timeInForce: "DAY",
      });

      const cancelled = await broker.cancelOrder(order.orderId);
      expect(cancelled?.status).toBe("CANCELLED");
    });
  });

  describe("position tracking", () => {
    it("creates position after fill", async () => {
      broker.setMarketPrice("AAPL", 175);

      await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        timeInForce: "DAY",
      });

      await broker.waitForOrders();

      const position = await broker.getPosition("AAPL");
      expect(position).toBeDefined();
      expect(position?.quantity).toBe(100);
    });

    it("updates account after fill", async () => {
      const initialAccount = await broker.getAccount();
      const initialCash = initialAccount.cash;

      broker.setMarketPrice("AAPL", 100);

      await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        timeInForce: "DAY",
      });

      await broker.waitForOrders();

      const account = await broker.getAccount();
      expect(account.cash).toBeLessThan(initialCash);
    });
  });

  describe("failure simulation", () => {
    it("rejects order when failure simulated", async () => {
      const failingBroker = createMockBroker({
        simulateFailure: true,
        failureType: "REJECT",
        deterministic: true,
      });

      const order = await failingBroker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        timeInForce: "DAY",
      });

      expect(order.status).toBe("REJECTED");
    });
  });

  describe("reset", () => {
    it("clears all state", async () => {
      await broker.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        timeInForce: "DAY",
      });

      broker.reset();

      const orders = await broker.getOrders();
      const positions = await broker.getPositions();

      expect(orders).toHaveLength(0);
      expect(positions).toHaveLength(0);
    });
  });
});

// ============================================
// Mock Polygon Tests
// ============================================

describe("MockPolygonAdapter", () => {
  let polygon: MockPolygonAdapter;

  beforeEach(() => {
    polygon = createMockPolygon({
      responseDelay: 5,
      deterministic: true,
    });
  });

  describe("candles", () => {
    it("returns candles for symbol", async () => {
      const candles = await polygon.getCandles("AAPL", "1h", 10);

      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0].open).toBeDefined();
      expect(candles[0].close).toBeDefined();
      expect(candles[0].volume).toBeDefined();
    });

    it("uses pre-loaded fixture data", async () => {
      // Default fixtures include AAPL bull trend
      const snapshot = await polygon.getSnapshot("AAPL");

      expect(snapshot).toBeDefined();
      expect(snapshot?.symbol).toBe("AAPL");
    });
  });

  describe("quotes", () => {
    it("returns quote for symbol", async () => {
      const quote = await polygon.getQuote("AAPL");

      expect(quote.symbol).toBe("AAPL");
      expect(quote.bid).toBeDefined();
      expect(quote.ask).toBeDefined();
      expect(quote.bid).toBeLessThan(quote.ask);
    });

    it("returns quotes for multiple symbols", async () => {
      const quotes = await polygon.getQuotes(["AAPL", "SPY"]);

      expect(quotes.size).toBe(2);
      expect(quotes.get("AAPL")).toBeDefined();
      expect(quotes.get("SPY")).toBeDefined();
    });
  });

  describe("option chain", () => {
    it("returns option chain", async () => {
      const chain = await polygon.getOptionChain("AAPL");

      expect(chain.length).toBeGreaterThan(0);
      expect(chain[0].underlying).toBe("AAPL");
      expect(["CALL", "PUT"]).toContain(chain[0].optionType);
    });
  });

  describe("failure simulation", () => {
    it("throws on simulated failure", async () => {
      const failing = createMockPolygon({
        simulateFailure: true,
        failureType: "API_ERROR",
      });

      await expect(failing.getQuote("AAPL")).rejects.toThrow("MockPolygon");
    });
  });
});

// ============================================
// Mock Databento Tests
// ============================================

describe("MockDatabentoAdapter", () => {
  let databento: MockDatabentoAdapter;

  beforeEach(() => {
    databento = createMockDatabento({
      responseDelay: 5,
      deterministic: true,
    });
  });

  describe("trades", () => {
    it("returns recent trades", async () => {
      const trades = await databento.getTrades("AAPL", 10);

      expect(trades.length).toBe(10);
      expect(trades[0].symbol).toBe("AAPL");
      expect(trades[0].price).toBeDefined();
      expect(trades[0].size).toBeDefined();
    });
  });

  describe("quotes", () => {
    it("returns current quote", async () => {
      const quote = await databento.getQuote("AAPL");

      expect(quote.symbol).toBe("AAPL");
      expect(quote.bid).toBeDefined();
      expect(quote.ask).toBeDefined();
    });
  });
});

// ============================================
// Mock HelixDB Tests
// ============================================

describe("MockHelixDB", () => {
  let helix: MockHelixDB;

  beforeEach(() => {
    helix = createMockHelixDB({
      queryDelay: 5,
      deterministic: true,
    });
  });

  describe("nodes", () => {
    it("upserts and retrieves nodes", async () => {
      const node = await helix.upsertNode("test-1", "TestNode", {
        name: "Test",
        value: 42,
      });

      expect(node.id).toBe("test-1");
      expect(node.type).toBe("TestNode");
      expect(node.properties.name).toBe("Test");

      const retrieved = await helix.getNode("test-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.properties.value).toBe(42);
    });

    it("updates existing node", async () => {
      await helix.upsertNode("test-1", "TestNode", { value: 1 });
      await helix.upsertNode("test-1", "TestNode", { value: 2 });

      const node = await helix.getNode("test-1");
      expect(node?.properties.value).toBe(2);
    });

    it("gets nodes by type", async () => {
      await helix.upsertNode("a", "TypeA", {});
      await helix.upsertNode("b", "TypeA", {});
      await helix.upsertNode("c", "TypeB", {});

      const typeA = await helix.getNodesByType("TypeA");
      expect(typeA).toHaveLength(2);
    });

    it("deletes nodes", async () => {
      await helix.upsertNode("test-1", "TestNode", {});

      const deleted = await helix.deleteNode("test-1");
      expect(deleted).toBe(true);

      const node = await helix.getNode("test-1");
      expect(node).toBeUndefined();
    });
  });

  describe("edges", () => {
    it("creates and retrieves edges", async () => {
      await helix.upsertNode("a", "Node", {});
      await helix.upsertNode("b", "Node", {});

      const edge = await helix.createEdge("a", "b", "CONNECTS_TO", {
        weight: 1,
      });

      expect(edge.fromId).toBe("a");
      expect(edge.toId).toBe("b");
      expect(edge.type).toBe("CONNECTS_TO");

      const edgesFrom = await helix.getEdgesFrom("a");
      expect(edgesFrom).toHaveLength(1);
      expect(edgesFrom[0].toId).toBe("b");
    });
  });

  describe("trade memory", () => {
    it("retrieves default trade memories", async () => {
      const memories = await helix.retrieveTradeMemory({}, 5);

      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].item.caseId).toBeDefined();
      expect(memories[0].score).toBeDefined();
    });

    it("filters by symbol", async () => {
      const memories = await helix.retrieveTradeMemory({ symbol: "AAPL" }, 10);

      for (const result of memories) {
        expect(result.item.symbol).toBe("AAPL");
      }
    });

    it("stores and retrieves trade memory", async () => {
      await helix.storeTradeMemory({
        caseId: "custom-case",
        symbol: "TSLA",
        action: "BUY",
        entryPrice: 250,
        exitPrice: 275,
        pnlPercent: 10,
        regime: "BULL_TREND",
        rationale: "Test case",
        timestamp: new Date().toISOString(),
      });

      const memories = await helix.retrieveTradeMemory({ symbol: "TSLA" }, 10);
      const found = memories.find((m) => m.item.caseId === "custom-case");

      expect(found).toBeDefined();
      expect(found?.item.symbol).toBe("TSLA");
    });
  });

  describe("reset", () => {
    it("clears custom data but keeps defaults", async () => {
      await helix.upsertNode("custom", "Node", {});

      helix.reset();

      const custom = await helix.getNode("custom");
      expect(custom).toBeUndefined();

      // Default memories should still exist
      const memories = await helix.retrieveTradeMemory({}, 5);
      expect(memories.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// Mock Turso Tests
// ============================================

describe("MockTursoClient", () => {
  let turso: MockTursoClient;

  beforeEach(() => {
    turso = createMockTurso({
      queryDelay: 5,
      deterministic: true,
    });
  });

  describe("table operations", () => {
    it("creates table", async () => {
      await turso.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"
      );

      const tables = turso.getTableNames();
      expect(tables).toContain("users");
    });

    it("inserts rows", async () => {
      await turso.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
      );

      const result = await turso.execute(
        "INSERT INTO users (id, name) VALUES (?, ?)",
        [1, "Alice"]
      );

      expect(result.rowsAffected).toBe(1);
      expect(result.lastInsertRowid).toBe(1n);
    });

    it("selects rows", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [2, "Bob"]);

      const result = await turso.execute("SELECT id, name FROM users");

      expect(result.rows).toHaveLength(2);
      expect(result.columns).toEqual(["id", "name"]);
    });

    it("selects with WHERE", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [2, "Bob"]);

      const result = await turso.execute(
        "SELECT id, name FROM users WHERE id = ?",
        [1]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][1]).toBe("Alice");
    });

    it("updates rows", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);

      const result = await turso.execute(
        "UPDATE users SET name = ? WHERE id = ?",
        ["Alicia", 1]
      );

      expect(result.rowsAffected).toBe(1);

      const select = await turso.execute("SELECT name FROM users WHERE id = ?", [1]);
      expect(select.rows[0][0]).toBe("Alicia");
    });

    it("deletes rows", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [2, "Bob"]);

      const result = await turso.execute("DELETE FROM users WHERE id = ?", [1]);

      expect(result.rowsAffected).toBe(1);

      const remaining = await turso.execute("SELECT * FROM users");
      expect(remaining.rows).toHaveLength(1);
    });

    it("drops table", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      await turso.execute("DROP TABLE users");

      const tables = turso.getTableNames();
      expect(tables).not.toContain("users");
    });
  });

  describe("batch operations", () => {
    it("executes batch of statements", async () => {
      const results = await turso.batch([
        { sql: "CREATE TABLE users (id INTEGER, name TEXT)" },
        { sql: "INSERT INTO users (id, name) VALUES (?, ?)", args: [1, "Alice"] },
        { sql: "INSERT INTO users (id, name) VALUES (?, ?)", args: [2, "Bob"] },
        { sql: "SELECT * FROM users" },
      ]);

      expect(results).toHaveLength(4);
      expect(results[3].rows).toHaveLength(2);
    });
  });

  describe("transactions", () => {
    it("commits transaction", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER, name TEXT)");

      const tx = await turso.transaction();
      await tx.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);
      await tx.commit();

      const result = await turso.execute("SELECT * FROM users");
      expect(result.rows).toHaveLength(1);
    });

    it("rolls back transaction", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);

      const tx = await turso.transaction();
      await tx.execute("INSERT INTO users (id, name) VALUES (?, ?)", [2, "Bob"]);
      await tx.rollback();

      const result = await turso.execute("SELECT * FROM users");
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("reset", () => {
    it("clears all tables", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER)");
      await turso.execute("INSERT INTO users (id) VALUES (?)", [1]);

      turso.reset();

      const tables = turso.getTableNames();
      expect(tables).toHaveLength(0);
    });
  });

  describe("failure simulation", () => {
    it("throws on simulated failure", async () => {
      const failing = createMockTurso({
        simulateFailure: true,
        failureType: "QUERY",
      });

      await expect(failing.execute("SELECT 1")).rejects.toThrow("MockTurso");
    });
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("Factory functions", () => {
  it("createMockBroker returns MockBrokerAdapter", () => {
    const broker = createMockBroker();
    expect(broker).toBeInstanceOf(MockBrokerAdapter);
  });

  it("createMockPolygon returns MockPolygonAdapter", () => {
    const polygon = createMockPolygon();
    expect(polygon).toBeInstanceOf(MockPolygonAdapter);
  });

  it("createMockDatabento returns MockDatabentoAdapter", () => {
    const databento = createMockDatabento();
    expect(databento).toBeInstanceOf(MockDatabentoAdapter);
  });

  it("createMockHelixDB returns MockHelixDB", () => {
    const helix = createMockHelixDB();
    expect(helix).toBeInstanceOf(MockHelixDB);
  });

  it("createMockTurso returns MockTursoClient", () => {
    const turso = createMockTurso();
    expect(turso).toBeInstanceOf(MockTursoClient);
  });
});
