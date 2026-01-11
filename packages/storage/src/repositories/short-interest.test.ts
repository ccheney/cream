/**
 * ShortInterestRepository Tests
 *
 * Tests for the Short Interest Indicators data layer.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type CreateShortInterestInput, ShortInterestRepository } from "./short-interest.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
  // Create short_interest_indicators table (from migration 008)
  await client.run(`
    CREATE TABLE IF NOT EXISTS short_interest_indicators (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      settlement_date TEXT NOT NULL,

      short_interest REAL NOT NULL,
      short_interest_ratio REAL,
      days_to_cover REAL,
      short_pct_float REAL,
      short_interest_change REAL,

      source TEXT NOT NULL DEFAULT 'FINRA',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),

      UNIQUE(symbol, settlement_date)
    )
  `);

  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_short_interest_symbol ON short_interest_indicators(symbol, settlement_date)"
  );
  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_short_interest_settlement ON short_interest_indicators(settlement_date)"
  );
}

describe("ShortInterestRepository", () => {
  let client: TursoClient;
  let repo: ShortInterestRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new ShortInterestRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  // ========================================
  // Create Operations
  // ========================================

  describe("Create Operations", () => {
    test("creates a short interest record", async () => {
      const id = testId("si");
      const input: CreateShortInterestInput = {
        id,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
        shortInterestRatio: 5.2,
        daysToCover: 3.5,
        shortPctFloat: 0.25,
        shortInterestChange: 0.05,
      };

      const result = await repo.create(input);

      expect(result.id).toBe(id);
      expect(result.symbol).toBe("GME");
      expect(result.settlementDate).toBe("2026-01-10");
      expect(result.shortInterest).toBe(50000000);
      expect(result.shortInterestRatio).toBe(5.2);
      expect(result.daysToCover).toBe(3.5);
      expect(result.shortPctFloat).toBe(0.25);
      expect(result.shortInterestChange).toBe(0.05);
      expect(result.source).toBe("FINRA");
      expect(result.fetchedAt).toBeDefined();
    });

    test("creates record with minimal fields", async () => {
      const id = testId("si");
      const input: CreateShortInterestInput = {
        id,
        symbol: "AMC",
        settlementDate: "2026-01-10",
        shortInterest: 30000000,
      };

      const result = await repo.create(input);

      expect(result.symbol).toBe("AMC");
      expect(result.shortInterest).toBe(30000000);
      expect(result.shortInterestRatio).toBeNull();
      expect(result.daysToCover).toBeNull();
    });

    test("uses custom source when provided", async () => {
      const id = testId("si");
      const input: CreateShortInterestInput = {
        id,
        symbol: "TSLA",
        settlementDate: "2026-01-10",
        shortInterest: 10000000,
        source: "NASDAQ",
      };

      const result = await repo.create(input);

      expect(result.source).toBe("NASDAQ");
    });
  });

  // ========================================
  // Upsert Operations
  // ========================================

  describe("Upsert Operations", () => {
    test("inserts new record", async () => {
      const id = testId("si");
      const input: CreateShortInterestInput = {
        id,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
      };

      const result = await repo.upsert(input);

      expect(result.symbol).toBe("GME");
      expect(result.shortInterest).toBe(50000000);
    });

    test("updates existing record on conflict", async () => {
      const id1 = testId("si");
      const id2 = testId("si");

      // Create initial record
      await repo.create({
        id: id1,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
        shortPctFloat: 0.25,
      });

      // Upsert with same symbol/date but different values
      const result = await repo.upsert({
        id: id2,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 55000000,
        shortPctFloat: 0.28,
      });

      expect(result.shortInterest).toBe(55000000);
      expect(result.shortPctFloat).toBe(0.28);

      // Verify only one record exists
      const count = await repo.count({ symbol: "GME" });
      expect(count).toBe(1);
    });
  });

  // ========================================
  // Bulk Operations
  // ========================================

  describe("Bulk Operations", () => {
    test("bulk upserts multiple records", async () => {
      const inputs: CreateShortInterestInput[] = [
        { id: testId("si"), symbol: "GME", settlementDate: "2026-01-10", shortInterest: 50000000 },
        { id: testId("si"), symbol: "AMC", settlementDate: "2026-01-10", shortInterest: 30000000 },
        { id: testId("si"), symbol: "TSLA", settlementDate: "2026-01-10", shortInterest: 10000000 },
      ];

      const count = await repo.bulkUpsert(inputs);

      expect(count).toBe(3);

      const total = await repo.count();
      expect(total).toBe(3);
    });

    test("returns 0 for empty input", async () => {
      const count = await repo.bulkUpsert([]);
      expect(count).toBe(0);
    });
  });

  // ========================================
  // Find Operations
  // ========================================

  describe("Find Operations", () => {
    beforeEach(async () => {
      // Seed test data
      await repo.bulkUpsert([
        {
          id: testId("si"),
          symbol: "GME",
          settlementDate: "2026-01-08",
          shortInterest: 48000000,
          shortPctFloat: 0.23,
        },
        {
          id: testId("si"),
          symbol: "GME",
          settlementDate: "2026-01-09",
          shortInterest: 49000000,
          shortPctFloat: 0.24,
        },
        {
          id: testId("si"),
          symbol: "GME",
          settlementDate: "2026-01-10",
          shortInterest: 50000000,
          shortPctFloat: 0.25,
        },
        {
          id: testId("si"),
          symbol: "AMC",
          settlementDate: "2026-01-10",
          shortInterest: 30000000,
          shortPctFloat: 0.15,
        },
      ]);
    });

    test("finds by ID", async () => {
      const all = await repo.findBySymbol("GME");
      const id = all[0]!.id;

      const result = await repo.findById(id);

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("GME");
    });

    test("returns null for non-existent ID", async () => {
      const result = await repo.findById("non-existent");
      expect(result).toBeNull();
    });

    test("finds by symbol and date", async () => {
      const result = await repo.findBySymbolAndDate("GME", "2026-01-10");

      expect(result).not.toBeNull();
      expect(result?.shortInterest).toBe(50000000);
    });

    test("finds latest by symbol", async () => {
      const result = await repo.findLatestBySymbol("GME");

      expect(result).not.toBeNull();
      expect(result?.settlementDate).toBe("2026-01-10");
      expect(result?.shortInterest).toBe(50000000);
    });

    test("finds all by symbol", async () => {
      const results = await repo.findBySymbol("GME");

      expect(results.length).toBe(3);
      // Should be ordered by date DESC
      expect(results[0]?.settlementDate).toBe("2026-01-10");
    });

    test("finds by symbol with date range", async () => {
      const results = await repo.findBySymbol("GME", {
        startDate: "2026-01-09",
        endDate: "2026-01-10",
      });

      expect(results.length).toBe(2);
    });

    test("finds highest short interest stocks", async () => {
      const results = await repo.findHighestShortInterest(10);

      expect(results.length).toBe(2); // GME and AMC (latest for each symbol)
      expect(results[0]?.symbol).toBe("GME"); // Higher short_pct_float
    });

    test("filters by minimum short percent of float", async () => {
      const results = await repo.findHighestShortInterest(10, 0.2);

      expect(results.length).toBe(1);
      expect(results[0]?.symbol).toBe("GME");
    });
  });

  // ========================================
  // Filter and Pagination
  // ========================================

  describe("Filter and Pagination", () => {
    beforeEach(async () => {
      // Seed more test data
      const inputs: CreateShortInterestInput[] = [];
      for (let i = 1; i <= 30; i++) {
        inputs.push({
          id: testId("si"),
          symbol: `SYM${String(i).padStart(2, "0")}`,
          settlementDate: "2026-01-10",
          shortInterest: i * 1000000,
          shortPctFloat: i * 0.01,
        });
      }
      await repo.bulkUpsert(inputs);
    });

    test("paginates results", async () => {
      const page1 = await repo.findWithFilters({}, { page: 1, pageSize: 10 });

      expect(page1.data.length).toBe(10);
      expect(page1.total).toBe(30);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(10);
      expect(page1.totalPages).toBe(3);
      expect(page1.hasNext).toBe(true);
      expect(page1.hasPrev).toBe(false);
    });

    test("filters by symbol", async () => {
      const result = await repo.findWithFilters({ symbol: "SYM15" });

      expect(result.data.length).toBe(1);
      expect(result.data[0]?.symbol).toBe("SYM15");
    });

    test("filters by minimum short percent of float", async () => {
      const result = await repo.findWithFilters({ shortPctFloatGte: 0.25 });

      expect(result.data.length).toBe(6); // 25% through 30%
    });
  });

  // ========================================
  // Update Operations
  // ========================================

  describe("Update Operations", () => {
    test("updates a record", async () => {
      const id = testId("si");
      await repo.create({
        id,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
        shortPctFloat: 0.25,
      });

      const result = await repo.update(id, {
        shortInterest: 60000000,
        shortPctFloat: 0.3,
      });

      expect(result).not.toBeNull();
      expect(result?.shortInterest).toBe(60000000);
      expect(result?.shortPctFloat).toBe(0.3);
    });

    test("returns existing record when no updates provided", async () => {
      const id = testId("si");
      await repo.create({
        id,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
      });

      const result = await repo.update(id, {});

      expect(result).not.toBeNull();
      expect(result?.shortInterest).toBe(50000000);
    });

    test("returns null for non-existent ID", async () => {
      const result = await repo.update("non-existent", { shortInterest: 100 });
      expect(result).toBeNull();
    });
  });

  // ========================================
  // Delete Operations
  // ========================================

  describe("Delete Operations", () => {
    test("deletes a record", async () => {
      const id = testId("si");
      await repo.create({
        id,
        symbol: "GME",
        settlementDate: "2026-01-10",
        shortInterest: 50000000,
      });

      const deleted = await repo.delete(id);

      expect(deleted).toBe(true);

      const result = await repo.findById(id);
      expect(result).toBeNull();
    });

    test("returns false for non-existent ID", async () => {
      const deleted = await repo.delete("non-existent");
      expect(deleted).toBe(false);
    });

    test("deletes records older than date", async () => {
      await repo.bulkUpsert([
        { id: testId("si"), symbol: "GME", settlementDate: "2025-12-01", shortInterest: 40000000 },
        { id: testId("si"), symbol: "AMC", settlementDate: "2025-12-15", shortInterest: 20000000 },
        { id: testId("si"), symbol: "TSLA", settlementDate: "2026-01-10", shortInterest: 10000000 },
      ]);

      const deletedCount = await repo.deleteOlderThan("2026-01-01");

      expect(deletedCount).toBe(2);

      const count = await repo.count();
      expect(count).toBe(1);
    });
  });

  // ========================================
  // Count Operations
  // ========================================

  describe("Count Operations", () => {
    beforeEach(async () => {
      await repo.bulkUpsert([
        { id: testId("si"), symbol: "GME", settlementDate: "2026-01-10", shortInterest: 50000000 },
        { id: testId("si"), symbol: "AMC", settlementDate: "2026-01-10", shortInterest: 30000000 },
        { id: testId("si"), symbol: "GME", settlementDate: "2026-01-11", shortInterest: 51000000 },
      ]);
    });

    test("counts all records", async () => {
      const count = await repo.count();
      expect(count).toBe(3);
    });

    test("counts with symbol filter", async () => {
      const count = await repo.count({ symbol: "GME" });
      expect(count).toBe(2);
    });

    test("counts with date filter", async () => {
      const count = await repo.count({ settlementDate: "2026-01-10" });
      expect(count).toBe(2);
    });
  });
});
