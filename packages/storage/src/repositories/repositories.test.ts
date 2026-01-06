/**
 * Repository Tests
 *
 * Tests the repository layer with in-memory SQLite databases.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  AlertsRepository,
  DecisionsRepository,
  isValidTransition,
  OrdersRepository,
  PositionsRepository,
  RepositoryError,
  ThesisStateRepository,
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

  await client.run(`
    CREATE TABLE IF NOT EXISTS thesis_state (
      thesis_id TEXT PRIMARY KEY,
      instrument_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('WATCHING', 'ENTERED', 'ADDING', 'MANAGING', 'EXITING', 'CLOSED')),
      entry_price REAL,
      entry_date TEXT,
      current_stop REAL,
      current_target REAL,
      conviction REAL CHECK (conviction IS NULL OR (conviction >= 0 AND conviction <= 1)),
      entry_thesis TEXT,
      invalidation_conditions TEXT,
      add_count INTEGER NOT NULL DEFAULT 0,
      max_position_reached INTEGER NOT NULL DEFAULT 0 CHECK (max_position_reached IN (0, 1)),
      peak_unrealized_pnl REAL,
      close_reason TEXT,
      exit_price REAL,
      realized_pnl REAL,
      realized_pnl_pct REAL,
      environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
      notes TEXT,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS thesis_state_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thesis_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      trigger_reason TEXT,
      cycle_id TEXT,
      price_at_transition REAL,
      conviction_at_transition REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (thesis_id) REFERENCES thesis_state(thesis_id) ON DELETE CASCADE
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

  test("finds decisions by cycle", async () => {
    await repo.create({
      id: "dec-cycle-1",
      cycleId: "cycle-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: 100,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });
    await repo.create({
      id: "dec-cycle-2",
      cycleId: "cycle-123",
      symbol: "MSFT",
      action: "BUY",
      direction: "LONG",
      size: 50,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });

    const decisions = await repo.findByCycle("cycle-123");
    expect(decisions).toHaveLength(2);
  });

  test("finds recent decisions", async () => {
    await repo.create({
      id: "dec-recent-1",
      cycleId: "cycle-001",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: 100,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });
    await repo.create({
      id: "dec-recent-2",
      cycleId: "cycle-002",
      symbol: "MSFT",
      action: "BUY",
      direction: "LONG",
      size: 50,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });

    const recent = await repo.findRecent("PAPER", 10);
    expect(recent).toHaveLength(2);
  });

  test("updates a decision with multiple fields", async () => {
    await repo.create({
      id: "dec-update",
      cycleId: "cycle-001",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: 100,
      sizeUnit: "SHARES",
      entryPrice: 150.0,
      environment: "PAPER",
    });

    const updated = await repo.update("dec-update", {
      size: 200,
      stopPrice: 145.0,
      targetPrice: 165.0,
      status: "approved",
      rationale: "Updated rationale",
      bullishFactors: ["Strong earnings", "Positive guidance"],
      bearishFactors: ["Market uncertainty"],
      confidenceScore: 0.85,
      riskScore: 0.3,
      metadata: { source: "test" },
    });

    expect(updated.size).toBe(200);
    expect(updated.stopPrice).toBe(145);
    expect(updated.targetPrice).toBe(165);
    expect(updated.status).toBe("approved");
    expect(updated.rationale).toBe("Updated rationale");
    expect(updated.bullishFactors).toHaveLength(2);
    expect(updated.bearishFactors).toHaveLength(1);
    expect(updated.confidenceScore).toBe(0.85);
    expect(updated.riskScore).toBe(0.3);
  });

  test("counts decisions by status", async () => {
    await repo.create({
      id: "dec-count-1",
      cycleId: "cycle-001",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: 100,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });
    await repo.create({
      id: "dec-count-2",
      cycleId: "cycle-002",
      symbol: "MSFT",
      action: "BUY",
      direction: "LONG",
      size: 50,
      sizeUnit: "SHARES",
      environment: "PAPER",
    });
    await repo.updateStatus("dec-count-2", "approved");

    const counts = await repo.countByStatus("PAPER");
    expect(counts.pending).toBe(1);
    expect(counts.approved).toBe(1);
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
    expect(alerts[0]!.severity).toBe("critical");
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

  test("finds alerts with filters", async () => {
    await repo.create({
      id: "alert-filter-1",
      severity: "critical",
      type: "risk",
      title: "Risk Alert",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-filter-2",
      severity: "warning",
      type: "order",
      title: "Order Alert",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-filter-3",
      severity: "info",
      type: "system",
      title: "System Alert",
      message: "Test",
      environment: "LIVE",
    });

    // Filter by severity
    const criticalAlerts = await repo.findMany({ severity: "critical" });
    expect(criticalAlerts.data).toHaveLength(1);

    // Filter by severity array
    const multiSeverity = await repo.findMany({ severity: ["critical", "warning"] });
    expect(multiSeverity.data).toHaveLength(2);

    // Filter by type
    const orderAlerts = await repo.findMany({ type: "order" });
    expect(orderAlerts.data).toHaveLength(1);

    // Filter by type array
    const multiType = await repo.findMany({ type: ["order", "risk"] });
    expect(multiType.data).toHaveLength(2);

    // Filter by environment
    const liveAlerts = await repo.findMany({ environment: "LIVE" });
    expect(liveAlerts.data).toHaveLength(1);

    // Filter by acknowledged
    const unackAlerts = await repo.findMany({ acknowledged: false });
    expect(unackAlerts.data).toHaveLength(3);
  });

  test("finds recent alerts", async () => {
    await repo.create({
      id: "alert-recent-1",
      severity: "info",
      type: "system",
      title: "Recent 1",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-recent-2",
      severity: "info",
      type: "system",
      title: "Recent 2",
      message: "Test",
      environment: "PAPER",
    });

    const recent = await repo.findRecent("PAPER", 10);
    expect(recent).toHaveLength(2);
  });

  test("acknowledges all alerts", async () => {
    await repo.create({
      id: "alert-all-1",
      severity: "info",
      type: "system",
      title: "Test 1",
      message: "Test",
      environment: "PAPER",
    });
    await repo.create({
      id: "alert-all-2",
      severity: "info",
      type: "system",
      title: "Test 2",
      message: "Test",
      environment: "PAPER",
    });

    const count = await repo.acknowledgeAll("PAPER", "admin");
    expect(count).toBe(2);

    const unack = await repo.findUnacknowledged("PAPER");
    expect(unack).toHaveLength(0);
  });

  test("deletes an alert", async () => {
    await repo.create({
      id: "alert-delete",
      severity: "info",
      type: "system",
      title: "To Delete",
      message: "Test",
      environment: "PAPER",
    });

    const deleted = await repo.delete("alert-delete");
    expect(deleted).toBe(true);

    const found = await repo.findById("alert-delete");
    expect(found).toBeNull();
  });

  test("deletes expired alerts", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago

    await repo.create({
      id: "alert-expired",
      severity: "info",
      type: "system",
      title: "Expired",
      message: "Test",
      environment: "PAPER",
      expiresAt: pastDate,
    });

    const count = await repo.deleteExpired();
    expect(count).toBe(1);
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

  test("finds order by broker order ID", async () => {
    await repo.create({
      id: "order-broker-id",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.updateStatus("order-broker-id", "submitted", "broker-abc-123");

    const order = await repo.findByBrokerOrderId("broker-abc-123");
    expect(order).not.toBeNull();
    expect(order!.id).toBe("order-broker-id");
  });

  test("finds orders with filters", async () => {
    await repo.create({
      id: "order-filter-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "LIMIT",
      limitPrice: 150.0,
      environment: "PAPER",
    });
    await repo.create({
      id: "order-filter-2",
      symbol: "MSFT",
      side: "SELL",
      quantity: 50,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.create({
      id: "order-filter-3",
      symbol: "AAPL",
      side: "BUY",
      quantity: 200,
      orderType: "MARKET",
      environment: "LIVE",
    });

    // Filter by symbol
    const aaplOrders = await repo.findMany({ symbol: "AAPL" });
    expect(aaplOrders.data).toHaveLength(2);

    // Filter by side
    const buyOrders = await repo.findMany({ side: "BUY" });
    expect(buyOrders.data).toHaveLength(2);

    // Filter by order type
    const limitOrders = await repo.findMany({ orderType: "LIMIT" });
    expect(limitOrders.data).toHaveLength(1);

    // Filter by status (array)
    const pendingOrders = await repo.findMany({ status: ["pending", "submitted"] });
    expect(pendingOrders.data).toHaveLength(3);

    // Filter by environment
    const liveOrders = await repo.findMany({ environment: "LIVE" });
    expect(liveOrders.data).toHaveLength(1);
  });

  test("finds orders by decision", async () => {
    await repo.create({
      id: "order-decision-1",
      symbol: "SPY",
      side: "BUY",
      quantity: 10,
      orderType: "MARKET",
      environment: "PAPER",
      decisionId: "decision-123",
    });
    await repo.create({
      id: "order-decision-2",
      symbol: "QQQ",
      side: "BUY",
      quantity: 20,
      orderType: "MARKET",
      environment: "PAPER",
      decisionId: "decision-123",
    });

    const orders = await repo.findByDecision("decision-123");
    expect(orders).toHaveLength(2);
  });

  test("finds recent orders", async () => {
    await repo.create({
      id: "order-recent-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.create({
      id: "order-recent-2",
      symbol: "MSFT",
      side: "BUY",
      quantity: 50,
      orderType: "MARKET",
      environment: "PAPER",
    });

    const recent = await repo.findRecent("PAPER", 10);
    expect(recent).toHaveLength(2);
  });

  test("cancels an order", async () => {
    await repo.create({
      id: "order-cancel",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "LIMIT",
      limitPrice: 150.0,
      environment: "PAPER",
    });

    const cancelled = await repo.cancel("order-cancel");
    expect(cancelled.status).toBe("cancelled");
  });

  test("deletes an order", async () => {
    await repo.create({
      id: "order-delete",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "MARKET",
      environment: "PAPER",
    });

    const deleted = await repo.delete("order-delete");
    expect(deleted).toBe(true);

    const found = await repo.findById("order-delete");
    expect(found).toBeNull();
  });

  test("counts orders by status", async () => {
    await repo.create({
      id: "order-count-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.create({
      id: "order-count-2",
      symbol: "MSFT",
      side: "BUY",
      quantity: 50,
      orderType: "MARKET",
      environment: "PAPER",
    });
    await repo.updateStatus("order-count-2", "filled");

    const counts = await repo.countByStatus("PAPER");
    expect(counts.pending).toBe(1);
    expect(counts.filled).toBe(1);
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

  test("finds positions with filters", async () => {
    await repo.create({
      id: "pos-filter-1",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });
    await repo.create({
      id: "pos-filter-2",
      symbol: "MSFT",
      side: "SHORT",
      quantity: 50,
      avgEntryPrice: 400.0,
      environment: "PAPER",
    });
    await repo.create({
      id: "pos-filter-3",
      symbol: "GOOGL",
      side: "LONG",
      quantity: 25,
      avgEntryPrice: 140.0,
      environment: "LIVE",
    });

    // Filter by symbol
    const aaplPos = await repo.findMany({ symbol: "AAPL" });
    expect(aaplPos.data).toHaveLength(1);

    // Filter by side
    const longPos = await repo.findMany({ side: "LONG" });
    expect(longPos.data).toHaveLength(2);

    // Filter by status
    const openPos = await repo.findMany({ status: "open" });
    expect(openPos.data).toHaveLength(3);

    // Filter by environment
    const livePos = await repo.findMany({ environment: "LIVE" });
    expect(livePos.data).toHaveLength(1);
  });

  test("finds open positions", async () => {
    await repo.create({
      id: "pos-open-1",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });
    await repo.create({
      id: "pos-open-2",
      symbol: "MSFT",
      side: "LONG",
      quantity: 50,
      avgEntryPrice: 400.0,
      environment: "PAPER",
    });

    const open = await repo.findOpen("PAPER");
    expect(open).toHaveLength(2);
  });

  test("finds position by symbol", async () => {
    await repo.create({
      id: "pos-symbol",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });

    const pos = await repo.findBySymbol("AAPL", "PAPER");
    expect(pos).not.toBeNull();
    expect(pos!.id).toBe("pos-symbol");

    const notFound = await repo.findBySymbol("MSFT", "PAPER");
    expect(notFound).toBeNull();
  });

  test("updates position quantity", async () => {
    await repo.create({
      id: "pos-qty",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });

    // Add to position at higher price
    const updated = await repo.updateQuantity("pos-qty", 150, 160.0);
    expect(updated.quantity).toBe(150);
    // New avg = (100*150 + 50*160) / 150 = 23000/150 = 153.33
    expect(updated.avgEntryPrice).toBeCloseTo(153.33, 1);
  });

  test("deletes a position", async () => {
    await repo.create({
      id: "pos-delete",
      symbol: "AAPL",
      side: "LONG",
      quantity: 100,
      avgEntryPrice: 150.0,
      environment: "PAPER",
    });

    const deleted = await repo.delete("pos-delete");
    expect(deleted).toBe(true);

    const found = await repo.findById("pos-delete");
    expect(found).toBeNull();
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

// ============================================
// ThesisStateRepository Tests
// ============================================

describe("ThesisStateRepository", () => {
  let client: TursoClient;
  let repo: ThesisStateRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new ThesisStateRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates a thesis in WATCHING state", async () => {
    const thesis = await repo.create({
      thesisId: "thesis-001",
      instrumentId: "AAPL",
      entryThesis: "Strong technical setup",
      conviction: 0.8,
      environment: "PAPER",
    });

    expect(thesis.thesisId).toBe("thesis-001");
    expect(thesis.instrumentId).toBe("AAPL");
    expect(thesis.state).toBe("WATCHING");
    expect(thesis.conviction).toBe(0.8);
    expect(thesis.entryThesis).toBe("Strong technical setup");
  });

  test("creates a thesis with custom state", async () => {
    const thesis = await repo.create({
      thesisId: "thesis-002",
      instrumentId: "MSFT",
      state: "ENTERED",
      environment: "PAPER",
    });

    expect(thesis.state).toBe("ENTERED");
  });

  test("finds thesis by ID", async () => {
    await repo.create({
      thesisId: "thesis-find",
      instrumentId: "GOOGL",
      environment: "PAPER",
    });

    const found = await repo.findById("thesis-find");
    expect(found).not.toBeNull();
    expect(found!.instrumentId).toBe("GOOGL");
  });

  test("returns null for non-existent thesis", async () => {
    const found = await repo.findById("non-existent");
    expect(found).toBeNull();
  });

  test("finds active thesis for instrument", async () => {
    await repo.create({
      thesisId: "thesis-active",
      instrumentId: "NVDA",
      environment: "PAPER",
    });

    const active = await repo.findActiveForInstrument("NVDA", "PAPER");
    expect(active).not.toBeNull();
    expect(active!.thesisId).toBe("thesis-active");
  });

  test("finds all active theses", async () => {
    await repo.create({ thesisId: "t1", instrumentId: "AAPL", environment: "PAPER" });
    await repo.create({ thesisId: "t2", instrumentId: "MSFT", environment: "PAPER" });
    await repo.create({
      thesisId: "t3",
      instrumentId: "GOOGL",
      state: "CLOSED",
      environment: "PAPER",
    });

    const active = await repo.findActive("PAPER");
    expect(active).toHaveLength(2);
  });

  test("transitions state correctly", async () => {
    await repo.create({
      thesisId: "thesis-transition",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    const updated = await repo.transitionState("thesis-transition", {
      toState: "ENTERED",
      triggerReason: "Entry signal",
      cycleId: "cycle-001",
    });

    expect(updated.state).toBe("ENTERED");

    // Check history was recorded
    const history = await repo.getHistory("thesis-transition");
    expect(history).toHaveLength(1);
    expect(history[0]!.fromState).toBe("WATCHING");
    expect(history[0]!.toState).toBe("ENTERED");
    expect(history[0]!.triggerReason).toBe("Entry signal");
  });

  test("rejects invalid state transitions", async () => {
    await repo.create({
      thesisId: "thesis-invalid",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    // WATCHING -> MANAGING is not valid
    await expect(repo.transitionState("thesis-invalid", { toState: "MANAGING" })).rejects.toThrow(
      "Invalid state transition"
    );
  });

  test("enters position correctly", async () => {
    await repo.create({
      thesisId: "thesis-enter",
      instrumentId: "AAPL",
      conviction: 0.7,
      environment: "PAPER",
    });

    const entered = await repo.enterPosition("thesis-enter", 150.0, 145.0, 165.0, "cycle-001");

    expect(entered.state).toBe("ENTERED");
    expect(entered.entryPrice).toBe(150.0);
    expect(entered.currentStop).toBe(145.0);
    expect(entered.currentTarget).toBe(165.0);
    expect(entered.entryDate).not.toBeNull();

    // Check history
    const history = await repo.getHistory("thesis-enter");
    expect(history[0]!.priceAtTransition).toBe(150.0);
  });

  test("closes thesis correctly", async () => {
    await repo.create({
      thesisId: "thesis-close",
      instrumentId: "AAPL",
      state: "MANAGING",
      environment: "PAPER",
    });

    const closed = await repo.close("thesis-close", "TARGET_HIT", 165.0, 15.0);

    expect(closed.state).toBe("CLOSED");
    expect(closed.closeReason).toBe("TARGET_HIT");
    expect(closed.exitPrice).toBe(165.0);
    expect(closed.realizedPnl).toBe(15.0);
    expect(closed.closedAt).not.toBeNull();
  });

  test("updates conviction", async () => {
    await repo.create({
      thesisId: "thesis-conv",
      instrumentId: "AAPL",
      conviction: 0.5,
      environment: "PAPER",
    });

    const updated = await repo.updateConviction("thesis-conv", 0.9);
    expect(updated.conviction).toBe(0.9);
  });

  test("rejects invalid conviction values", async () => {
    await repo.create({
      thesisId: "thesis-conv-invalid",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    await expect(repo.updateConviction("thesis-conv-invalid", 1.5)).rejects.toThrow();
  });

  test("updates stop and target levels", async () => {
    await repo.create({
      thesisId: "thesis-levels",
      instrumentId: "AAPL",
      currentStop: 145.0,
      currentTarget: 165.0,
      environment: "PAPER",
    });

    const updated = await repo.updateLevels("thesis-levels", 147.0, 170.0);
    expect(updated.currentStop).toBe(147.0);
    expect(updated.currentTarget).toBe(170.0);
  });

  test("increments add count", async () => {
    await repo.create({
      thesisId: "thesis-add",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    await repo.incrementAddCount("thesis-add");
    await repo.incrementAddCount("thesis-add");

    const thesis = await repo.findById("thesis-add");
    expect(thesis!.addCount).toBe(2);
  });

  test("marks max position reached", async () => {
    await repo.create({
      thesisId: "thesis-max",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    const updated = await repo.markMaxPositionReached("thesis-max");
    expect(updated.maxPositionReached).toBe(true);
  });

  test("updates peak unrealized P&L", async () => {
    await repo.create({
      thesisId: "thesis-peak",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    await repo.updatePeakPnl("thesis-peak", 100.0);
    let thesis = await repo.findById("thesis-peak");
    expect(thesis!.peakUnrealizedPnl).toBe(100.0);

    // Should keep the higher value
    await repo.updatePeakPnl("thesis-peak", 50.0);
    thesis = await repo.findById("thesis-peak");
    expect(thesis!.peakUnrealizedPnl).toBe(100.0);

    // Should update to new higher value
    await repo.updatePeakPnl("thesis-peak", 150.0);
    thesis = await repo.findById("thesis-peak");
    expect(thesis!.peakUnrealizedPnl).toBe(150.0);
  });

  test("adds notes to thesis", async () => {
    await repo.create({
      thesisId: "thesis-notes",
      instrumentId: "AAPL",
      notes: { cycle1: "Initial entry" },
      environment: "PAPER",
    });

    const updated = await repo.addNotes("thesis-notes", "cycle2", "Added to position");
    expect(updated.notes.cycle1).toBe("Initial entry");
    expect(updated.notes.cycle2).toBe("Added to position");
  });

  test("gets thesis context", async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    await repo.create({
      thesisId: "thesis-context",
      instrumentId: "AAPL",
      state: "MANAGING",
      environment: "PAPER",
    });

    // Manually set entry date for test
    await client.run(
      `UPDATE thesis_state SET entry_price = 150.0, entry_date = ?, current_stop = 145.0, current_target = 165.0 WHERE thesis_id = ?`,
      [oneWeekAgo, "thesis-context"]
    );

    const context = await repo.getContext("thesis-context", 155.0);

    expect(context.instrumentId).toBe("AAPL");
    expect(context.currentState).toBe("MANAGING");
    expect(context.entryPrice).toBe(150.0);
    expect(context.currentPnL).toBe(5.0);
    expect(context.stopLoss).toBe(145.0);
    expect(context.takeProfit).toBe(165.0);
    expect(context.daysHeld).toBeGreaterThanOrEqual(6); // At least 6 days
  });

  test("gets thesis statistics", async () => {
    // Create various theses
    await repo.create({
      thesisId: "t1",
      instrumentId: "AAPL",
      state: "WATCHING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t2",
      instrumentId: "MSFT",
      state: "MANAGING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t3",
      instrumentId: "GOOGL",
      state: "CLOSED",
      environment: "PAPER",
    });

    const stats = await repo.getStats("PAPER");

    expect(stats.total).toBe(3);
    expect(stats.byState.WATCHING).toBe(1);
    expect(stats.byState.MANAGING).toBe(1);
    expect(stats.byState.CLOSED).toBe(1);
  });

  test("finds theses by states", async () => {
    await repo.create({
      thesisId: "t1",
      instrumentId: "AAPL",
      state: "WATCHING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t2",
      instrumentId: "MSFT",
      state: "MANAGING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t3",
      instrumentId: "GOOGL",
      state: "EXITING",
      environment: "PAPER",
    });

    const result = await repo.findByStates(["MANAGING", "EXITING"], "PAPER");
    expect(result).toHaveLength(2);
  });

  test("deletes thesis", async () => {
    await repo.create({
      thesisId: "thesis-delete",
      instrumentId: "AAPL",
      environment: "PAPER",
    });

    const deleted = await repo.delete("thesis-delete");
    expect(deleted).toBe(true);

    const found = await repo.findById("thesis-delete");
    expect(found).toBeNull();
  });

  test("finds theses with filters", async () => {
    await repo.create({
      thesisId: "t-filter-1",
      instrumentId: "AAPL",
      state: "WATCHING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t-filter-2",
      instrumentId: "AAPL",
      state: "MANAGING",
      environment: "PAPER",
    });
    await repo.create({
      thesisId: "t-filter-3",
      instrumentId: "MSFT",
      state: "WATCHING",
      environment: "LIVE",
    });

    // Filter by instrument
    const aaplTheses = await repo.findMany({ instrumentId: "AAPL" });
    expect(aaplTheses.data).toHaveLength(2);

    // Filter by state
    const watchingTheses = await repo.findMany({ state: "WATCHING" });
    expect(watchingTheses.data).toHaveLength(2);

    // Filter by multiple states
    const multiStateTheses = await repo.findMany({ states: ["WATCHING", "MANAGING"] });
    expect(multiStateTheses.data).toHaveLength(3);

    // Filter by environment
    const liveTheses = await repo.findMany({ environment: "LIVE" });
    expect(liveTheses.data).toHaveLength(1);
  });

  test("finds active thesis for instrument returns null for closed thesis", async () => {
    await repo.create({
      thesisId: "thesis-closed-inst",
      instrumentId: "META",
      state: "CLOSED",
      environment: "PAPER",
    });

    const active = await repo.findActiveForInstrument("META", "PAPER");
    expect(active).toBeNull();
  });
});

// ============================================
// State Transition Validation Tests
// ============================================

describe("isValidTransition", () => {
  test("allows WATCHING -> ENTERED", () => {
    expect(isValidTransition("WATCHING", "ENTERED")).toBe(true);
  });

  test("allows WATCHING -> CLOSED", () => {
    expect(isValidTransition("WATCHING", "CLOSED")).toBe(true);
  });

  test("allows ENTERED -> MANAGING", () => {
    expect(isValidTransition("ENTERED", "MANAGING")).toBe(true);
  });

  test("allows MANAGING -> EXITING", () => {
    expect(isValidTransition("MANAGING", "EXITING")).toBe(true);
  });

  test("allows EXITING -> CLOSED", () => {
    expect(isValidTransition("EXITING", "CLOSED")).toBe(true);
  });

  test("allows CLOSED -> WATCHING", () => {
    expect(isValidTransition("CLOSED", "WATCHING")).toBe(true);
  });

  test("rejects WATCHING -> MANAGING (skip)", () => {
    expect(isValidTransition("WATCHING", "MANAGING")).toBe(false);
  });

  test("rejects CLOSED -> ENTERED (invalid)", () => {
    expect(isValidTransition("CLOSED", "ENTERED")).toBe(false);
  });
});
