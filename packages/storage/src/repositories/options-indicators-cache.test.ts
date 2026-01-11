/**
 * OptionsIndicatorsCacheRepository Tests
 *
 * Tests for the Options Indicators Cache data layer.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  type CreateOptionsIndicatorsCacheInput,
  OptionsIndicatorsCacheRepository,
} from "./options-indicators-cache.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
  // Create options_indicators_cache table (from migration 008)
  await client.run(`
    CREATE TABLE IF NOT EXISTS options_indicators_cache (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timestamp TEXT NOT NULL,

      implied_volatility REAL,
      iv_percentile_30d REAL,
      iv_skew REAL,
      put_call_ratio REAL,
      vrp REAL,
      term_structure_slope REAL,

      net_delta REAL,
      net_gamma REAL,
      net_theta REAL,
      net_vega REAL,

      expires_at TEXT NOT NULL,

      UNIQUE(symbol)
    )
  `);

  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_options_cache_symbol ON options_indicators_cache(symbol)"
  );
  await client.run(
    "CREATE INDEX IF NOT EXISTS idx_options_cache_expires ON options_indicators_cache(expires_at)"
  );
}

describe("OptionsIndicatorsCacheRepository", () => {
  let client: TursoClient;
  let repo: OptionsIndicatorsCacheRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new OptionsIndicatorsCacheRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  // ========================================
  // Set Operations
  // ========================================

  describe("Set Operations", () => {
    test("sets a cache entry", async () => {
      const input: CreateOptionsIndicatorsCacheInput = {
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ivPercentile30d: 65,
        ivSkew: -0.05,
        putCallRatio: 0.8,
        vrp: 0.02,
        termStructureSlope: 0.01,
        netDelta: 100,
        netGamma: 50,
        netTheta: -200,
        netVega: 150,
        ttlMinutes: 60,
      };

      const result = await repo.set(input);

      expect(result.symbol).toBe("AAPL");
      expect(result.impliedVolatility).toBe(0.25);
      expect(result.ivPercentile30d).toBe(65);
      expect(result.ivSkew).toBe(-0.05);
      expect(result.putCallRatio).toBe(0.8);
      expect(result.vrp).toBe(0.02);
      expect(result.termStructureSlope).toBe(0.01);
      expect(result.netDelta).toBe(100);
      expect(result.netGamma).toBe(50);
      expect(result.netTheta).toBe(-200);
      expect(result.netVega).toBe(150);
      expect(result.timestamp).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });

    test("sets cache entry with minimal fields", async () => {
      const input: CreateOptionsIndicatorsCacheInput = {
        id: testId("opt"),
        symbol: "MSFT",
        impliedVolatility: 0.2,
      };

      const result = await repo.set(input);

      expect(result.symbol).toBe("MSFT");
      expect(result.impliedVolatility).toBe(0.2);
      expect(result.ivSkew).toBeNull();
    });

    test("updates existing entry on same symbol", async () => {
      // Set initial
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.2,
      });

      // Set again with updated values
      const result = await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.3,
        ivSkew: -0.1,
      });

      expect(result.impliedVolatility).toBe(0.3);
      expect(result.ivSkew).toBe(-0.1);

      // Verify only one entry exists
      const count = await repo.count(true);
      expect(count).toBe(1);
    });
  });

  // ========================================
  // Bulk Operations
  // ========================================

  describe("Bulk Operations", () => {
    test("bulk sets multiple entries", async () => {
      const inputs: CreateOptionsIndicatorsCacheInput[] = [
        { id: testId("opt"), symbol: "AAPL", impliedVolatility: 0.25 },
        { id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2 },
        { id: testId("opt"), symbol: "GOOGL", impliedVolatility: 0.22 },
      ];

      const count = await repo.bulkSet(inputs);

      expect(count).toBe(3);

      const total = await repo.count(true);
      expect(total).toBe(3);
    });

    test("returns 0 for empty input", async () => {
      const count = await repo.bulkSet([]);
      expect(count).toBe(0);
    });
  });

  // ========================================
  // Get Operations
  // ========================================

  describe("Get Operations", () => {
    beforeEach(async () => {
      await repo.bulkSet([
        { id: testId("opt"), symbol: "AAPL", impliedVolatility: 0.25, ttlMinutes: 60 },
        { id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2, ttlMinutes: 60 },
      ]);
    });

    test("gets valid cache entry", async () => {
      const result = await repo.get("AAPL");

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("AAPL");
      expect(result?.impliedVolatility).toBe(0.25);
    });

    test("returns null for non-existent symbol", async () => {
      const result = await repo.get("TSLA");
      expect(result).toBeNull();
    });

    test("returns null for expired entry", async () => {
      // Set with 0 TTL (expired immediately)
      await repo.set({
        id: testId("opt"),
        symbol: "TSLA",
        impliedVolatility: 0.3,
        ttlMinutes: -1, // Expired in the past
      });

      const result = await repo.get("TSLA");
      expect(result).toBeNull();
    });

    test("gets expired entry with getIncludingExpired", async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "TSLA",
        impliedVolatility: 0.3,
        ttlMinutes: -1,
      });

      const result = await repo.getIncludingExpired("TSLA");
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("TSLA");
    });

    test("gets multiple entries", async () => {
      const results = await repo.getMany(["AAPL", "MSFT", "TSLA"]);

      expect(results.size).toBe(2); // TSLA doesn't exist
      expect(results.has("AAPL")).toBe(true);
      expect(results.has("MSFT")).toBe(true);
      expect(results.has("TSLA")).toBe(false);
    });

    test("checks if entry exists", async () => {
      expect(await repo.has("AAPL")).toBe(true);
      expect(await repo.has("TSLA")).toBe(false);
    });

    test("gets all valid entries", async () => {
      const results = await repo.getAll();

      expect(results.length).toBe(2);
    });
  });

  // ========================================
  // Expiration Operations
  // ========================================

  describe("Expiration Operations", () => {
    test("gets expired symbols", async () => {
      // Set some entries with different TTLs
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ttlMinutes: 60,
      });
      await repo.set({ id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2, ttlMinutes: -1 }); // Expired
      await repo.set({
        id: testId("opt"),
        symbol: "GOOGL",
        impliedVolatility: 0.22,
        ttlMinutes: -1,
      }); // Expired

      const expired = await repo.getExpiredSymbols();

      expect(expired.length).toBe(2);
      expect(expired).toContain("MSFT");
      expect(expired).toContain("GOOGL");
    });

    test("refreshes TTL", async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ttlMinutes: 60,
      });

      const refreshed = await repo.refresh("AAPL", 120);

      expect(refreshed).toBe(true);

      const entry = await repo.get("AAPL");
      expect(entry).not.toBeNull();
    });

    test("clears expired entries", async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ttlMinutes: 60,
      });
      await repo.set({ id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2, ttlMinutes: -1 });
      await repo.set({
        id: testId("opt"),
        symbol: "GOOGL",
        impliedVolatility: 0.22,
        ttlMinutes: -1,
      });

      const cleared = await repo.clearExpired();

      expect(cleared).toBe(2);

      const remaining = await repo.count(true);
      expect(remaining).toBe(1);
    });
  });

  // ========================================
  // Update Operations
  // ========================================

  describe("Update Operations", () => {
    test("updates cache entry", async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ivSkew: -0.05,
      });

      const result = await repo.update("AAPL", {
        impliedVolatility: 0.3,
        putCallRatio: 0.9,
      });

      expect(result).not.toBeNull();
      expect(result?.impliedVolatility).toBe(0.3);
      expect(result?.putCallRatio).toBe(0.9);
      expect(result?.ivSkew).toBe(-0.05); // Unchanged
    });

    test("updates TTL", async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ttlMinutes: 60,
      });

      const result = await repo.update("AAPL", { ttlMinutes: 120 });

      expect(result).not.toBeNull();
    });

    test("returns null for non-existent symbol", async () => {
      const result = await repo.update("TSLA", { impliedVolatility: 0.3 });
      expect(result).toBeNull();
    });
  });

  // ========================================
  // Delete Operations
  // ========================================

  describe("Delete Operations", () => {
    test("deletes cache entry", async () => {
      await repo.set({ id: testId("opt"), symbol: "AAPL", impliedVolatility: 0.25 });

      const deleted = await repo.delete("AAPL");

      expect(deleted).toBe(true);

      const result = await repo.get("AAPL");
      expect(result).toBeNull();
    });

    test("returns false for non-existent symbol", async () => {
      const deleted = await repo.delete("TSLA");
      expect(deleted).toBe(false);
    });

    test("clears all entries", async () => {
      await repo.bulkSet([
        { id: testId("opt"), symbol: "AAPL", impliedVolatility: 0.25 },
        { id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2 },
      ]);

      const cleared = await repo.clearAll();

      expect(cleared).toBe(2);

      const count = await repo.count(true);
      expect(count).toBe(0);
    });
  });

  // ========================================
  // Count and Stats Operations
  // ========================================

  describe("Count and Stats Operations", () => {
    beforeEach(async () => {
      await repo.set({
        id: testId("opt"),
        symbol: "AAPL",
        impliedVolatility: 0.25,
        ttlMinutes: 60,
      });
      await repo.set({ id: testId("opt"), symbol: "MSFT", impliedVolatility: 0.2, ttlMinutes: 60 });
      await repo.set({
        id: testId("opt"),
        symbol: "GOOGL",
        impliedVolatility: 0.22,
        ttlMinutes: -1,
      }); // Expired
    });

    test("counts valid entries", async () => {
      const count = await repo.count();
      expect(count).toBe(2);
    });

    test("counts all entries including expired", async () => {
      const count = await repo.count(true);
      expect(count).toBe(3);
    });

    test("gets cache statistics", async () => {
      const stats = await repo.getStats();

      expect(stats.total).toBe(3);
      expect(stats.valid).toBe(2);
      expect(stats.expired).toBe(1);
      expect(stats.oldestTimestamp).toBeDefined();
      expect(stats.newestTimestamp).toBeDefined();
    });
  });
});
