/**
 * Backtest Pipeline Integration Tests
 *
 * Tests the full backtest execution flow with real database using testcontainers.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md (Testing Strategy)
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";
process.env.NODE_ENV = "test";

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BacktestsRepository,
  createInMemoryClient,
  runMigrations,
  type TursoClient,
} from "@cream/storage";
import {
  type BacktestConfig,
  type BroadcastFn,
  type CompletedEvent,
  type EquityEvent,
  type ErrorEvent,
  executeBacktest,
  handleEvent,
  type ProgressEvent,
  type TradeEvent,
} from "../../src/services/backtest-executor";

// ============================================
// Test Setup
// ============================================

let client: TursoClient;
let repo: BacktestsRepository;
let seedCounter = 0;

function generateBacktestId(): string {
  return `bt_test_${++seedCounter}_${Date.now()}`;
}

// ============================================
// Test Suite
// ============================================

describe("Backtest Pipeline Integration", () => {
  beforeAll(async () => {
    // Create fresh in-memory database
    client = await createInMemoryClient();
    await runMigrations(client, { logger: () => {} });
    repo = new BacktestsRepository(client);
  });

  afterAll(() => {
    client.close();
  });

  // ============================================
  // Repository Operations
  // ============================================

  describe("BacktestsRepository", () => {
    beforeEach(async () => {
      // Fresh database for each test
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      repo = new BacktestsRepository(client);
    });

    it("creates backtest with pending status", async () => {
      const id = generateBacktestId();
      const backtest = await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
        universe: ["AAPL", "MSFT"],
        config: { slippageBps: 5 },
      });

      expect(backtest.id).toBe(id);
      expect(backtest.name).toBe("Test Backtest");
      expect(backtest.status).toBe("pending");
      expect(backtest.progressPct).toBe(0);
      expect(backtest.universe).toEqual(["AAPL", "MSFT"]);
    });

    it("starts backtest and updates status to running", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      const started = await repo.start(id);

      expect(started.status).toBe("running");
      expect(started.startedAt).not.toBeNull();
      expect(started.progressPct).toBe(0);
    });

    it("updates progress correctly", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      await repo.updateProgress(id, 50);
      const backtest = await repo.findById(id);

      expect(backtest?.progressPct).toBe(50);
    });

    it("clamps progress to valid range", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      await repo.updateProgress(id, 150); // Over 100
      let backtest = await repo.findById(id);
      expect(backtest?.progressPct).toBe(100);

      await repo.updateProgress(id, -10); // Negative
      backtest = await repo.findById(id);
      expect(backtest?.progressPct).toBe(0);
    });

    it("completes backtest with metrics", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      const completed = await repo.complete(id, {
        totalReturn: 0.155,
        sharpeRatio: 1.25,
        sortinoRatio: 1.8,
        maxDrawdown: 0.082,
        winRate: 0.55,
        profitFactor: 1.5,
        totalTrades: 50,
        additionalMetrics: { startValue: 100000, endValue: 115500 },
      });

      expect(completed.status).toBe("completed");
      expect(completed.progressPct).toBe(100);
      expect(completed.completedAt).not.toBeNull();
      expect(completed.totalReturn).toBe(0.155);
      expect(completed.sharpeRatio).toBe(1.25);
      expect(completed.totalTrades).toBe(50);
    });

    it("fails backtest with error message", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      const failed = await repo.fail(id, "Data file not found");

      expect(failed.status).toBe("failed");
      expect(failed.errorMessage).toBe("Data file not found");
      expect(failed.completedAt).not.toBeNull();
    });

    it("adds and retrieves trades", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      await repo.addTrade(id, {
        timestamp: "2023-06-15T10:00:00Z",
        symbol: "AAPL",
        action: "BUY",
        quantity: 100,
        price: 150.0,
        commission: 0,
        pnl: null,
        pnlPct: null,
        decisionRationale: "Bullish signal",
      });

      await repo.addTrade(id, {
        timestamp: "2023-06-20T14:00:00Z",
        symbol: "AAPL",
        action: "SELL",
        quantity: 100,
        price: 160.0,
        commission: 0,
        pnl: 1000.0,
        pnlPct: 6.67,
        decisionRationale: "Take profit",
      });

      const trades = await repo.getTrades(id);

      expect(trades.length).toBe(2);
      expect(trades[0]!.symbol).toBe("AAPL");
      expect(trades[0]!.action).toBe("BUY");
      expect(trades[1]!.pnl).toBe(1000.0);
    });

    it("adds and retrieves equity curve", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      await repo.addEquityPoint(id, {
        timestamp: "2023-01-01T00:00:00Z",
        nav: 100000,
        cash: 100000,
        equity: 0,
        drawdown: null,
        drawdownPct: 0,
        dayReturnPct: 0,
        cumulativeReturnPct: 0,
      });

      await repo.addEquityPoint(id, {
        timestamp: "2023-01-02T00:00:00Z",
        nav: 101000,
        cash: 50000,
        equity: 51000,
        drawdown: null,
        drawdownPct: 0,
        dayReturnPct: 1.0,
        cumulativeReturnPct: 1.0,
      });

      const equity = await repo.getEquityCurve(id);

      expect(equity.length).toBe(2);
      expect(equity[0]!.nav).toBe(100000);
      expect(equity[1]!.nav).toBe(101000);
      expect(equity[1]!.dayReturnPct).toBe(1.0);
    });

    it("deletes backtest successfully", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      await repo.addTrade(id, {
        timestamp: "2023-06-15T10:00:00Z",
        symbol: "AAPL",
        action: "BUY",
        quantity: 100,
        price: 150.0,
        commission: 0,
        pnl: null,
        pnlPct: null,
        decisionRationale: null,
      });

      const deleted = await repo.delete(id);

      expect(deleted).toBe(true);
      expect(await repo.findById(id)).toBeNull();
      // Note: CASCADE delete behavior depends on DB schema
      // Trades may need to be cleaned up separately if not using CASCADE
    });
  });

  // ============================================
  // Event Handling
  // ============================================

  describe("handleEvent", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      repo = new BacktestsRepository(client);
    });

    it("handles progress event", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      const broadcastSpy = mock(() => {});

      const event: ProgressEvent = {
        type: "progress",
        pct: 45,
        phase: "loading_data",
      };

      await handleEvent(id, event, repo, broadcastSpy);

      const backtest = await repo.findById(id);
      expect(backtest?.progressPct).toBe(45);

      expect(broadcastSpy).toHaveBeenCalledTimes(1);
      expect(broadcastSpy).toHaveBeenCalledWith(id, {
        type: "backtest:progress",
        payload: { progressPct: 45, phase: "loading_data" },
      });
    });

    it("handles trade event", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      const broadcastSpy = mock(() => {});

      const event: TradeEvent = {
        type: "trade",
        timestamp: "2023-06-15T10:00:00Z",
        symbol: "AAPL",
        action: "BUY",
        quantity: 100,
        entryPrice: 150.0,
        exitPrice: 0,
        pnl: 0,
      };

      await handleEvent(id, event, repo, broadcastSpy);

      const trades = await repo.getTrades(id);
      expect(trades.length).toBe(1);
      expect(trades[0]!.symbol).toBe("AAPL");

      expect(broadcastSpy).toHaveBeenCalledTimes(1);
    });

    it("handles equity event without broadcasting", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      const broadcastSpy = mock(() => {});

      const event: EquityEvent = {
        type: "equity",
        timestamp: "2023-06-15T10:00:00Z",
        nav: 101000,
        drawdownPct: 0.5,
      };

      await handleEvent(id, event, repo, broadcastSpy);

      const equity = await repo.getEquityCurve(id);
      expect(equity.length).toBe(1);
      expect(equity[0]!.nav).toBe(101000);

      // Equity events don't broadcast (too many events)
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("handles completed event", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      const broadcastSpy = mock(() => {});

      const event: CompletedEvent = {
        type: "completed",
        metrics: {
          totalReturn: 0.15,
          sharpeRatio: 1.2,
          sortinoRatio: 1.5,
          maxDrawdown: 0.08,
          winRate: 0.55,
          profitFactor: 1.4,
          totalTrades: 25,
          totalFeesPaid: 50,
          startValue: 100000,
          endValue: 115000,
        },
      };

      await handleEvent(id, event, repo, broadcastSpy);

      const backtest = await repo.findById(id);
      expect(backtest?.status).toBe("completed");
      expect(backtest?.totalReturn).toBe(0.15);
      expect(backtest?.sharpeRatio).toBe(1.2);

      expect(broadcastSpy).toHaveBeenCalledTimes(1);
      expect(broadcastSpy).toHaveBeenCalledWith(id, {
        type: "backtest:completed",
        payload: event.metrics,
      });
    });

    it("handles error event", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Test",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });
      await repo.start(id);

      const broadcastSpy = mock(() => {});

      const event: ErrorEvent = {
        type: "error",
        message: "File not found: /tmp/data.parquet",
      };

      await handleEvent(id, event, repo, broadcastSpy);

      const backtest = await repo.findById(id);
      expect(backtest?.status).toBe("failed");
      expect(backtest?.errorMessage).toBe("File not found: /tmp/data.parquet");

      expect(broadcastSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Executor with Mock Subprocess
  // ============================================

  describe("executeBacktest with mocked subprocess", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      repo = new BacktestsRepository(client);
    });

    it("executes backtest successfully with mocked subprocess", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Mock Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      const config: BacktestConfig = {
        backtestId: id,
        dataPath: "/tmp/mock_data.parquet",
        signalsPath: "/tmp/mock_signals.parquet",
        initialCapital: 100000,
        slippageBps: 5,
      };

      // Create mock stream that emits JSON events
      const mockEvents = [
        JSON.stringify({ type: "progress", pct: 10, phase: "loading_data" }),
        JSON.stringify({ type: "progress", pct: 50, phase: "running_simulation" }),
        JSON.stringify({
          type: "trade",
          timestamp: "2023-06-15",
          symbol: "AAPL",
          action: "BUY",
          quantity: 100,
          entryPrice: 150,
          exitPrice: 160,
          pnl: 1000,
        }),
        JSON.stringify({
          type: "completed",
          metrics: {
            totalReturn: 0.1,
            sharpeRatio: 1.0,
            sortinoRatio: 1.2,
            maxDrawdown: 0.05,
            winRate: 0.6,
            profitFactor: 1.3,
            totalTrades: 10,
          },
        }),
      ];

      // Create a ReadableStream that emits mock events
      const mockStdout = new ReadableStream({
        start(controller) {
          for (const event of mockEvents) {
            controller.enqueue(new TextEncoder().encode(`${event}\n`));
          }
          controller.close();
        },
      });

      // Mock Bun.spawn
      const originalSpawn = Bun.spawn;
      Bun.spawn = mock(() => ({
        stdout: mockStdout,
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        exited: Promise.resolve(0),
        kill: () => {},
      })) as typeof Bun.spawn;

      const broadcasts: Array<{ id: string; message: unknown }> = [];
      const broadcastFn: BroadcastFn = (backtestId, message) => {
        broadcasts.push({ id: backtestId, message });
      };

      try {
        await executeBacktest(config, repo, broadcastFn);
      } finally {
        Bun.spawn = originalSpawn;
      }

      // Verify backtest completed
      const backtest = await repo.findById(id);
      expect(backtest?.status).toBe("completed");
      expect(backtest?.totalReturn).toBe(0.1);
      expect(backtest?.totalTrades).toBe(10);

      // Verify trades were added
      const trades = await repo.getTrades(id);
      expect(trades.length).toBe(1);
      expect(trades[0]!.symbol).toBe("AAPL");

      // Verify broadcasts were sent
      expect(broadcasts.length).toBeGreaterThan(0);
      expect(
        broadcasts.some((b) => (b.message as { type: string }).type === "backtest:started")
      ).toBe(true);
      expect(
        broadcasts.some((b) => (b.message as { type: string }).type === "backtest:completed")
      ).toBe(true);
    });

    it("handles subprocess failure", async () => {
      const id = generateBacktestId();
      await repo.create({
        id,
        name: "Failed Backtest",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        initialCapital: 100000,
      });

      const config: BacktestConfig = {
        backtestId: id,
        dataPath: "/tmp/nonexistent.parquet",
        signalsPath: "/tmp/mock_signals.parquet",
        initialCapital: 100000,
        slippageBps: 5,
      };

      // Mock subprocess that fails
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${JSON.stringify({ type: "error", message: "Data file not found" })}\n`
            )
          );
          controller.close();
        },
      });

      const originalSpawn = Bun.spawn;
      Bun.spawn = mock(() => ({
        stdout: mockStdout,
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Error: Data file not found\n"));
            controller.close();
          },
        }),
        exited: Promise.resolve(1), // Non-zero exit
        kill: () => {},
      })) as typeof Bun.spawn;

      const broadcasts: Array<{ id: string; message: unknown }> = [];
      const broadcastFn: BroadcastFn = (backtestId, message) => {
        broadcasts.push({ id: backtestId, message });
      };

      try {
        await expect(executeBacktest(config, repo, broadcastFn)).rejects.toThrow();
      } finally {
        Bun.spawn = originalSpawn;
      }

      // Verify backtest failed
      const backtest = await repo.findById(id);
      expect(backtest?.status).toBe("failed");

      // Verify error broadcast was sent
      expect(
        broadcasts.some((b) => (b.message as { type: string }).type === "backtest:error")
      ).toBe(true);
    });
  });

  // ============================================
  // Full Pipeline Scenarios
  // ============================================

  describe("Full Pipeline Scenarios", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      repo = new BacktestsRepository(client);
    });

    it("simulates complete backtest lifecycle", async () => {
      const id = generateBacktestId();

      // 1. Create backtest
      const created = await repo.create({
        id,
        name: "Lifecycle Test",
        description: "Testing complete lifecycle",
        startDate: "2023-01-01",
        endDate: "2023-06-30",
        initialCapital: 50000,
        universe: ["AAPL", "GOOGL"],
        config: { slippageBps: 10, strategy: "momentum" },
        createdBy: "test-user",
      });
      expect(created.status).toBe("pending");

      // 2. Start backtest
      const started = await repo.start(id);
      expect(started.status).toBe("running");

      // 3. Simulate progress updates
      await repo.updateProgress(id, 25);
      await repo.updateProgress(id, 50);
      await repo.updateProgress(id, 75);

      // 4. Add trades
      await repo.addTrade(id, {
        timestamp: "2023-02-01T10:00:00Z",
        symbol: "AAPL",
        action: "BUY",
        quantity: 100,
        price: 145.0,
        commission: 1.0,
        pnl: null,
        pnlPct: null,
        decisionRationale: "Momentum signal triggered",
      });

      await repo.addTrade(id, {
        timestamp: "2023-03-01T14:00:00Z",
        symbol: "AAPL",
        action: "SELL",
        quantity: 100,
        price: 155.0,
        commission: 1.0,
        pnl: 998.0, // (155-145)*100 - 2 commission
        pnlPct: 6.88,
        decisionRationale: "Take profit triggered",
      });

      // 5. Add equity points
      for (let month = 1; month <= 6; month++) {
        await repo.addEquityPoint(id, {
          timestamp: `2023-0${month}-01T00:00:00Z`,
          nav: 50000 + month * 500,
          cash: 50000,
          equity: month * 500,
          drawdown: null,
          drawdownPct: month === 3 ? 2.5 : 0, // Simulated drawdown in March
          dayReturnPct: 1.0,
          cumulativeReturnPct: month,
        });
      }

      // 6. Complete backtest
      const completed = await repo.complete(id, {
        totalReturn: 0.06, // 6%
        sharpeRatio: 1.1,
        sortinoRatio: 1.4,
        maxDrawdown: 0.025,
        winRate: 0.65,
        profitFactor: 1.8,
        totalTrades: 2,
        avgTradePnl: 499,
      });

      expect(completed.status).toBe("completed");
      expect(completed.totalReturn).toBe(0.06);

      // 7. Verify all data
      const trades = await repo.getTrades(id);
      expect(trades.length).toBe(2);

      const equity = await repo.getEquityCurve(id);
      expect(equity.length).toBe(6);

      // 8. Verify find operations
      const recentBacktests = await repo.findRecent(5);
      expect(recentBacktests.some((b) => b.id === id)).toBe(true);
    });

    it("handles concurrent backtests", async () => {
      const ids = [generateBacktestId(), generateBacktestId(), generateBacktestId()];

      // Create multiple backtests
      await Promise.all(
        ids.map((id, i) =>
          repo.create({
            id,
            name: `Concurrent Test ${i + 1}`,
            startDate: "2023-01-01",
            endDate: "2023-12-31",
            initialCapital: 100000,
          })
        )
      );

      // Start all
      await Promise.all(ids.map((id) => repo.start(id)));

      // Update progress concurrently
      await Promise.all(ids.map((id, i) => repo.updateProgress(id, (i + 1) * 25)));

      // Complete some, fail others
      await repo.complete(ids[0]!, { totalReturn: 0.1, sharpeRatio: 1.0 });
      await repo.complete(ids[1]!, { totalReturn: 0.15, sharpeRatio: 1.5 });
      await repo.fail(ids[2]!, "Simulated failure");

      // Verify states
      const results = await Promise.all(ids.map((id) => repo.findById(id)));
      expect(results[0]?.status).toBe("completed");
      expect(results[1]?.status).toBe("completed");
      expect(results[2]?.status).toBe("failed");
    });
  });
});
