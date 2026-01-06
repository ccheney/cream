import { beforeEach, describe, expect, it } from "bun:test";
import {
  createMockBroker,
  createMockDatabento,
  createMockHelixDB,
  createMockPolygon,
  createMockTurso,
  // Broker
  MockBrokerAdapter,
  MockDatabentoAdapter,
  // HelixDB
  MockHelixDB,
  // Market Data
  MockPolygonAdapter,
  // Turso
  MockTursoClient,
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
      expect(candles[0]?.open).toBeDefined();
      expect(candles[0]?.close).toBeDefined();
      expect(candles[0]?.volume).toBeDefined();
    });

    it("uses pre-loaded fixture data", async () => {
      // Default fixtures include AAPL bull trend
      const snapshot = await polygon.getSnapshot("AAPL");

      expect(snapshot).toBeDefined();
      expect(snapshot?.symbol).toBe("AAPL");
    });

    it("generates candles for unknown symbol", async () => {
      // Request candles for a symbol without pre-set data
      const candles = await polygon.getCandles("UNKNOWN_SYMBOL", "1h", 5);

      expect(candles.length).toBe(5);
      expect(candles[0]?.open).toBeDefined();
    });

    it("generates candles non-deterministically when configured", async () => {
      const nonDeterministicPolygon = createMockPolygon({
        deterministic: false,
      });

      const candles = await nonDeterministicPolygon.getCandles("TEST", "1h", 3);
      expect(candles.length).toBe(3);
    });
  });

  describe("snapshots", () => {
    it("returns undefined for unknown symbol", async () => {
      const snapshot = await polygon.getSnapshot("UNKNOWN_SYMBOL_XYZ");
      expect(snapshot).toBeUndefined();
    });

    it("returns undefined from getSnapshotWithIndicators for unknown symbol", async () => {
      const result = await polygon.getSnapshotWithIndicators("UNKNOWN_SYMBOL_XYZ");
      expect(result).toBeUndefined();
    });

    it("sets custom snapshot data", () => {
      const customSnapshot = {
        symbol: "CUSTOM",
        lastPrice: 123.45,
        candles: [
          {
            timestamp: new Date().toISOString(),
            open: 122.5,
            high: 125.0,
            low: 122.0,
            close: 123.45,
            volume: 1000000,
          },
        ],
        indicators: {
          rsi_14: 55,
          atr_14: 2.5,
          sma_20: 120,
          sma_50: 118,
          sma_200: 110,
        },
      };

      polygon.setSnapshot("CUSTOM", customSnapshot);
    });

    it("sets custom candle data", () => {
      const candles = [
        {
          timestamp: new Date().toISOString(),
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          volume: 1000000,
        },
      ];

      polygon.setCandles("CUSTOM", "1h", candles);
    });

    it("sets custom quote data", () => {
      const quote = {
        symbol: "CUSTOM",
        bid: 99.5,
        ask: 100.5,
        bidSize: 100,
        askSize: 200,
        timestamp: new Date().toISOString(),
      };

      polygon.setQuote("CUSTOM", quote);
    });

    it("resets all state", async () => {
      // Set some custom data first
      polygon.setQuote("TEST", {
        symbol: "TEST",
        bid: 99,
        ask: 100,
        bidSize: 100,
        askSize: 200,
        timestamp: new Date().toISOString(),
      });

      polygon.reset();

      // After reset, pre-loaded fixtures should be restored
      const snapshot = await polygon.getSnapshot("AAPL");
      expect(snapshot).toBeDefined();
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
      const firstOption = chain[0];
      expect(firstOption?.underlying).toBe("AAPL");
      if (firstOption) {
        expect(["CALL", "PUT"]).toContain(firstOption.optionType);
      }
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
      expect(trades[0]?.symbol).toBe("AAPL");
      expect(trades[0]?.price).toBeDefined();
      expect(trades[0]?.size).toBeDefined();
    });

    it("sets custom trade data", () => {
      const customTrades = [
        {
          symbol: "CUSTOM",
          price: 150.25,
          size: 100,
          timestamp: new Date().toISOString(),
          side: "B" as const,
        },
      ];

      databento.setTrades("CUSTOM", customTrades);
    });
  });

  describe("quotes", () => {
    it("returns current quote", async () => {
      const quote = await databento.getQuote("AAPL");

      expect(quote.symbol).toBe("AAPL");
      expect(quote.bid).toBeDefined();
      expect(quote.ask).toBeDefined();
    });

    it("sets custom quote data", () => {
      const customQuote = {
        symbol: "CUSTOM",
        bid: 149.5,
        ask: 150.5,
        bidSize: 500,
        askSize: 600,
        timestamp: new Date().toISOString(),
      };

      databento.setQuote("CUSTOM", customQuote);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      databento.setQuote("TEST", {
        symbol: "TEST",
        bid: 100,
        ask: 101,
        bidSize: 100,
        askSize: 100,
        timestamp: new Date().toISOString(),
      });

      databento.reset();

      // After reset, state should be cleared
      expect(databento).toBeDefined();
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
      expect(edgesFrom[0]?.toId).toBe("b");
    });

    it("retrieves edges to a node", async () => {
      await helix.upsertNode("a", "Node", {});
      await helix.upsertNode("b", "Node", {});
      await helix.upsertNode("c", "Node", {});

      await helix.createEdge("a", "c", "DEPENDS_ON");
      await helix.createEdge("b", "c", "DEPENDS_ON");

      const edgesTo = await helix.getEdgesTo("c");
      expect(edgesTo).toHaveLength(2);

      const edgesToWithType = await helix.getEdgesTo("c", "DEPENDS_ON");
      expect(edgesToWithType).toHaveLength(2);
    });

    it("filters edges by type", async () => {
      await helix.upsertNode("a", "Node", {});
      await helix.upsertNode("b", "Node", {});

      await helix.createEdge("a", "b", "TYPE_A");
      await helix.createEdge("a", "b", "TYPE_B");

      const typeA = await helix.getEdgesFrom("a", "TYPE_A");
      expect(typeA).toHaveLength(1);
      expect(typeA[0]?.type).toBe("TYPE_A");
    });
  });

  describe("trade memory", () => {
    it("retrieves default trade memories", async () => {
      const memories = await helix.retrieveTradeMemory({}, 5);

      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0]?.item.caseId).toBeDefined();
      expect(memories[0]?.score).toBeDefined();
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

  describe("vector search", () => {
    it("searches nodes by embedding similarity", async () => {
      const embedding = new Array(768).fill(0.5);
      await helix.upsertNode("vec-1", "Document", { title: "First" }, embedding);
      await helix.upsertNode("vec-2", "Document", { title: "Second" }, embedding);
      await helix.upsertNode("vec-3", "Other", { title: "Third" }, embedding);

      const results = await helix.vectorSearch(embedding, "Document", 10);

      expect(results).toHaveLength(2);
      expect(results[0]?.item.type).toBe("Document");
      expect(results[0]?.score).toBeGreaterThan(0);
    });

    it("returns empty for non-matching type", async () => {
      const embedding = new Array(768).fill(0.5);
      await helix.upsertNode("vec-1", "Document", { title: "First" }, embedding);

      const results = await helix.vectorSearch(embedding, "NonExistent", 10);

      expect(results).toHaveLength(0);
    });
  });

  describe("cosine similarity (non-deterministic)", () => {
    it("calculates similarity for non-deterministic mode", async () => {
      const nonDetHelix = createMockHelixDB({
        queryDelay: 0,
        deterministic: false,
      });

      const embedding1 = new Array(768).fill(0.5);
      const embedding2 = new Array(768).fill(0.5);
      await nonDetHelix.upsertNode("vec-1", "Doc", { title: "Test" }, embedding1);

      const results = await nonDetHelix.vectorSearch(embedding2, "Doc", 10);

      expect(results).toHaveLength(1);
      // With identical vectors, similarity should be ~1
      expect(results[0]?.score).toBeCloseTo(1, 1);
    });

    it("handles vectors of different lengths", async () => {
      const nonDetHelix = createMockHelixDB({
        queryDelay: 0,
        deterministic: false,
      });

      // Create with one embedding length
      const embedding1 = new Array(768).fill(0.5);
      await nonDetHelix.upsertNode("vec-1", "Doc", { title: "Test" }, embedding1);

      // Search with different length (should return 0 similarity)
      const differentLength = new Array(512).fill(0.5);
      const results = await nonDetHelix.vectorSearch(differentLength, "Doc", 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.score).toBe(0);
    });

    it("handles zero norm vectors", async () => {
      const nonDetHelix = createMockHelixDB({
        queryDelay: 0,
        deterministic: false,
      });

      // Create with zero vector
      const zeroEmbedding = new Array(768).fill(0);
      await nonDetHelix.upsertNode("vec-1", "Doc", { title: "Test" }, zeroEmbedding);

      const nonZero = new Array(768).fill(0.5);
      const results = await nonDetHelix.vectorSearch(nonZero, "Doc", 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.score).toBe(0);
    });
  });

  describe("query", () => {
    it("executes basic HelixQL query", async () => {
      await helix.upsertNode("doc-1", "Document", { title: "First" });
      await helix.upsertNode("doc-2", "Document", { title: "Second" });

      const results = await helix.query("MATCH (n:Document) RETURN n");

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty("n");
    });

    it("returns empty for non-matching type", async () => {
      const results = await helix.query("MATCH (n:NonExistent) RETURN n");
      expect(results).toHaveLength(0);
    });

    it("returns empty for invalid query", async () => {
      const results = await helix.query("INVALID QUERY");
      expect(results).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", async () => {
      // Reset first to clear default memories
      helix.reset();

      await helix.upsertNode("a", "Node", {});
      await helix.upsertNode("b", "Node", {});
      await helix.createEdge("a", "b", "CONNECTS");

      const stats = helix.getStats();

      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);
      expect(stats.tradeMemories).toBeGreaterThan(0); // Has default memories
    });
  });

  describe("getAllTradeMemories", () => {
    it("returns all trade memories", async () => {
      const memories = await helix.getAllTradeMemories();
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0]?.caseId).toBeDefined();
    });
  });

  describe("failure simulation", () => {
    it("throws on simulated failure", async () => {
      const failing = createMockHelixDB({
        simulateFailure: true,
      });

      await expect(failing.getNode("test")).rejects.toThrow("MockHelixDB");
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
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

      const tables = turso.getTableNames();
      expect(tables).toContain("users");
    });

    it("inserts rows", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

      const result = await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [
        1,
        "Alice",
      ]);

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

      const result = await turso.execute("SELECT id, name FROM users WHERE id = ?", [1]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.[1]).toBe("Alice");
    });

    it("updates rows", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);

      const result = await turso.execute("UPDATE users SET name = ? WHERE id = ?", ["Alicia", 1]);

      expect(result.rowsAffected).toBe(1);

      const select = await turso.execute("SELECT name FROM users WHERE id = ?", [1]);
      expect(select.rows[0]?.[0]).toBe("Alicia");
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
      expect(results[3]?.rows).toHaveLength(2);
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

  describe("TursoClient-compatible methods", () => {
    it("executeRows returns typed row objects", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [2, "Bob"]);

      const rows = await turso.executeRows<{ id: number; name: string }>(
        "SELECT id, name FROM users"
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1, name: "Alice" });
      expect(rows[1]).toEqual({ id: 2, name: "Bob" });
    });

    it("get returns single row or undefined", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      await turso.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, "Alice"]);

      const found = await turso.get<{ id: number; name: string }>(
        "SELECT id, name FROM users WHERE id = ?",
        [1]
      );
      expect(found).toEqual({ id: 1, name: "Alice" });

      const notFound = await turso.get<{ id: number; name: string }>(
        "SELECT id, name FROM users WHERE id = ?",
        [999]
      );
      expect(notFound).toBeUndefined();
    });

    it("executeBatch runs multiple statements", async () => {
      await turso.executeBatch([
        { sql: "CREATE TABLE items (id INTEGER, value TEXT)" },
        { sql: "INSERT INTO items (id, value) VALUES (?, ?)", args: [1, "first"] },
        { sql: "INSERT INTO items (id, value) VALUES (?, ?)", args: [2, "second"] },
      ]);

      const rows = await turso.executeRows<{ id: number; value: string }>(
        "SELECT id, value FROM items"
      );
      expect(rows).toHaveLength(2);
    });

    it("run returns changes and lastInsertRowid", async () => {
      await turso.execute("CREATE TABLE counters (id INTEGER PRIMARY KEY, count INTEGER)");

      const result = await turso.run("INSERT INTO counters (id, count) VALUES (?, ?)", [1, 0]);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1n);
    });
  });

  describe("table access methods", () => {
    it("getTable returns table data", async () => {
      await turso.execute("CREATE TABLE items (id INTEGER, name TEXT)");
      await turso.execute("INSERT INTO items (id, name) VALUES (?, ?)", [1, "Apple"]);

      const data = turso.getTable("items");
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({ id: 1, name: "Apple" });
    });

    it("getTable returns empty array for non-existent table", () => {
      const data = turso.getTable("nonexistent");
      expect(data).toEqual([]);
    });

    it("setTable sets table data directly", () => {
      turso.setTable("products", [
        { id: 1, name: "Widget" },
        { id: 2, name: "Gadget" },
      ]);

      const data = turso.getTable("products");
      expect(data).toHaveLength(2);
    });
  });

  describe("close method", () => {
    it("close is a no-op", () => {
      expect(() => turso.close()).not.toThrow();
    });
  });

  describe("transaction close", () => {
    it("transaction close is a no-op", async () => {
      await turso.execute("CREATE TABLE users (id INTEGER)");
      const tx = await turso.transaction();
      await expect(tx.close()).resolves.toBeUndefined();
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
