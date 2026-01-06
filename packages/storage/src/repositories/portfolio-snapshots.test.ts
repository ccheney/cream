/**
 * Portfolio Snapshots Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  type CreatePortfolioSnapshotInput,
  PortfolioSnapshotsRepository,
} from "./portfolio-snapshots.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      nav REAL NOT NULL,
      cash REAL NOT NULL,
      equity REAL NOT NULL,
      margin_used REAL,
      buying_power REAL,
      gross_exposure REAL,
      net_exposure REAL,
      long_exposure REAL,
      short_exposure REAL,
      day_pnl REAL,
      day_pnl_pct REAL,
      total_pnl REAL,
      total_pnl_pct REAL,
      environment TEXT NOT NULL
    )
  `);
}

describe("PortfolioSnapshotsRepository", () => {
  let client: TursoClient;
  let repo: PortfolioSnapshotsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new PortfolioSnapshotsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates a portfolio snapshot", async () => {
    const input: CreatePortfolioSnapshotInput = {
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      marginUsed: 10000,
      buyingPower: 90000,
      grossExposure: 0.5,
      netExposure: 0.4,
      longExposure: 0.45,
      shortExposure: 0.05,
      dayPnl: 500,
      dayPnlPct: 0.5,
      totalPnl: 5000,
      totalPnlPct: 5.0,
      environment: "PAPER",
    };

    const result = await repo.create(input);

    expect(result.id).toBeDefined();
    expect(result.nav).toBe(100000);
    expect(result.cash).toBe(50000);
    expect(result.equity).toBe(50000);
    expect(result.marginUsed).toBe(10000);
    expect(result.environment).toBe("PAPER");
  });

  test("creates snapshot with auto timestamp", async () => {
    const result = await repo.create({
      nav: 100000,
      cash: 100000,
      equity: 0,
      environment: "PAPER",
    });

    expect(result.timestamp).toBeDefined();
  });

  test("creates snapshot with minimal input", async () => {
    const result = await repo.create({
      nav: 100000,
      cash: 100000,
      equity: 0,
      environment: "BACKTEST",
    });

    expect(result.marginUsed).toBeNull();
    expect(result.buyingPower).toBeNull();
    expect(result.grossExposure).toBeNull();
    expect(result.dayPnl).toBeNull();
  });

  test("finds snapshot by ID", async () => {
    const created = await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });

    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.nav).toBe(100000);
  });

  test("returns null for non-existent ID", async () => {
    const found = await repo.findById(999);
    expect(found).toBeNull();
  });

  test("finds many snapshots with filters", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-03T10:00:00Z",
      nav: 102000,
      cash: 50000,
      equity: 52000,
      environment: "LIVE",
    });

    const paperSnapshots = await repo.findMany({ environment: "PAPER" });
    expect(paperSnapshots.data).toHaveLength(2);
    expect(paperSnapshots.total).toBe(2);
  });

  test("findMany with date range", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-03T10:00:00Z",
      nav: 102000,
      cash: 50000,
      equity: 52000,
      environment: "PAPER",
    });

    const filtered = await repo.findMany({
      environment: "PAPER",
      fromDate: "2024-01-02T00:00:00Z",
      toDate: "2024-01-02T23:59:59Z",
    });

    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0]!.nav).toBe(101000);
  });

  test("gets latest snapshot", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 105000,
      cash: 50000,
      equity: 55000,
      environment: "PAPER",
    });

    const latest = await repo.getLatest("PAPER");
    expect(latest).not.toBeNull();
    expect(latest!.nav).toBe(105000);
  });

  test("returns null when no snapshots exist", async () => {
    const latest = await repo.getLatest("PAPER");
    expect(latest).toBeNull();
  });

  test("gets equity curve", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      totalPnlPct: 0,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      totalPnlPct: 1,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-03T10:00:00Z",
      nav: 102000,
      cash: 50000,
      equity: 52000,
      totalPnlPct: 2,
      environment: "PAPER",
    });

    const curve = await repo.getEquityCurve("PAPER");

    expect(curve).toHaveLength(3);
    expect(curve[0]!.nav).toBe(100000);
    expect(curve[1]!.nav).toBe(101000);
    expect(curve[2]!.nav).toBe(102000);
    expect(curve[0]!.pnlPct).toBe(0);
    expect(curve[2]!.pnlPct).toBe(2);
  });

  test("gets equity curve with date range", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-03T10:00:00Z",
      nav: 102000,
      cash: 50000,
      equity: 52000,
      environment: "PAPER",
    });

    const curve = await repo.getEquityCurve(
      "PAPER",
      "2024-01-02T00:00:00Z",
      "2024-01-02T23:59:59Z"
    );

    expect(curve).toHaveLength(1);
    expect(curve[0]!.nav).toBe(101000);
  });

  test("gets equity curve with limit", async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({
        timestamp: `2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        nav: 100000 + i * 1000,
        cash: 50000,
        equity: 50000 + i * 1000,
        environment: "PAPER",
      });
    }

    const curve = await repo.getEquityCurve("PAPER", undefined, undefined, 5);
    expect(curve).toHaveLength(5);
  });

  test("gets performance metrics", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    await repo.create({
      timestamp: twoDaysAgo.toISOString(),
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: yesterday.toISOString(),
      nav: 105000,
      cash: 50000,
      equity: 55000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: today.toISOString(),
      nav: 110000,
      cash: 50000,
      equity: 60000,
      environment: "PAPER",
    });

    const metrics = await repo.getPerformanceMetrics("PAPER", 7);

    expect(metrics.startNav).toBe(100000);
    expect(metrics.endNav).toBe(110000);
    expect(metrics.periodReturn).toBe(10000);
    expect(metrics.periodReturnPct).toBeCloseTo(10, 1);
    expect(metrics.maxNav).toBe(110000);
    expect(metrics.minNav).toBe(100000);
    expect(metrics.snapshotCount).toBe(3);
  });

  test("returns zero metrics when no data", async () => {
    const metrics = await repo.getPerformanceMetrics("PAPER");

    expect(metrics.startNav).toBe(0);
    expect(metrics.endNav).toBe(0);
    expect(metrics.periodReturn).toBe(0);
    expect(metrics.periodReturnPct).toBe(0);
    expect(metrics.snapshotCount).toBe(0);
  });

  test("deletes old snapshots", async () => {
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-10T10:00:00Z",
      nav: 105000,
      cash: 50000,
      equity: 55000,
      environment: "PAPER",
    });

    const deleted = await repo.deleteOlderThan("2024-01-05T00:00:00Z");
    expect(deleted).toBe(2);

    const remaining = await repo.findMany({ environment: "PAPER" });
    expect(remaining.data).toHaveLength(1);
    expect(remaining.data[0]!.nav).toBe(105000);
  });

  test("finds snapshot by date", async () => {
    await repo.create({
      timestamp: "2024-01-15T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-15T14:00:00Z",
      nav: 100500,
      cash: 50000,
      equity: 50500,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-16T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });

    const found = await repo.findByDate("PAPER", "2024-01-15");
    expect(found).not.toBeNull();
    // Should return the latest snapshot for that date (14:00)
    expect(found!.nav).toBe(100500);
  });

  test("returns null for date with no snapshots", async () => {
    await repo.create({
      timestamp: "2024-01-15T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });

    const found = await repo.findByDate("PAPER", "2024-01-16");
    expect(found).toBeNull();
  });

  test("gets first snapshot", async () => {
    await repo.create({
      timestamp: "2024-01-02T10:00:00Z",
      nav: 101000,
      cash: 50000,
      equity: 51000,
      environment: "PAPER",
    });
    await repo.create({
      timestamp: "2024-01-01T10:00:00Z",
      nav: 100000,
      cash: 50000,
      equity: 50000,
      environment: "PAPER",
    });

    const first = await repo.getFirst("PAPER");
    expect(first).not.toBeNull();
    expect(first!.nav).toBe(100000);
  });

  test("returns null when no first snapshot exists", async () => {
    const first = await repo.getFirst("PAPER");
    expect(first).toBeNull();
  });
});
