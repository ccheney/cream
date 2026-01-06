/**
 * Historical Universe Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  type IndexConstituent,
  IndexConstituentsRepository,
  TickerChangesRepository,
  UniverseSnapshotsRepository,
} from "./historical-universe.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS index_constituents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      index_id TEXT NOT NULL CHECK (index_id IN ('SP500', 'NASDAQ100', 'DOWJONES', 'RUSSELL2000', 'RUSSELL3000', 'SP400', 'SP600')),
      symbol TEXT NOT NULL,
      date_added TEXT NOT NULL,
      date_removed TEXT,
      reason_added TEXT,
      reason_removed TEXT,
      sector TEXT,
      industry TEXT,
      market_cap_at_add REAL,
      provider TEXT NOT NULL DEFAULT 'fmp',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(index_id, symbol, date_added)
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS ticker_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_symbol TEXT NOT NULL,
      new_symbol TEXT NOT NULL,
      change_date TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK (change_type IN ('rename', 'merger', 'spinoff', 'acquisition', 'restructure')),
      conversion_ratio REAL,
      reason TEXT,
      acquiring_company TEXT,
      provider TEXT NOT NULL DEFAULT 'fmp',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(old_symbol, new_symbol, change_date)
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS universe_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      index_id TEXT NOT NULL CHECK (index_id IN ('SP500', 'NASDAQ100', 'DOWJONES', 'RUSSELL2000', 'RUSSELL3000', 'SP400', 'SP600')),
      tickers TEXT NOT NULL,
      ticker_count INTEGER NOT NULL,
      source_version TEXT,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      UNIQUE(index_id, snapshot_date)
    )
  `);
}

// ========================================
// Index Constituents Repository Tests
// ========================================

describe("IndexConstituentsRepository", () => {
  let client: TursoClient;
  let repo: IndexConstituentsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new IndexConstituentsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("upserts a constituent", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2000-01-01",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCapAtAdd: 100000000000,
      provider: "fmp",
    });

    const constituents = await repo.getCurrentConstituents("SP500");
    expect(constituents).toHaveLength(1);
    expect(constituents[0]!.symbol).toBe("AAPL");
    expect(constituents[0]!.sector).toBe("Technology");
  });

  test("upsert updates existing constituent on removal", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      provider: "fmp",
    });

    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      dateRemoved: "2018-06-26",
      reasonRemoved: "Underperformance",
      provider: "fmp",
    });

    const current = await repo.getCurrentConstituents("SP500");
    expect(current).toHaveLength(0);

    const history = await repo.getSymbolHistory("GE");
    expect(history).toHaveLength(1);
    expect(history[0]!.dateRemoved).toBe("2018-06-26");
  });

  test("bulk inserts constituents", async () => {
    const constituents: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">[] = [
      { indexId: "SP500", symbol: "AAPL", dateAdded: "2000-01-01", provider: "fmp" },
      { indexId: "SP500", symbol: "MSFT", dateAdded: "1995-01-01", provider: "fmp" },
      { indexId: "SP500", symbol: "GOOGL", dateAdded: "2006-03-31", provider: "fmp" },
    ];

    const count = await repo.bulkInsert(constituents);
    expect(count).toBe(3);

    const current = await repo.getCurrentConstituents("SP500");
    expect(current).toHaveLength(3);
  });

  test("bulkInsert returns 0 for empty array", async () => {
    const count = await repo.bulkInsert([]);
    expect(count).toBe(0);
  });

  test("gets constituents as of date", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2000-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "META",
      dateAdded: "2013-12-23",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "GOOG",
      dateAdded: "2006-03-31",
      dateRemoved: "2014-04-02",
      provider: "fmp",
    });

    const asOf2010 = await repo.getConstituentsAsOf("SP500", "2010-01-01");
    expect(asOf2010).toHaveLength(2);
    expect(asOf2010).toContain("AAPL");
    expect(asOf2010).toContain("GOOG");
    expect(asOf2010).not.toContain("META");

    const asOf2015 = await repo.getConstituentsAsOf("SP500", "2015-01-01");
    expect(asOf2015).toHaveLength(2);
    expect(asOf2015).toContain("AAPL");
    expect(asOf2015).toContain("META");
    expect(asOf2015).not.toContain("GOOG");
  });

  test("gets current constituents (not removed)", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2000-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "MSFT",
      dateAdded: "1995-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      dateRemoved: "2018-06-26",
      provider: "fmp",
    });

    const current = await repo.getCurrentConstituents("SP500");
    expect(current).toHaveLength(2);
    expect(current.map((c) => c.symbol)).toContain("AAPL");
    expect(current.map((c) => c.symbol)).toContain("MSFT");
    expect(current.map((c) => c.symbol)).not.toContain("GE");
  });

  test("gets symbol history across indices", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "META",
      dateAdded: "2013-12-23",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "NASDAQ100",
      symbol: "META",
      dateAdded: "2013-01-01",
      provider: "fmp",
    });

    const history = await repo.getSymbolHistory("META");
    expect(history).toHaveLength(2);
  });

  test("checks if symbol was in index on date", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2000-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      dateRemoved: "2018-06-26",
      provider: "fmp",
    });

    expect(await repo.wasInIndexOnDate("SP500", "AAPL", "2020-01-01")).toBe(true);
    expect(await repo.wasInIndexOnDate("SP500", "AAPL", "1990-01-01")).toBe(false);
    expect(await repo.wasInIndexOnDate("SP500", "GE", "2015-01-01")).toBe(true);
    expect(await repo.wasInIndexOnDate("SP500", "GE", "2020-01-01")).toBe(false);
    expect(await repo.wasInIndexOnDate("SP500", "NONEXISTENT", "2020-01-01")).toBe(false);
  });

  test("gets changes in date range", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "META",
      dateAdded: "2013-12-23",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "PYPL",
      dateAdded: "2015-07-20",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      dateRemoved: "2018-06-26",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "ETSY",
      dateAdded: "2020-09-21",
      provider: "fmp",
    });

    const changes = await repo.getChangesInRange("SP500", "2015-01-01", "2019-12-31");

    expect(changes.additions).toHaveLength(1);
    expect(changes.additions[0]!.symbol).toBe("PYPL");
    expect(changes.removals).toHaveLength(1);
    expect(changes.removals[0]!.symbol).toBe("GE");
  });

  test("gets constituent count as of date", async () => {
    await repo.upsert({
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2000-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "MSFT",
      dateAdded: "1995-01-01",
      provider: "fmp",
    });
    await repo.upsert({
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1990-01-01",
      dateRemoved: "2018-06-26",
      provider: "fmp",
    });

    const currentCount = await repo.getConstituentCount("SP500");
    expect(currentCount).toBe(2);

    const historicalCount = await repo.getConstituentCount("SP500", "2015-01-01");
    expect(historicalCount).toBe(3);
  });

  test("handles all index IDs", async () => {
    const indices = [
      "SP500",
      "NASDAQ100",
      "DOWJONES",
      "RUSSELL2000",
      "RUSSELL3000",
      "SP400",
      "SP600",
    ] as const;

    for (const indexId of indices) {
      await repo.upsert({
        indexId,
        symbol: `TEST_${indexId}`,
        dateAdded: "2020-01-01",
        provider: "fmp",
      });
    }

    for (const indexId of indices) {
      const constituents = await repo.getCurrentConstituents(indexId);
      expect(constituents).toHaveLength(1);
      expect(constituents[0]!.indexId).toBe(indexId);
    }
  });
});

// ========================================
// Ticker Changes Repository Tests
// ========================================

describe("TickerChangesRepository", () => {
  let client: TursoClient;
  let repo: TickerChangesRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new TickerChangesRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("inserts a ticker change", async () => {
    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      reason: "Company rebranding to Meta Platforms",
      provider: "fmp",
    });

    const changes = await repo.getChangesFromSymbol("FB");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.newSymbol).toBe("META");
    expect(changes[0]!.changeType).toBe("rename");
  });

  test("insert ignores duplicate on conflict", async () => {
    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      provider: "fmp",
    });

    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      reason: "Updated reason",
      provider: "fmp",
    });

    const changes = await repo.getChangesFromSymbol("FB");
    expect(changes).toHaveLength(1);
  });

  test("gets changes from symbol", async () => {
    await repo.insert({
      oldSymbol: "GOOG",
      newSymbol: "GOOGL",
      changeDate: "2014-04-03",
      changeType: "restructure",
      provider: "fmp",
    });
    await repo.insert({
      oldSymbol: "AAPL",
      newSymbol: "AAPL2",
      changeDate: "2020-01-01",
      changeType: "rename",
      provider: "fmp",
    });

    const changes = await repo.getChangesFromSymbol("GOOG");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.newSymbol).toBe("GOOGL");
  });

  test("gets changes to symbol", async () => {
    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      provider: "fmp",
    });

    const changes = await repo.getChangesToSymbol("META");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.oldSymbol).toBe("FB");
  });

  test("resolves historical ticker to current symbol", async () => {
    await repo.insert({
      oldSymbol: "TWX",
      newSymbol: "T",
      changeDate: "2018-06-14",
      changeType: "acquisition",
      acquiringCompany: "AT&T",
      provider: "fmp",
    });
    await repo.insert({
      oldSymbol: "T",
      newSymbol: "WBD",
      changeDate: "2022-04-08",
      changeType: "spinoff",
      provider: "fmp",
    });

    // Note: This tests the chain from TWX -> T -> WBD
    const current = await repo.resolveToCurrentSymbol("TWX");
    expect(current).toBe("WBD");

    const alreadyCurrent = await repo.resolveToCurrentSymbol("AAPL");
    expect(alreadyCurrent).toBe("AAPL");
  });

  test("resolves current ticker to historical symbol", async () => {
    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      provider: "fmp",
    });

    const historical2021 = await repo.resolveToHistoricalSymbol("META", "2021-01-01");
    expect(historical2021).toBe("FB");

    const historical2023 = await repo.resolveToHistoricalSymbol("META", "2023-01-01");
    expect(historical2023).toBe("META");
  });

  test("gets changes in date range", async () => {
    await repo.insert({
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2022-06-09",
      changeType: "rename",
      provider: "fmp",
    });
    await repo.insert({
      oldSymbol: "GOOG",
      newSymbol: "GOOGL",
      changeDate: "2014-04-03",
      changeType: "restructure",
      provider: "fmp",
    });
    await repo.insert({
      oldSymbol: "TWTR",
      newSymbol: "X",
      changeDate: "2023-07-24",
      changeType: "rename",
      provider: "fmp",
    });

    const changes2022 = await repo.getChangesInRange("2022-01-01", "2022-12-31");
    expect(changes2022).toHaveLength(1);
    expect(changes2022[0]!.oldSymbol).toBe("FB");

    const changes2014to2023 = await repo.getChangesInRange("2014-01-01", "2023-12-31");
    expect(changes2014to2023).toHaveLength(3);
  });

  test("handles all change types", async () => {
    const changeTypes = ["rename", "merger", "spinoff", "acquisition", "restructure"] as const;

    for (const changeType of changeTypes) {
      await repo.insert({
        oldSymbol: `OLD_${changeType}`,
        newSymbol: `NEW_${changeType}`,
        changeDate: "2023-01-01",
        changeType,
        provider: "fmp",
      });
    }

    for (const changeType of changeTypes) {
      const changes = await repo.getChangesFromSymbol(`OLD_${changeType}`);
      expect(changes).toHaveLength(1);
      expect(changes[0]!.changeType).toBe(changeType);
    }
  });

  test("handles conversion ratio for mergers", async () => {
    await repo.insert({
      oldSymbol: "ATVI",
      newSymbol: "MSFT",
      changeDate: "2023-10-13",
      changeType: "acquisition",
      conversionRatio: 0.9848,
      acquiringCompany: "Microsoft",
      provider: "fmp",
    });

    const changes = await repo.getChangesFromSymbol("ATVI");
    expect(changes[0]!.conversionRatio).toBe(0.9848);
    expect(changes[0]!.acquiringCompany).toBe("Microsoft");
  });
});

// ========================================
// Universe Snapshots Repository Tests
// ========================================

describe("UniverseSnapshotsRepository", () => {
  let client: TursoClient;
  let repo: UniverseSnapshotsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new UniverseSnapshotsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("saves a universe snapshot", async () => {
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"],
      tickerCount: 5,
      sourceVersion: "v1.0",
    });

    const snapshot = await repo.get("SP500", "2024-01-01");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.tickers).toEqual(["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]);
    expect(snapshot!.tickerCount).toBe(5);
    expect(snapshot!.sourceVersion).toBe("v1.0");
  });

  test("save updates existing snapshot on conflict", async () => {
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["AAPL", "MSFT"],
      tickerCount: 2,
    });

    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["AAPL", "MSFT", "GOOGL"],
      tickerCount: 3,
      sourceVersion: "v2.0",
    });

    const snapshot = await repo.get("SP500", "2024-01-01");
    expect(snapshot!.tickers).toHaveLength(3);
    expect(snapshot!.tickerCount).toBe(3);
    expect(snapshot!.sourceVersion).toBe("v2.0");
  });

  test("gets snapshot for specific date", async () => {
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["A", "B"],
      tickerCount: 2,
    });
    await repo.save({
      snapshotDate: "2024-02-01",
      indexId: "SP500",
      tickers: ["A", "B", "C"],
      tickerCount: 3,
    });

    const jan = await repo.get("SP500", "2024-01-01");
    expect(jan!.tickerCount).toBe(2);

    const feb = await repo.get("SP500", "2024-02-01");
    expect(feb!.tickerCount).toBe(3);
  });

  test("returns null for non-existent snapshot", async () => {
    const snapshot = await repo.get("SP500", "2020-01-01");
    expect(snapshot).toBeNull();
  });

  test("gets closest snapshot before date", async () => {
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
    });
    await repo.save({
      snapshotDate: "2024-03-01",
      indexId: "SP500",
      tickers: ["A", "B"],
      tickerCount: 2,
    });
    await repo.save({
      snapshotDate: "2024-05-01",
      indexId: "SP500",
      tickers: ["A", "B", "C"],
      tickerCount: 3,
    });

    const closest = await repo.getClosestBefore("SP500", "2024-04-15");
    expect(closest).not.toBeNull();
    expect(closest!.snapshotDate).toBe("2024-03-01");
    expect(closest!.tickerCount).toBe(2);
  });

  test("getClosestBefore returns null if no earlier snapshot", async () => {
    await repo.save({
      snapshotDate: "2024-06-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
    });

    const closest = await repo.getClosestBefore("SP500", "2024-01-01");
    expect(closest).toBeNull();
  });

  test("lists all snapshot dates for index", async () => {
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
    });
    await repo.save({
      snapshotDate: "2024-02-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
    });
    await repo.save({
      snapshotDate: "2024-03-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
    });
    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "NASDAQ100",
      tickers: ["B"],
      tickerCount: 1,
    });

    const sp500Dates = await repo.listDates("SP500");
    expect(sp500Dates).toHaveLength(3);
    expect(sp500Dates).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);

    const nasdaqDates = await repo.listDates("NASDAQ100");
    expect(nasdaqDates).toHaveLength(1);
  });

  test("purges expired snapshots", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers: ["A"],
      tickerCount: 1,
      expiresAt: pastDate,
    });
    await repo.save({
      snapshotDate: "2024-02-01",
      indexId: "SP500",
      tickers: ["B"],
      tickerCount: 1,
      expiresAt: futureDate,
    });
    await repo.save({
      snapshotDate: "2024-03-01",
      indexId: "SP500",
      tickers: ["C"],
      tickerCount: 1,
    }); // No expiry

    const purged = await repo.purgeExpired();
    expect(purged).toBe(1);

    const dates = await repo.listDates("SP500");
    expect(dates).toHaveLength(2);
    expect(dates).not.toContain("2024-01-01");
  });

  test("handles all index IDs", async () => {
    const indices = [
      "SP500",
      "NASDAQ100",
      "DOWJONES",
      "RUSSELL2000",
      "RUSSELL3000",
      "SP400",
      "SP600",
    ] as const;

    for (const indexId of indices) {
      await repo.save({
        snapshotDate: "2024-01-01",
        indexId,
        tickers: [`TEST_${indexId}`],
        tickerCount: 1,
      });
    }

    for (const indexId of indices) {
      const snapshot = await repo.get(indexId, "2024-01-01");
      expect(snapshot).not.toBeNull();
      expect(snapshot!.indexId).toBe(indexId);
    }
  });

  test("handles large ticker arrays", async () => {
    const tickers = Array.from({ length: 500 }, (_, i) => `TICKER${i}`);

    await repo.save({
      snapshotDate: "2024-01-01",
      indexId: "SP500",
      tickers,
      tickerCount: 500,
    });

    const snapshot = await repo.get("SP500", "2024-01-01");
    expect(snapshot!.tickers).toHaveLength(500);
    expect(snapshot!.tickerCount).toBe(500);
    expect(snapshot!.tickers[0]).toBe("TICKER0");
    expect(snapshot!.tickers[499]).toBe("TICKER499");
  });
});
