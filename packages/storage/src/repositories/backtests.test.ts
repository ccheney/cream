/**
 * Backtests Repository Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { BacktestsRepository, type CreateBacktestInput } from "./backtests.js";
import { RepositoryError } from "./base.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS backtests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      initial_capital REAL NOT NULL,
      universe TEXT NOT NULL DEFAULT '[]',
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
      progress_pct REAL NOT NULL DEFAULT 0,
      total_return REAL,
      cagr REAL,
      sharpe_ratio REAL,
      sortino_ratio REAL,
      calmar_ratio REAL,
      max_drawdown REAL,
      win_rate REAL,
      profit_factor REAL,
      total_trades INTEGER,
      avg_trade_pnl REAL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT
    )
  `);

	await client.run(`
    CREATE TABLE IF NOT EXISTS backtest_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id TEXT NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'SHORT', 'COVER')),
      qty REAL NOT NULL,
      price REAL NOT NULL,
      commission REAL NOT NULL DEFAULT 0,
      pnl REAL,
      pnl_pct REAL,
      decision_rationale TEXT
    )
  `);

	await client.run(`
    CREATE TABLE IF NOT EXISTS backtest_equity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id TEXT NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      nav REAL NOT NULL,
      cash REAL NOT NULL,
      equity REAL NOT NULL,
      drawdown REAL,
      drawdown_pct REAL,
      day_return_pct REAL,
      cumulative_return_pct REAL
    )
  `);
}

describe("BacktestsRepository", () => {
	let client: TursoClient;
	let repo: BacktestsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new BacktestsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	// ========================================
	// Backtest CRUD
	// ========================================

	test("creates a backtest", async () => {
		const input: CreateBacktestInput = {
			id: "bt-001",
			name: "Test Backtest",
			description: "A test backtest",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
			universe: ["AAPL", "MSFT", "GOOGL"],
			config: { maxPositions: 10, riskLimit: 0.02 },
			createdBy: "admin",
		};

		const result = await repo.create(input);

		expect(result.id).toBe("bt-001");
		expect(result.name).toBe("Test Backtest");
		expect(result.description).toBe("A test backtest");
		expect(result.startDate).toBe("2023-01-01");
		expect(result.endDate).toBe("2023-12-31");
		expect(result.initialCapital).toBe(100000);
		expect(result.universe).toEqual(["AAPL", "MSFT", "GOOGL"]);
		expect(result.config).toEqual({ maxPositions: 10, riskLimit: 0.02 });
		expect(result.status).toBe("pending");
		expect(result.progressPct).toBe(0);
		expect(result.createdBy).toBe("admin");
	});

	test("creates backtest with minimal input", async () => {
		const result = await repo.create({
			id: "bt-minimal",
			name: "Minimal Backtest",
			startDate: "2023-01-01",
			endDate: "2023-06-30",
			initialCapital: 50000,
		});

		expect(result.description).toBeNull();
		expect(result.universe).toEqual([]);
		expect(result.config).toEqual({});
		expect(result.createdBy).toBeNull();
	});

	test("finds backtest by ID", async () => {
		await repo.create({
			id: "bt-find",
			name: "Find Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		const found = await repo.findById("bt-find");
		expect(found).not.toBeNull();
		expect(found!.name).toBe("Find Test");
	});

	test("returns null for non-existent ID", async () => {
		const found = await repo.findById("nonexistent");
		expect(found).toBeNull();
	});

	test("findByIdOrThrow throws for non-existent ID", async () => {
		await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
	});

	test("finds many backtests with status filter", async () => {
		await repo.create({
			id: "bt-1",
			name: "BT 1",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-2",
			name: "BT 2",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-3",
			name: "BT 3",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.start("bt-2");

		const pending = await repo.findMany("pending");
		expect(pending.data).toHaveLength(2);
		expect(pending.total).toBe(2);

		const running = await repo.findMany("running");
		expect(running.data).toHaveLength(1);
		expect(running.data[0]!.id).toBe("bt-2");
	});

	test("finds many backtests with array status filter", async () => {
		await repo.create({
			id: "bt-a",
			name: "BT A",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-b",
			name: "BT B",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.start("bt-a");
		await repo.fail("bt-b", "Test failure");

		const result = await repo.findMany(["running", "failed"]);
		expect(result.data).toHaveLength(2);
	});

	test("finds recent backtests", async () => {
		for (let i = 0; i < 5; i++) {
			await repo.create({
				id: `bt-recent-${i}`,
				name: `BT ${i}`,
				startDate: "2023-01-01",
				endDate: "2023-12-31",
				initialCapital: 100000,
			});
		}

		const recent = await repo.findRecent(3);
		expect(recent).toHaveLength(3);
	});

	// ========================================
	// Backtest Lifecycle
	// ========================================

	test("starts a backtest", async () => {
		await repo.create({
			id: "bt-start",
			name: "Start Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		const started = await repo.start("bt-start");

		expect(started.status).toBe("running");
		expect(started.startedAt).not.toBeNull();
		expect(started.progressPct).toBe(0);
	});

	test("start throws for non-existent backtest", async () => {
		await expect(repo.start("nonexistent")).rejects.toThrow(RepositoryError);
	});

	test("updates backtest progress", async () => {
		await repo.create({
			id: "bt-progress",
			name: "Progress Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.start("bt-progress");

		await repo.updateProgress("bt-progress", 50);
		let bt = await repo.findById("bt-progress");
		expect(bt!.progressPct).toBe(50);

		await repo.updateProgress("bt-progress", 75);
		bt = await repo.findById("bt-progress");
		expect(bt!.progressPct).toBe(75);
	});

	test("updateProgress clamps value to 0-100", async () => {
		await repo.create({
			id: "bt-clamp",
			name: "Clamp Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.updateProgress("bt-clamp", -10);
		let bt = await repo.findById("bt-clamp");
		expect(bt!.progressPct).toBe(0);

		await repo.updateProgress("bt-clamp", 150);
		bt = await repo.findById("bt-clamp");
		expect(bt!.progressPct).toBe(100);
	});

	test("completes a backtest with metrics", async () => {
		await repo.create({
			id: "bt-complete",
			name: "Complete Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.start("bt-complete");

		const completed = await repo.complete("bt-complete", {
			totalReturn: 15000,
			cagr: 15.5,
			sharpeRatio: 1.8,
			sortinoRatio: 2.2,
			calmarRatio: 1.5,
			maxDrawdown: -10.5,
			winRate: 55.0,
			profitFactor: 1.6,
			totalTrades: 120,
			avgTradePnl: 125.0,
			additionalMetrics: { customMetric: 42 },
		});

		expect(completed.status).toBe("completed");
		expect(completed.progressPct).toBe(100);
		expect(completed.completedAt).not.toBeNull();
		expect(completed.totalReturn).toBe(15000);
		expect(completed.cagr).toBe(15.5);
		expect(completed.sharpeRatio).toBe(1.8);
		expect(completed.sortinoRatio).toBe(2.2);
		expect(completed.calmarRatio).toBe(1.5);
		expect(completed.maxDrawdown).toBe(-10.5);
		expect(completed.winRate).toBe(55.0);
		expect(completed.profitFactor).toBe(1.6);
		expect(completed.totalTrades).toBe(120);
		expect(completed.avgTradePnl).toBe(125.0);
		expect(completed.metrics).toEqual({ customMetric: 42 });
	});

	test("fails a backtest", async () => {
		await repo.create({
			id: "bt-fail",
			name: "Fail Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.start("bt-fail");

		const failed = await repo.fail("bt-fail", "Data provider error");

		expect(failed.status).toBe("failed");
		expect(failed.completedAt).not.toBeNull();
		expect(failed.errorMessage).toBe("Data provider error");
	});

	test("cancels a backtest", async () => {
		await repo.create({
			id: "bt-cancel",
			name: "Cancel Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.start("bt-cancel");

		const cancelled = await repo.cancel("bt-cancel");

		expect(cancelled.status).toBe("cancelled");
	});

	test("deletes a backtest", async () => {
		await repo.create({
			id: "bt-delete",
			name: "Delete Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		const deleted = await repo.delete("bt-delete");
		expect(deleted).toBe(true);

		const found = await repo.findById("bt-delete");
		expect(found).toBeNull();
	});

	test("delete returns false for non-existent ID", async () => {
		const deleted = await repo.delete("nonexistent");
		expect(deleted).toBe(false);
	});

	// ========================================
	// Backtest Trades
	// ========================================

	test("adds trade to backtest", async () => {
		await repo.create({
			id: "bt-trade",
			name: "Trade Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		const trade = await repo.addTrade("bt-trade", {
			timestamp: "2023-03-15T10:30:00Z",
			symbol: "AAPL",
			action: "BUY",
			quantity: 100,
			price: 150.5,
			commission: 1.0,
			pnl: null,
			pnlPct: null,
			decisionRationale: "Bullish momentum signal",
		});

		expect(trade.id).toBeDefined();
		expect(trade.backtestId).toBe("bt-trade");
		expect(trade.symbol).toBe("AAPL");
		expect(trade.action).toBe("BUY");
		expect(trade.quantity).toBe(100);
		expect(trade.price).toBe(150.5);
		expect(trade.commission).toBe(1.0);
		expect(trade.decisionRationale).toBe("Bullish momentum signal");
	});

	test("gets trades for backtest", async () => {
		await repo.create({
			id: "bt-trades",
			name: "Trades Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.addTrade("bt-trades", {
			timestamp: "2023-03-15T10:30:00Z",
			symbol: "AAPL",
			action: "BUY",
			quantity: 100,
			price: 150.5,
			commission: 1.0,
			pnl: null,
			pnlPct: null,
			decisionRationale: null,
		});

		await repo.addTrade("bt-trades", {
			timestamp: "2023-03-20T14:00:00Z",
			symbol: "AAPL",
			action: "SELL",
			quantity: 100,
			price: 160.0,
			commission: 1.0,
			pnl: 948.0,
			pnlPct: 6.31,
			decisionRationale: "Take profit",
		});

		const trades = await repo.getTrades("bt-trades");
		expect(trades).toHaveLength(2);
		expect(trades[0]!.action).toBe("BUY");
		expect(trades[1]!.action).toBe("SELL");
		expect(trades[1]!.pnl).toBe(948.0);
	});

	test("handles all trade actions", async () => {
		await repo.create({
			id: "bt-actions",
			name: "Actions Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		const actions = ["BUY", "SELL", "SHORT", "COVER"] as const;
		for (const action of actions) {
			await repo.addTrade("bt-actions", {
				timestamp: "2023-03-15T10:30:00Z",
				symbol: `TEST_${action}`,
				action,
				quantity: 100,
				price: 100,
				commission: 0,
				pnl: null,
				pnlPct: null,
				decisionRationale: null,
			});
		}

		const trades = await repo.getTrades("bt-actions");
		expect(trades).toHaveLength(4);
		for (const action of actions) {
			expect(trades.some((t) => t.action === action)).toBe(true);
		}
	});

	// ========================================
	// Backtest Equity
	// ========================================

	test("adds equity point to backtest", async () => {
		await repo.create({
			id: "bt-equity",
			name: "Equity Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.addEquityPoint("bt-equity", {
			timestamp: "2023-01-02T16:00:00Z",
			nav: 100500,
			cash: 50000,
			equity: 50500,
			drawdown: null,
			drawdownPct: null,
			dayReturnPct: 0.5,
			cumulativeReturnPct: 0.5,
		});

		const curve = await repo.getEquityCurve("bt-equity");
		expect(curve).toHaveLength(1);
		expect(curve[0]!.nav).toBe(100500);
		expect(curve[0]!.dayReturnPct).toBe(0.5);
	});

	test("gets equity curve for backtest", async () => {
		await repo.create({
			id: "bt-curve",
			name: "Curve Test",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		for (let i = 0; i < 5; i++) {
			await repo.addEquityPoint("bt-curve", {
				timestamp: `2023-01-${String(i + 2).padStart(2, "0")}T16:00:00Z`,
				nav: 100000 + i * 500,
				cash: 50000,
				equity: 50000 + i * 500,
				drawdown: null,
				drawdownPct: null,
				dayReturnPct: 0.5,
				cumulativeReturnPct: 0.5 * (i + 1),
			});
		}

		const curve = await repo.getEquityCurve("bt-curve");
		expect(curve).toHaveLength(5);
		expect(curve[0]!.timestamp).toBe("2023-01-02T16:00:00Z");
		expect(curve[4]!.timestamp).toBe("2023-01-06T16:00:00Z");
		expect(curve[0]!.nav).toBe(100000);
		expect(curve[4]!.nav).toBe(102000);
	});

	test("returns empty equity curve for non-existent backtest", async () => {
		const curve = await repo.getEquityCurve("nonexistent");
		expect(curve).toHaveLength(0);
	});

	// ========================================
	// Edge Cases
	// ========================================

	test("handles complex config objects", async () => {
		const complexConfig = {
			agents: {
				techAnalyst: { enabled: true, weight: 0.3 },
				riskManager: { maxDrawdown: 0.1 },
			},
			universe: {
				type: "index",
				source: "SP500",
			},
			trading: {
				slippage: 0.001,
				commission: { fixed: 1.0, pct: 0.0001 },
			},
		};

		await repo.create({
			id: "bt-complex",
			name: "Complex Config",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
			config: complexConfig,
		});

		const found = await repo.findById("bt-complex");
		expect(found!.config).toEqual(complexConfig);
	});

	test("handles all backtest statuses", async () => {
		const statuses = ["pending", "running", "completed", "failed", "cancelled"] as const;

		await repo.create({
			id: "bt-pending",
			name: "Pending",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-running",
			name: "Running",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-completed",
			name: "Completed",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-failed",
			name: "Failed",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});
		await repo.create({
			id: "bt-cancelled",
			name: "Cancelled",
			startDate: "2023-01-01",
			endDate: "2023-12-31",
			initialCapital: 100000,
		});

		await repo.start("bt-running");
		await repo.start("bt-completed");
		await repo.complete("bt-completed", { totalReturn: 1000 });
		await repo.start("bt-failed");
		await repo.fail("bt-failed", "Error");
		await repo.start("bt-cancelled");
		await repo.cancel("bt-cancelled");

		for (const status of statuses) {
			const result = await repo.findMany(status);
			expect(result.data).toHaveLength(1);
			expect(result.data[0]!.status).toBe(status);
		}
	});
});
