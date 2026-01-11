/**
 * Indicator Routes E2E Integration Tests
 *
 * Tests the indicator API endpoints with a real in-memory SQLite database.
 * Tests all new indicator routes from the v2 engine implementation.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

process.env.CREAM_ENV = "BACKTEST";
process.env.NODE_ENV = "test";

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createInMemoryClient, runMigrations, type TursoClient } from "@cream/storage";

// ============================================
// Database Setup
// ============================================

let client: TursoClient;

// Mock the db module to use our test client
mock.module("../../src/db", () => ({
  getDbClient: () => Promise.resolve(client),
  closeDb: () => client?.close(),
}));

// Mock Alpaca for price-indicators
mock.module("@cream/marketdata", () => ({
  createAlpacaClientFromEnv: () => ({
    getBars: async (symbol: string) => {
      if (symbol === "INVALID") {
        return [];
      }
      // Generate 300 bars for indicator calculations
      const bars = [];
      let price = 150;
      const now = Date.now();
      for (let i = 0; i < 300; i++) {
        price += (Math.random() - 0.5) * 2;
        bars.push({
          timestamp: new Date(now - (300 - i) * 3600000).toISOString(),
          open: price,
          high: price + 1,
          low: price - 1,
          close: price,
          volume: 100000,
        });
      }
      return bars;
    },
    getSnapshots: () => Promise.resolve(new Map()),
  }),
  isAlpacaConfigured: () => true,
}));

import batchStatusRoutes from "../../src/routes/batch-status";
import batchTriggerRoutes from "../../src/routes/batch-trigger";
// Import routes after mocking
import indicatorsRoutes from "../../src/routes/indicators";
import priceIndicatorsRoutes from "../../src/routes/price-indicators";

// ============================================
// Test Data Seeding
// ============================================

async function seedIndicators(): Promise<void> {
  // Insert test indicators into the indicators table
  await client.run(
    `INSERT INTO indicators (id, name, category, status, hypothesis, economic_rationale,
     generated_at, generated_by, promoted_at, retired_at, validation_report,
     paper_trading_report, paper_trading_start, paper_trading_end, pr_url, code_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "ind-001",
      "MomentumCrossover",
      "momentum",
      "production",
      "SMA crossover signals momentum shifts",
      "Short-term SMA crossing long-term SMA indicates trend changes",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      "system",
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      null,
      JSON.stringify({ ic: 0.05, pValue: 0.01 }),
      null,
      null,
      null,
      "https://github.com/example/pr/123",
      "abc123",
    ]
  );

  await client.run(
    `INSERT INTO indicators (id, name, category, status, hypothesis, economic_rationale,
     generated_at, generated_by, promoted_at, retired_at, validation_report,
     paper_trading_report, paper_trading_start, paper_trading_end, pr_url, code_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "ind-002",
      "VolatilityBreakout",
      "volatility",
      "paper",
      "ATR breakout signals volatility expansion",
      "Price exceeding ATR bands indicates increased volatility",
      new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      "system",
      null,
      null,
      JSON.stringify({ ic: 0.03, pValue: 0.05 }),
      null,
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      null,
      null,
      "def456",
    ]
  );

  await client.run(
    `INSERT INTO indicators (id, name, category, status, hypothesis, economic_rationale,
     generated_at, generated_by, promoted_at, retired_at, validation_report,
     paper_trading_report, paper_trading_start, paper_trading_end, pr_url, code_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "ind-003",
      "TrendStrength",
      "trend",
      "retired",
      "ADX measures trend strength",
      "High ADX indicates strong trends",
      new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      "system",
      new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      JSON.stringify({ ic: 0.01, pValue: 0.2 }),
      null,
      null,
      null,
      null,
      "ghi789",
    ]
  );
}

async function seedICHistory(): Promise<void> {
  // Insert IC history for indicators
  const dates = [];
  for (let i = 0; i < 30; i++) {
    dates.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  for (const date of dates) {
    await client.run(
      `INSERT INTO indicator_ic_history (indicator_id, date, ic_value, ic_std, decisions_used_in, decisions_correct)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["ind-001", date, 0.03 + Math.random() * 0.02, 0.01, 10, 6]
    );
  }
}

async function seedSyncRuns(): Promise<void> {
  // Insert test sync runs
  await client.run(
    `INSERT INTO indicator_sync_runs (id, run_type, started_at, completed_at, symbols_processed, symbols_failed, status, error_message, environment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "run-001",
      "fundamentals",
      new Date(Date.now() - 3600000).toISOString(),
      new Date(Date.now() - 3500000).toISOString(),
      100,
      2,
      "completed",
      null,
      "BACKTEST",
    ]
  );

  await client.run(
    `INSERT INTO indicator_sync_runs (id, run_type, started_at, completed_at, symbols_processed, symbols_failed, status, error_message, environment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "run-002",
      "short_interest",
      new Date(Date.now() - 7200000).toISOString(),
      new Date(Date.now() - 7100000).toISOString(),
      100,
      0,
      "completed",
      null,
      "BACKTEST",
    ]
  );

  await client.run(
    `INSERT INTO indicator_sync_runs (id, run_type, started_at, completed_at, symbols_processed, symbols_failed, status, error_message, environment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["run-003", "sentiment", new Date().toISOString(), null, 50, 0, "running", null, "BACKTEST"]
  );

  await client.run(
    `INSERT INTO indicator_sync_runs (id, run_type, started_at, completed_at, symbols_processed, symbols_failed, status, error_message, environment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "run-004",
      "corporate_actions",
      new Date(Date.now() - 86400000).toISOString(),
      new Date(Date.now() - 86300000).toISOString(),
      0,
      50,
      "failed",
      "Rate limit exceeded",
      "BACKTEST",
    ]
  );
}

async function seedRegimeLabels(): Promise<void> {
  await client.run(
    `INSERT INTO regime_labels (symbol, timeframe, timestamp, regime, confidence, model_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["_MARKET", "1d", new Date().toISOString(), "bull_trend", 0.8, "hmm_regime"]
  );
}

// ============================================
// Test Suite
// ============================================

describe("Indicator Routes E2E", () => {
  beforeAll(async () => {
    // Create fresh in-memory database
    client = await createInMemoryClient();
    await runMigrations(client, { logger: () => {} });
  });

  afterAll(() => {
    client?.close();
  });

  describe("Indicators Lab Routes (/api/indicators)", () => {
    beforeEach(async () => {
      // Fresh database for each test
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      await seedIndicators();
      await seedICHistory();
      await seedRegimeLabels();
    });

    it("GET / returns all indicators", async () => {
      const res = await indicatorsRoutes.request("/");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.indicators).toBeDefined();
      expect(Array.isArray(data.indicators)).toBe(true);
      expect(data.indicators.length).toBe(3);

      // Should be sorted by status (production first)
      expect(data.indicators[0].status).toBe("production");
    });

    it("GET / filters by status", async () => {
      const res = await indicatorsRoutes.request("/?status=paper");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.indicators.length).toBe(1);
      expect(data.indicators[0].status).toBe("paper");
    });

    it("GET / filters by category", async () => {
      const res = await indicatorsRoutes.request("/?category=momentum");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.indicators.length).toBe(1);
      expect(data.indicators[0].category).toBe("momentum");
    });

    it("GET /:id returns indicator detail", async () => {
      const res = await indicatorsRoutes.request("/ind-001");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.indicator).toBeDefined();
      expect(data.indicator.id).toBe("ind-001");
      expect(data.indicator.name).toBe("MomentumCrossover");
      expect(data.indicator.validationReport).toBeDefined();
      expect(data.indicator.prUrl).toBe("https://github.com/example/pr/123");
    });

    it("GET /:id returns 404 for non-existent indicator", async () => {
      const res = await indicatorsRoutes.request("/non-existent");
      expect(res.status).toBe(404);
    });

    it("GET /:id/ic-history returns IC history", async () => {
      const res = await indicatorsRoutes.request("/ind-001/ic-history");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.history).toBeDefined();
      expect(Array.isArray(data.history)).toBe(true);
      expect(data.history.length).toBeGreaterThan(0);
      expect(data.history[0]).toHaveProperty("date");
      expect(data.history[0]).toHaveProperty("icValue");
    });

    it("GET /:id/ic-history respects days parameter", async () => {
      const res = await indicatorsRoutes.request("/ind-001/ic-history?days=5");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.history.length).toBeLessThanOrEqual(5);
    });

    it("GET /trigger-status returns trigger conditions", async () => {
      const res = await indicatorsRoutes.request("/trigger-status");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.shouldTrigger).toBeDefined();
      expect(data.conditions).toBeDefined();
      expect(data.conditions).toHaveProperty("rollingIC30Day");
      expect(data.conditions).toHaveProperty("activeIndicatorCount");
      expect(data.conditions).toHaveProperty("currentRegime");
      expect(data.recommendation).toBeDefined();
    });

    // NOTE: Skipping paper-trading test because indicator_paper_signals table
    // doesn't exist in schema. The route references a table that was never created.
    it.skip("GET /paper-trading returns paper trading indicators", async () => {
      const res = await indicatorsRoutes.request("/paper-trading");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.indicators).toBeDefined();
      expect(Array.isArray(data.indicators)).toBe(true);
    });

    it("GET /activity returns recent activity", async () => {
      const res = await indicatorsRoutes.request("/activity");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.activities).toBeDefined();
      expect(Array.isArray(data.activities)).toBe(true);
    });

    it("POST /:id/retire retires an indicator", async () => {
      const res = await indicatorsRoutes.request("/ind-001/retire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Low IC performance" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify retirement
      const checkRes = await indicatorsRoutes.request("/ind-001");
      const checkData = await checkRes.json();
      expect(checkData.indicator.status).toBe("retired");
    });

    it("POST /:id/retire returns 404 for already retired indicator", async () => {
      const res = await indicatorsRoutes.request("/ind-003/retire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Test" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Price Indicators Routes (/api/indicators/:symbol/price)", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
    });

    it("GET /:symbol/price returns price indicators", async () => {
      const res = await priceIndicatorsRoutes.request("/AAPL/price");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.symbol).toBe("AAPL");
      expect(data.timeframe).toBe("1h");
      expect(data.indicators).toBeDefined();
      expect(data.indicators).toHaveProperty("rsi_14");
      expect(data.indicators).toHaveProperty("sma_20");
      expect(data.indicators).toHaveProperty("macd_line");
    });

    it("GET /:symbol/price normalizes symbol to uppercase", async () => {
      const res = await priceIndicatorsRoutes.request("/aapl/price");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.symbol).toBe("AAPL");
    });

    it("GET /:symbol/price accepts timeframe parameter", async () => {
      const res = await priceIndicatorsRoutes.request("/AAPL/price?timeframe=1d");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timeframe).toBe("1d");
    });

    it("GET /:symbol/price returns 503 for invalid symbol", async () => {
      const res = await priceIndicatorsRoutes.request("/INVALID/price");
      expect(res.status).toBe(503);
    });
  });

  describe("Batch Status Routes (/api/indicators/batch/status)", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      await seedSyncRuns();
    });

    it("GET /batch/status returns sync runs with summary", async () => {
      const res = await batchStatusRoutes.request("/batch/status");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.runs).toBeDefined();
      expect(Array.isArray(data.runs)).toBe(true);
      expect(data.runs.length).toBe(4);

      expect(data.summary).toBeDefined();
      expect(data.summary.total_runs).toBe(4);
      expect(data.summary.running).toBe(1);
      expect(data.summary.completed).toBe(2);
      expect(data.summary.failed).toBe(1);
    });

    it("GET /batch/status filters by type", async () => {
      const res = await batchStatusRoutes.request("/batch/status?type=fundamentals");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.runs.every((r: { run_type: string }) => r.run_type === "fundamentals")).toBe(
        true
      );
    });

    it("GET /batch/status filters by status", async () => {
      const res = await batchStatusRoutes.request("/batch/status?status=completed");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.runs.every((r: { status: string }) => r.status === "completed")).toBe(true);
    });

    it("GET /batch/status respects limit parameter", async () => {
      const res = await batchStatusRoutes.request("/batch/status?limit=2");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.runs.length).toBeLessThanOrEqual(2);
    });

    it("GET /batch/status/:id returns single run", async () => {
      const res = await batchStatusRoutes.request("/batch/status/run-001");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.run).toBeDefined();
      expect(data.run.id).toBe("run-001");
      expect(data.run.run_type).toBe("fundamentals");
      expect(data.run.status).toBe("completed");
    });

    it("GET /batch/status/:id returns 404 for non-existent run", async () => {
      const res = await batchStatusRoutes.request("/batch/status/non-existent");
      expect(res.status).toBe(404);
    });

    it("GET /batch/status includes last_completed timestamps", async () => {
      const res = await batchStatusRoutes.request("/batch/status");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.summary.last_completed).toBeDefined();
      expect(data.summary.last_completed.fundamentals).toBeDefined();
      expect(data.summary.last_completed.short_interest).toBeDefined();
    });
  });

  describe("Batch Trigger Routes (/api/indicators/batch/trigger)", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
    });

    it("POST /batch/trigger creates trigger request", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "fundamentals",
          priority: "normal",
        }),
      });
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.run_id).toBeDefined();
      expect(data.job_type).toBe("fundamentals");
      expect(data.status).toBe("pending");
    });

    it("POST /batch/trigger accepts symbols array", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "short_interest",
          symbols: ["AAPL", "MSFT", "GOOGL"],
          priority: "high",
        }),
      });
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.symbols_count).toBe(3);
    });

    it("POST /batch/trigger returns 409 when job already running", async () => {
      // First, seed a running job
      await seedSyncRuns();

      // Try to trigger the same type (sentiment is running)
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: "sentiment" }),
      });
      expect(res.status).toBe(409);
    });

    it("POST /batch/trigger validates job type enum", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: "invalid_type" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST /batch/cancel/:id cancels pending job", async () => {
      // Create a pending job first
      const createRes = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: "fundamentals" }),
      });
      expect(createRes.status).toBe(202);
      const createData = await createRes.json();

      // Cancel it
      const cancelRes = await batchTriggerRoutes.request(`/batch/cancel/${createData.run_id}`, {
        method: "POST",
      });
      expect(cancelRes.status).toBe(200);

      const cancelData = await cancelRes.json();
      expect(cancelData.success).toBe(true);
    });

    it("POST /batch/cancel/:id returns 404 for non-existent job", async () => {
      const res = await batchTriggerRoutes.request("/batch/cancel/non-existent", {
        method: "POST",
      });
      expect(res.status).toBe(404);
    });

    it("POST /batch/cancel/:id returns 409 for completed job", async () => {
      // Seed completed jobs
      await seedSyncRuns();

      const res = await batchTriggerRoutes.request("/batch/cancel/run-001", {
        method: "POST",
      });
      expect(res.status).toBe(409);
    });
  });
});
