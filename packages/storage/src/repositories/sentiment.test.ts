/**
 * SentimentRepository Tests
 *
 * Tests for the Sentiment Indicators data layer.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type CreateSentimentInput, SentimentRepository } from "./sentiment.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
  // Create sentiment_indicators table (from migration 008)
  await client.run(`
    CREATE TABLE IF NOT EXISTS sentiment_indicators (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,

      sentiment_score REAL,
      sentiment_strength REAL,
      news_volume INTEGER,
      sentiment_momentum REAL,
      event_risk_flag INTEGER DEFAULT 0,

      news_sentiment REAL,
      social_sentiment REAL,
      analyst_sentiment REAL,

      computed_at TEXT NOT NULL DEFAULT (datetime('now')),

      UNIQUE(symbol, date)
    )
  `);

  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_sentiment_symbol_date ON sentiment_indicators(symbol, date)"
  );
  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_sentiment_symbol ON sentiment_indicators(symbol)"
  );
}

describe("SentimentRepository", () => {
  let client: TursoClient;
  let repo: SentimentRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new SentimentRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  // ========================================
  // Create Operations
  // ========================================

  describe("Create Operations", () => {
    test("creates a sentiment record", async () => {
      const id = testId("sent");
      const input: CreateSentimentInput = {
        id,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.75,
        sentimentStrength: 0.8,
        newsVolume: 50,
        sentimentMomentum: 0.1,
        eventRiskFlag: false,
        newsSentiment: 0.7,
        socialSentiment: 0.8,
        analystSentiment: 0.75,
      };

      const result = await repo.create(input);

      expect(result.id).toBe(id);
      expect(result.symbol).toBe("AAPL");
      expect(result.date).toBe("2026-01-10");
      expect(result.sentimentScore).toBe(0.75);
      expect(result.sentimentStrength).toBe(0.8);
      expect(result.newsVolume).toBe(50);
      expect(result.sentimentMomentum).toBe(0.1);
      expect(result.eventRiskFlag).toBe(false);
      expect(result.newsSentiment).toBe(0.7);
      expect(result.socialSentiment).toBe(0.8);
      expect(result.analystSentiment).toBe(0.75);
      expect(result.computedAt).toBeDefined();
    });

    test("creates record with minimal fields", async () => {
      const id = testId("sent");
      const input: CreateSentimentInput = {
        id,
        symbol: "MSFT",
        date: "2026-01-10",
      };

      const result = await repo.create(input);

      expect(result.symbol).toBe("MSFT");
      expect(result.sentimentScore).toBeNull();
      expect(result.eventRiskFlag).toBe(false);
    });

    test("creates record with event risk flag", async () => {
      const id = testId("sent");
      const input: CreateSentimentInput = {
        id,
        symbol: "TSLA",
        date: "2026-01-10",
        sentimentScore: -0.5,
        eventRiskFlag: true,
      };

      const result = await repo.create(input);

      expect(result.eventRiskFlag).toBe(true);
      expect(result.sentimentScore).toBe(-0.5);
    });
  });

  // ========================================
  // Upsert Operations
  // ========================================

  describe("Upsert Operations", () => {
    test("inserts new record", async () => {
      const id = testId("sent");
      const input: CreateSentimentInput = {
        id,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.5,
      };

      const result = await repo.upsert(input);

      expect(result.symbol).toBe("AAPL");
      expect(result.sentimentScore).toBe(0.5);
    });

    test("updates existing record on conflict", async () => {
      const id1 = testId("sent");
      const id2 = testId("sent");

      // Create initial record
      await repo.create({
        id: id1,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.5,
        eventRiskFlag: false,
      });

      // Upsert with same symbol/date but different values
      const result = await repo.upsert({
        id: id2,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.8,
        eventRiskFlag: true,
      });

      expect(result.sentimentScore).toBe(0.8);
      expect(result.eventRiskFlag).toBe(true);

      // Verify only one record exists
      const count = await repo.count({ symbol: "AAPL" });
      expect(count).toBe(1);
    });
  });

  // ========================================
  // Bulk Operations
  // ========================================

  describe("Bulk Operations", () => {
    test("bulk upserts multiple records", async () => {
      const inputs: CreateSentimentInput[] = [
        { id: testId("sent"), symbol: "AAPL", date: "2026-01-10", sentimentScore: 0.7 },
        { id: testId("sent"), symbol: "MSFT", date: "2026-01-10", sentimentScore: 0.5 },
        { id: testId("sent"), symbol: "GOOGL", date: "2026-01-10", sentimentScore: -0.2 },
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
        { id: testId("sent"), symbol: "AAPL", date: "2026-01-08", sentimentScore: 0.6 },
        { id: testId("sent"), symbol: "AAPL", date: "2026-01-09", sentimentScore: 0.65 },
        { id: testId("sent"), symbol: "AAPL", date: "2026-01-10", sentimentScore: 0.7 },
        {
          id: testId("sent"),
          symbol: "TSLA",
          date: "2026-01-10",
          sentimentScore: -0.3,
          eventRiskFlag: true,
        },
      ]);
    });

    test("finds by ID", async () => {
      const all = await repo.findBySymbol("AAPL");
      const id = all[0]!.id;

      const result = await repo.findById(id);

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("AAPL");
    });

    test("returns null for non-existent ID", async () => {
      const result = await repo.findById("non-existent");
      expect(result).toBeNull();
    });

    test("finds by symbol and date", async () => {
      const result = await repo.findBySymbolAndDate("AAPL", "2026-01-10");

      expect(result).not.toBeNull();
      expect(result?.sentimentScore).toBe(0.7);
    });

    test("finds latest by symbol", async () => {
      const result = await repo.findLatestBySymbol("AAPL");

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-01-10");
      expect(result?.sentimentScore).toBe(0.7);
    });

    test("finds all by symbol", async () => {
      const results = await repo.findBySymbol("AAPL");

      expect(results.length).toBe(3);
      // Should be ordered by date DESC
      expect(results[0]?.date).toBe("2026-01-10");
    });

    test("finds by symbol with date range", async () => {
      const results = await repo.findBySymbol("AAPL", {
        startDate: "2026-01-09",
        endDate: "2026-01-10",
      });

      expect(results.length).toBe(2);
    });

    test("finds most positive sentiment", async () => {
      const results = await repo.findMostPositive(10);

      expect(results.length).toBe(2); // AAPL and TSLA (latest for each)
      expect(results[0]?.symbol).toBe("AAPL"); // Higher sentiment score
    });

    test("finds most negative sentiment", async () => {
      const results = await repo.findMostNegative(10);

      expect(results.length).toBe(2);
      expect(results[0]?.symbol).toBe("TSLA"); // Lower (negative) sentiment
    });

    test("finds stocks with event risk", async () => {
      const results = await repo.findWithEventRisk();

      expect(results.length).toBe(1);
      expect(results[0]?.symbol).toBe("TSLA");
    });
  });

  // ========================================
  // Filter and Pagination
  // ========================================

  describe("Filter and Pagination", () => {
    beforeEach(async () => {
      // Seed more test data
      const inputs: CreateSentimentInput[] = [];
      for (let i = 1; i <= 30; i++) {
        inputs.push({
          id: testId("sent"),
          symbol: `SYM${String(i).padStart(2, "0")}`,
          date: "2026-01-10",
          sentimentScore: (i - 15) / 15, // Range from -1 to 1
          eventRiskFlag: i % 5 === 0, // Every 5th has event risk
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

    test("filters by sentiment score range", async () => {
      const result = await repo.findWithFilters({
        sentimentScoreGte: 0.5,
        sentimentScoreLte: 1.0,
      });

      // Scores >= 0.5: symbols 23-30 (i >= 23 means score >= (23-15)/15 = 0.533)
      expect(result.data.length).toBeGreaterThan(0);
      for (const item of result.data) {
        expect(item.sentimentScore).toBeGreaterThanOrEqual(0.5);
      }
    });

    test("filters by event risk flag", async () => {
      const result = await repo.findWithFilters({ eventRiskFlag: true });

      expect(result.data.length).toBe(6); // 5, 10, 15, 20, 25, 30
      for (const item of result.data) {
        expect(item.eventRiskFlag).toBe(true);
      }
    });
  });

  // ========================================
  // Update Operations
  // ========================================

  describe("Update Operations", () => {
    test("updates a record", async () => {
      const id = testId("sent");
      await repo.create({
        id,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.5,
        eventRiskFlag: false,
      });

      const result = await repo.update(id, {
        sentimentScore: 0.8,
        eventRiskFlag: true,
      });

      expect(result).not.toBeNull();
      expect(result?.sentimentScore).toBe(0.8);
      expect(result?.eventRiskFlag).toBe(true);
    });

    test("returns existing record when no updates provided", async () => {
      const id = testId("sent");
      await repo.create({
        id,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.5,
      });

      const result = await repo.update(id, {});

      expect(result).not.toBeNull();
      expect(result?.sentimentScore).toBe(0.5);
    });

    test("returns null for non-existent ID", async () => {
      const result = await repo.update("non-existent", { sentimentScore: 0.9 });
      expect(result).toBeNull();
    });
  });

  // ========================================
  // Delete Operations
  // ========================================

  describe("Delete Operations", () => {
    test("deletes a record", async () => {
      const id = testId("sent");
      await repo.create({
        id,
        symbol: "AAPL",
        date: "2026-01-10",
        sentimentScore: 0.5,
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
        { id: testId("sent"), symbol: "AAPL", date: "2025-12-01", sentimentScore: 0.4 },
        { id: testId("sent"), symbol: "MSFT", date: "2025-12-15", sentimentScore: 0.5 },
        { id: testId("sent"), symbol: "GOOGL", date: "2026-01-10", sentimentScore: 0.6 },
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
        {
          id: testId("sent"),
          symbol: "AAPL",
          date: "2026-01-10",
          sentimentScore: 0.7,
          eventRiskFlag: false,
        },
        {
          id: testId("sent"),
          symbol: "MSFT",
          date: "2026-01-10",
          sentimentScore: 0.5,
          eventRiskFlag: false,
        },
        {
          id: testId("sent"),
          symbol: "TSLA",
          date: "2026-01-10",
          sentimentScore: -0.3,
          eventRiskFlag: true,
        },
      ]);
    });

    test("counts all records", async () => {
      const count = await repo.count();
      expect(count).toBe(3);
    });

    test("counts with symbol filter", async () => {
      const count = await repo.count({ symbol: "AAPL" });
      expect(count).toBe(1);
    });

    test("counts with event risk filter", async () => {
      const count = await repo.count({ eventRiskFlag: true });
      expect(count).toBe(1);
    });
  });
});
