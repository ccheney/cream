/**
 * Repository Tests
 *
 * Tests the repository layer with in-memory SQLite databases.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  DecisionsRepository,
  AlertsRepository,
  OrdersRepository,
  PositionsRepository,
  RepositoryError,
  withTransaction,
} from "./index.js";

// ============================================
// Test Setup
// ============================================

async function setupTables(client: TursoClient): Promise<void> {
  // Create minimal schema for testing
  await client.run(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT NOT NULL,
      size REAL NOT NULL,
      size_unit TEXT NOT NULL,
      entry_price REAL,
      stop_price REAL,
      target_price REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      strategy_family TEXT,
      time_horizon TEXT,
      rationale TEXT,
      bullish_factors TEXT DEFAULT '[]',
      bearish_factors TEXT DEFAULT '[]',
      confidence_score REAL,
      risk_score REAL,
      metadata TEXT DEFAULT '{}',
      environment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      environment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      decision_id TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      filled_qty REAL DEFAULT 0,
      type TEXT NOT NULL,
      limit_price REAL,
      stop_price REAL,
      avg_fill_price REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      time_in_force TEXT DEFAULT 'DAY',
      broker_order_id TEXT,
      broker_status TEXT,
      metadata TEXT DEFAULT '{}',
      environment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      filled_at TEXT,
      cancelled_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      avg_entry REAL NOT NULL,
      current_price REAL,
      cost_basis REAL NOT NULL,
      market_value REAL,
      unrealized_pnl REAL,
      unrealized_pnl_pct REAL,
      realized_pnl REAL,
      thesis_id TEXT,
      decision_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      metadata TEXT DEFAULT '{}',
      environment TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ============================================
// DecisionsRepository Tests
// ============================================

describe("DecisionsRepository", () => {
  let client: TursoClient;
  let repo: DecisionsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new DecisionsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates a decision", async () => {
    const decision = await repo.create({
      id: "dec-001",
      cycleId: "cycle-001",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: 100,
      sizeUnit: "SHARES",
      entryPrice: 150.0,
      stopPrice: 145.0,
      targetPrice: 160.0,
      environment: "BACKTEST",
    });

    expect(decision.id).toBe("dec-001");
    expect(decision.symbol).toBe("AAPL");
    expect(decision.action).toBe("BUY");
    expect(decision.direction).toBe("LONG");
    expect(decision.size).toBe(100);
    expect(decision.status).toBe("pending");
  });

  test("finds decision by ID", async () => {
    await repo.create({
      id: "dec-002",
      cycleId: "cycle-001",
      symbol: "MSFT",
      action: "SELL",
      direction: "FLAT",
      size: 50,
      sizeUnit: "SHARES",
      environment: "BACKTEST",
    });

    const decision = await repo.findById("dec-002");
    expect(decision).not.toBeNull();
    expect(decision?.symbol).toBe("MSFT");
  });

  test("throws when decision not found", async () => {
    await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
  });

  test("updates decision status", async () => {
    await repo.create({
      id: "dec-003",
      cycleId: "cycle-001",
      symbol: "GOOGL",
      action: "BUY",
      direction: "LONG",
      size: 25,
      sizeUnit: "SHARES",
      environment: "BACKTEST",
    });

    const updated = await repo.updateStatus("dec-003", "approved");
    expect(updated.status).toBe("approved");
  });

  test("finds decisions by symbol", async () => {
    await repo.create({
      id: "dec-004",
      cycleId: "cycle-001",
      symbol: "TSLA",
      action: "BUY",
      direction: "LONG",
      size: 10,
      sizeUnit: "SHARES",
      environment: "BACKTEST",
    });
    await repo.create({
      id: "dec-005",
      cycleId: "cycle-002",
      symbol: "TSLA",
      action: "SELL",
      direction: "FLAT",
      size: 10,
      sizeUnit: "SHARES",
      environment: "BACKTEST",
    });

    const decisions = await repo.findBySymbol("TSLA");
    expect(decisions).toHaveLength(2);
  });

  test("finds decisions with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({
        id: `dec-page-${i}`,
        cycleId: "cycle-001",
        symbol: "SPY",
        action: "BUY",
        direction: "LONG",
        size: 100,
        sizeUnit: "SHARES",
        environment: "BACKTEST",
      });
    }

    const page1 = await repo.findMany({}, { page: 1, pageSize: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasNext).toBe(true);

    const page2 = await repo.findMany({}, { page: 2, pageSize: 2 });
    expect(page2.data).toHaveLength(2);
    expect(page2.hasPrev).toBe(true);
  });

  test("deletes a decision", async () => {
    await repo.create({
      id: "dec-delete",
      cycleId: "cycle-001",
      symbol: "NVDA",
      action: "BUY",
      direction: "LONG",
      size: 5,
      sizeUnit: "SHARES",
      environment: "BACKTEST",
    });

    const deleted = await repo.delete("dec-delete");
    expect(deleted).toBe(true);

    const found = await repo.findById("dec-delete");
    expect(found).toBeNull();
  });
});

// ============================================
// AlertsRepository Tests
// ============================================

describe("AlertsRepository", () => {
  let client: TursoClient;
  let repo: AlertsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new AlertsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates an alert", async () => {
    const alert = await repo.create({
      id: "alert-001",
      severity: "warning",
      type: "order",
      title: "Order Failed",
      message: "Order for AAPL failed to execute",
      environment: "PAPER",
    });

    expect(alert.id).toBe("alert-001");
    expect(alert.severity).toBe("warning");
    expect(alert.acknowledged).toBe(false);
  });

  test("finds unacknowledged alerts", async () => {
    await repo.create({
      id: "alert-unack-1",
      severity: "critical",
      type: "risk",
      title: "Risk Alert",
      message: "Portfolio exposure exceeded",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-unack-2",
      severity: "info",
      type: "system",
      title: "System Alert",
      message: "Cycle completed",
      environment: "PAPER",
    });

    const alerts = await repo.findUnacknowledged("PAPER");
    expect(alerts).toHaveLength(2);
    // Critical should come first
    expect(alerts[0].severity).toBe("critical");
  });

  test("acknowledges an alert", async () => {
    await repo.create({
      id: "alert-ack",
      severity: "warning",
      type: "order",
      title: "Test",
      message: "Test alert",
      environment: "PAPER",
    });

    const acknowledged = await repo.acknowledge("alert-ack", "admin");
    expect(acknowledged.acknowledged).toBe(true);
    expect(acknowledged.acknowledgedBy).toBe("admin");
    expect(acknowledged.acknowledgedAt).not.toBeNull();
  });

  test("acknowledges multiple alerts", async () => {
    await repo.create({
      id: "alert-multi-1",
      severity: "info",
      type: "system",
      title: "Test 1",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-multi-2",
      severity: "info",
      type: "system",
      title: "Test 2",
      message: "Test",
      environment: "PAPER",
    });

    const count = await repo.acknowledgeMany(["alert-multi-1", "alert-multi-2"], "admin");
    expect(count).toBe(2);

    const unack = await repo.findUnacknowledged("PAPER");
    expect(unack).toHaveLength(0);
  });

  test("counts alerts by severity", async () => {
    await repo.create({
      id: "alert-count-1",
      severity: "critical",
      type: "risk",
      title: "Critical",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-count-2",
      severity: "warning",
      type: "order",
      title: "Warning",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-count-3",
      severity: "warning",
      type: "order",
      title: "Warning 2",
      message: "Test",
      environment: "PAPER",
    });

    const counts = await repo.countBySeverity("PAPER");
    expect(counts.critical).toBe(1);
    expect(counts.warning).toBe(2);
    expect(counts.info).toBe(0);
  });
});

// ============================================
// OrdersRepository Tests
// ============================================

describe("OrdersRepository", () => {
  let client: TursoClient;
  let repo: OrdersRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new OrdersRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates an order", async () => {
    const order = await repo.create({
      id: "order-001",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "LIMIT",
      limitPrice: 150.0,
      environment: "PAPER",
    });

    expect(order.id).toBe("order-001");
    expect(order.symbol).toBe("AAPL");
    expect(order.status).toBe("pending");
    expect(order.orderType).toBe("LIMIT");
  });

  test("updates order status", async () => {
    await repo.create({
      id: "order-status",
      symbol: "MSFT",
      side: "BUY",
      quantity: 50,
      orderType: "MARKET",
      environment: "PAPER",
    });

    const updated = await repo.updateStatus("order-status", "submitted", "broker-123");
    expect(updated.status).toBe("submitted");
    expect(updated.brokerOrderId).toBe("broker-123");
    expect(updated.submittedAt).not.toBeNull();
  });

  test("updates fill information", async () => {
    await repo.create({
      id: "order-fill",
      symbol: "GOOGL",
      side: "BUY",
      quantity: 100,
      orderType: "LIMIT",
      limitPrice: 140.0,
      environment: "PAPER",
    });

    // Partial fill
    let updated = await repo.updateFill("order-fill", 50, 139.5);
    expect(updated.filledQuantity).toBe(50);
    expect(updated.avgFillPrice).toBe(139.5);
    expect(updated.status).toBe("partially_filled");

    // Complete fill
    updated = await repo.updateFill("order-fill", 100, 139.75);
    expect(updated.status).toBe("filled");
    expect(updated.filledAt).not.toBeNull();
  });

  test("finds active orders", async () => {
    await repo.create({
      id: "order-active-1",
      symbol: "SPY",
      side: "BUY",
      quantity: 10,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.create({
      id: "order-active-2",
      symbol: "QQQ",
      side: "SELL",
      quantity: 20,
      orderType: "LIMIT",
      limitPrice: 400.0,
      environment: "PAPER",
    });

    const active = await repo.findActive("PAPER");
    expect(active).toHaveLength(2);
  });
});

// ============================================
// PositionsRepository Tests
// ============================================

describe("PositionsRepository", () => {
  let client: TursoClient;
  let repo: PositionsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new PositionsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates a position", async () => {
    const position = await repo.create({
      id: "pos-001",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });

    expect(position.id).toBe("pos-001");
    expect(position.symbol).toBe("AAPL");
    expect(position.costBasis).toBe(15000); // 100 * 150
    expect(position.status).toBe("open");
  });

  test("updates position price", async () => {
    await repo.create({
      id: "pos-price",
      symbol: "MSFT",
      side: "LONG",
      quantity: 50,
      avgEntryPrice: 400.0,
      environment: "PAPER",
    });

    const updated = await repo.updatePrice("pos-price", 420.0);
    expect(updated.currentPrice).toBe(420);
    expect(updated.marketValue).toBe(21000); // 50 * 420
    expect(updated.unrealizedPnl).toBe(1000); // 21000 - 20000
  });

  test("closes a position", async () => {
    await repo.create({
      id: "pos-close",
      symbol: "GOOGL",
      side: "LONG",
      quantity: 25,
      avgEntryPrice: 140.0,
      environment: "PAPER",
    });

    const closed = await repo.close("pos-close", 150.0);
    expect(closed.status).toBe("closed");
    expect(closed.realizedPnl).toBe(250); // (150 - 140) * 25
    expect(closed.closedAt).not.toBeNull();
  });

  test("gets portfolio summary", async () => {
    await repo.create({
      id: "pos-sum-1",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      currentPrice: 155.0,
      environment: "PAPER",
    });
    await repo.updatePrice("pos-sum-1", 155.0);

    await repo.create({
      id: "pos-sum-2",
      symbol: "MSFT",
      side: "SHORT",
      quantity: 50,
      avgEntryPrice: 400.0,
      currentPrice: 395.0,
      environment: "PAPER",
    });
    await repo.updatePrice("pos-sum-2", 395.0);

    const summary = await repo.getPortfolioSummary("PAPER");
    expect(summary.totalPositions).toBe(2);
    expect(summary.longPositions).toBe(1);
    expect(summary.shortPositions).toBe(1);
  });
});

// ============================================
// Transaction Tests
// ============================================

describe("withTransaction", () => {
  let client: TursoClient;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
  });

  afterEach(() => {
    client.close();
  });

  test("commits on success", async () => {
    const decisionsRepo = new DecisionsRepository(client);
    const ordersRepo = new OrdersRepository(client);

    await withTransaction(client, async () => {
      await decisionsRepo.create({
        id: "tx-dec",
        cycleId: "cycle-001",
        symbol: "AAPL",
        action: "BUY",
        direction: "LONG",
        size: 100,
        sizeUnit: "SHARES",
        environment: "BACKTEST",
      });

      await ordersRepo.create({
        id: "tx-order",
        decisionId: "tx-dec",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        orderType: "MARKET",
        environment: "BACKTEST",
      });
    });

    const decision = await decisionsRepo.findById("tx-dec");
    const order = await ordersRepo.findById("tx-order");
    expect(decision).not.toBeNull();
    expect(order).not.toBeNull();
  });

  test("rolls back on error", async () => {
    const decisionsRepo = new DecisionsRepository(client);

    await expect(
      withTransaction(client, async () => {
        await decisionsRepo.create({
          id: "tx-rollback",
          cycleId: "cycle-001",
          symbol: "AAPL",
          action: "BUY",
          direction: "LONG",
          size: 100,
          sizeUnit: "SHARES",
          environment: "BACKTEST",
        });

        throw new Error("Simulated failure");
      })
    ).rejects.toThrow();

    const decision = await decisionsRepo.findById("tx-rollback");
    expect(decision).toBeNull();
  });
});
