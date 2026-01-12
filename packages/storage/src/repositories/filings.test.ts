/**
 * Filings Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
  type CreateFilingInput,
  type CreateSyncRunInput,
  FilingSyncRunsRepository,
  FilingsRepository,
} from "./filings.js";

async function setupTables(client: TursoClient): Promise<void> {
  // Create filings table
  await client.run(`
    CREATE TABLE IF NOT EXISTS filings (
      id TEXT PRIMARY KEY,
      accession_number TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL,
      filing_type TEXT NOT NULL,
      filed_date TEXT NOT NULL,
      report_date TEXT,
      company_name TEXT,
      cik TEXT,
      section_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      ingested_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.run(`CREATE INDEX IF NOT EXISTS idx_filings_symbol ON filings(symbol)`);
  await client.run(`CREATE INDEX IF NOT EXISTS idx_filings_filed_date ON filings(filed_date)`);
  await client.run(`CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status)`);

  // Create filing_sync_runs table
  await client.run(`
    CREATE TABLE IF NOT EXISTS filing_sync_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      symbols_requested TEXT NOT NULL,
      filing_types TEXT NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      symbols_total INTEGER NOT NULL DEFAULT 0,
      symbols_processed INTEGER NOT NULL DEFAULT 0,
      filings_fetched INTEGER NOT NULL DEFAULT 0,
      filings_ingested INTEGER NOT NULL DEFAULT 0,
      chunks_created INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      error_message TEXT,
      trigger_source TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

describe("FilingsRepository", () => {
  let client: TursoClient;
  let repo: FilingsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new FilingsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates a filing", async () => {
    const input: CreateFilingInput = {
      id: "filing_1",
      accessionNumber: "0001234567-24-000001",
      symbol: "AAPL",
      filingType: "10-K",
      filedDate: "2024-01-15",
      reportDate: "2023-12-31",
      companyName: "Apple Inc.",
      cik: "0000320193",
      ingestedAt: "2024-01-16T10:00:00Z",
    };

    const filing = await repo.create(input);

    expect(filing).not.toBeNull();
    expect(filing.id).toBe("filing_1");
    expect(filing.accessionNumber).toBe("0001234567-24-000001");
    expect(filing.symbol).toBe("AAPL");
    expect(filing.filingType).toBe("10-K");
    expect(filing.status).toBe("pending");
    expect(filing.companyName).toBe("Apple Inc.");
  });

  test("finds filing by id", async () => {
    await repo.create({
      id: "filing_2",
      accessionNumber: "0001234567-24-000002",
      symbol: "MSFT",
      filingType: "10-Q",
      filedDate: "2024-02-01",
      ingestedAt: "2024-02-02T10:00:00Z",
    });

    const found = await repo.findById("filing_2");
    expect(found).not.toBeNull();
    expect(found!.symbol).toBe("MSFT");
    expect(found!.filingType).toBe("10-Q");
  });

  test("returns null for non-existent filing", async () => {
    const found = await repo.findById("nonexistent");
    expect(found).toBeNull();
  });

  test("finds filing by accession number", async () => {
    await repo.create({
      id: "filing_3",
      accessionNumber: "0001234567-24-000003",
      symbol: "GOOGL",
      filingType: "8-K",
      filedDate: "2024-03-01",
      ingestedAt: "2024-03-02T10:00:00Z",
    });

    const found = await repo.findByAccessionNumber("0001234567-24-000003");
    expect(found).not.toBeNull();
    expect(found!.symbol).toBe("GOOGL");
  });

  test("checks if accession number exists", async () => {
    await repo.create({
      id: "filing_4",
      accessionNumber: "0001234567-24-000004",
      symbol: "NVDA",
      filingType: "10-K",
      filedDate: "2024-04-01",
      ingestedAt: "2024-04-02T10:00:00Z",
    });

    const exists = await repo.existsByAccessionNumber("0001234567-24-000004");
    expect(exists).toBe(true);

    const notExists = await repo.existsByAccessionNumber("nonexistent");
    expect(notExists).toBe(false);
  });

  test("finds filings by symbol", async () => {
    await repo.create({
      id: "filing_5",
      accessionNumber: "0001234567-24-000005",
      symbol: "TSLA",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.create({
      id: "filing_6",
      accessionNumber: "0001234567-24-000006",
      symbol: "TSLA",
      filingType: "10-Q",
      filedDate: "2024-04-01",
      ingestedAt: "2024-04-02T10:00:00Z",
    });
    await repo.create({
      id: "filing_7",
      accessionNumber: "0001234567-24-000007",
      symbol: "AAPL",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });

    const tslaFilings = await repo.findBySymbol("TSLA");
    expect(tslaFilings).toHaveLength(2);
    expect(tslaFilings.every((f) => f.symbol === "TSLA")).toBe(true);
  });

  test("marks filing as processing", async () => {
    await repo.create({
      id: "filing_8",
      accessionNumber: "0001234567-24-000008",
      symbol: "AMD",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });

    await repo.markProcessing("filing_8");

    const found = await repo.findById("filing_8");
    expect(found!.status).toBe("processing");
  });

  test("marks filing as complete with counts", async () => {
    await repo.create({
      id: "filing_9",
      accessionNumber: "0001234567-24-000009",
      symbol: "INTC",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });

    await repo.markComplete("filing_9", 15, 45);

    const found = await repo.findById("filing_9");
    expect(found!.status).toBe("complete");
    expect(found!.sectionCount).toBe(15);
    expect(found!.chunkCount).toBe(45);
    expect(found!.completedAt).not.toBeNull();
  });

  test("marks filing as failed with error message", async () => {
    await repo.create({
      id: "filing_10",
      accessionNumber: "0001234567-24-000010",
      symbol: "META",
      filingType: "10-Q",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });

    await repo.markFailed("filing_10", "Failed to parse sections");

    const found = await repo.findById("filing_10");
    expect(found!.status).toBe("failed");
    expect(found!.errorMessage).toBe("Failed to parse sections");
  });

  test("gets stats by symbol", async () => {
    // Create multiple filings for same symbol
    await repo.create({
      id: "filing_11",
      accessionNumber: "0001234567-24-000011",
      symbol: "AMZN",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.markComplete("filing_11", 10, 30);

    await repo.create({
      id: "filing_12",
      accessionNumber: "0001234567-24-000012",
      symbol: "AMZN",
      filingType: "10-Q",
      filedDate: "2024-04-01",
      ingestedAt: "2024-04-02T10:00:00Z",
    });
    await repo.markComplete("filing_12", 8, 24);

    await repo.create({
      id: "filing_13",
      accessionNumber: "0001234567-24-000013",
      symbol: "AMZN",
      filingType: "8-K",
      filedDate: "2024-05-01",
      ingestedAt: "2024-05-02T10:00:00Z",
    });
    await repo.markComplete("filing_13", 3, 9);

    const stats = await repo.getStatsBySymbol("AMZN");
    expect(stats.total).toBe(3);
    expect(stats.byType["10-K"]).toBe(1);
    expect(stats.byType["10-Q"]).toBe(1);
    expect(stats.byType["8-K"]).toBe(1);
    expect(stats.lastIngested).not.toBeNull();
  });

  test("gets overall stats", async () => {
    await repo.create({
      id: "filing_14",
      accessionNumber: "0001234567-24-000014",
      symbol: "NFLX",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.markComplete("filing_14", 12, 36);

    await repo.create({
      id: "filing_15",
      accessionNumber: "0001234567-24-000015",
      symbol: "DIS",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.markComplete("filing_15", 14, 42);

    const stats = await repo.getOverallStats();
    expect(stats.total).toBe(2);
    expect(stats.totalChunks).toBe(78);
    expect(stats.byType["10-K"]).toBe(2);
  });

  test("finds recent filings for symbol", async () => {
    await repo.create({
      id: "filing_16",
      accessionNumber: "0001234567-24-000016",
      symbol: "PYPL",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.markComplete("filing_16", 10, 30);

    await repo.create({
      id: "filing_17",
      accessionNumber: "0001234567-24-000017",
      symbol: "PYPL",
      filingType: "10-Q",
      filedDate: "2024-04-01",
      ingestedAt: "2024-04-02T10:00:00Z",
    });
    await repo.markComplete("filing_17", 8, 24);

    // Pending filing should not be included
    await repo.create({
      id: "filing_18",
      accessionNumber: "0001234567-24-000018",
      symbol: "PYPL",
      filingType: "8-K",
      filedDate: "2024-05-01",
      ingestedAt: "2024-05-02T10:00:00Z",
    });

    const recent = await repo.findRecent("PYPL");
    expect(recent).toHaveLength(2);
    expect(recent.every((f) => f.status === "complete")).toBe(true);
  });

  test("finds recent filings filtered by type", async () => {
    await repo.create({
      id: "filing_19",
      accessionNumber: "0001234567-24-000019",
      symbol: "SQ",
      filingType: "10-K",
      filedDate: "2024-01-01",
      ingestedAt: "2024-01-02T10:00:00Z",
    });
    await repo.markComplete("filing_19", 10, 30);

    await repo.create({
      id: "filing_20",
      accessionNumber: "0001234567-24-000020",
      symbol: "SQ",
      filingType: "10-Q",
      filedDate: "2024-04-01",
      ingestedAt: "2024-04-02T10:00:00Z",
    });
    await repo.markComplete("filing_20", 8, 24);

    const tenKOnly = await repo.findRecent("SQ", "10-K");
    expect(tenKOnly).toHaveLength(1);
    expect(tenKOnly[0]!.filingType).toBe("10-K");
  });
});

describe("FilingSyncRunsRepository", () => {
  let client: TursoClient;
  let repo: FilingSyncRunsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new FilingSyncRunsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("starts a sync run", async () => {
    const input: CreateSyncRunInput = {
      id: "sync_1",
      symbolsRequested: ["AAPL", "MSFT", "GOOGL"],
      filingTypes: ["10-K", "10-Q"],
      symbolsTotal: 3,
      triggerSource: "manual",
      environment: "PAPER",
    };

    const run = await repo.start(input);

    expect(run).not.toBeNull();
    expect(run.id).toBe("sync_1");
    expect(run.symbolsRequested).toEqual(["AAPL", "MSFT", "GOOGL"]);
    expect(run.filingTypes).toEqual(["10-K", "10-Q"]);
    expect(run.status).toBe("running");
    expect(run.symbolsTotal).toBe(3);
    expect(run.triggerSource).toBe("manual");
    expect(run.environment).toBe("PAPER");
  });

  test("finds sync run by id", async () => {
    await repo.start({
      id: "sync_2",
      symbolsRequested: ["NVDA"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "scheduled",
      environment: "LIVE",
    });

    const found = await repo.findById("sync_2");
    expect(found).not.toBeNull();
    expect(found!.symbolsRequested).toEqual(["NVDA"]);
  });

  test("returns null for non-existent sync run", async () => {
    const found = await repo.findById("nonexistent");
    expect(found).toBeNull();
  });

  test("updates sync run progress", async () => {
    await repo.start({
      id: "sync_3",
      symbolsRequested: ["TSLA", "AMD"],
      filingTypes: ["10-K", "10-Q"],
      symbolsTotal: 2,
      triggerSource: "dashboard",
      environment: "PAPER",
    });

    await repo.updateProgress("sync_3", {
      symbolsProcessed: 1,
      filingsFetched: 5,
      filingsIngested: 4,
      chunksCreated: 120,
    });

    const found = await repo.findById("sync_3");
    expect(found!.symbolsProcessed).toBe(1);
    expect(found!.filingsFetched).toBe(5);
    expect(found!.filingsIngested).toBe(4);
    expect(found!.chunksCreated).toBe(120);
  });

  test("completes sync run", async () => {
    await repo.start({
      id: "sync_4",
      symbolsRequested: ["META"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });

    await repo.complete("sync_4", {
      filingsIngested: 10,
      chunksCreated: 300,
    });

    const found = await repo.findById("sync_4");
    expect(found!.status).toBe("completed");
    expect(found!.completedAt).not.toBeNull();
    expect(found!.filingsIngested).toBe(10);
    expect(found!.chunksCreated).toBe(300);
  });

  test("fails sync run with error", async () => {
    await repo.start({
      id: "sync_5",
      symbolsRequested: ["INTC"],
      filingTypes: ["8-K"],
      symbolsTotal: 1,
      triggerSource: "scheduled",
      environment: "LIVE",
    });

    await repo.fail("sync_5", "SEC API rate limited");

    const found = await repo.findById("sync_5");
    expect(found!.status).toBe("failed");
    expect(found!.completedAt).not.toBeNull();
    expect(found!.errorMessage).toBe("SEC API rate limited");
  });

  test("finds recent sync runs", async () => {
    await repo.start({
      id: "sync_6",
      symbolsRequested: ["A"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });
    await repo.start({
      id: "sync_7",
      symbolsRequested: ["B"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "scheduled",
      environment: "PAPER",
    });

    const recent = await repo.findRecent(5);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  test("finds running sync run", async () => {
    await repo.start({
      id: "sync_8",
      symbolsRequested: ["PYPL"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });

    const running = await repo.findRunning();
    expect(running).not.toBeNull();
    expect(running!.id).toBe("sync_8");
  });

  test("returns null when no running sync", async () => {
    await repo.start({
      id: "sync_9",
      symbolsRequested: ["SQ"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });
    await repo.complete("sync_9", { filingsIngested: 5, chunksCreated: 150 });

    const running = await repo.findRunning();
    expect(running).toBeNull();
  });

  test("gets last successful sync run", async () => {
    await repo.start({
      id: "sync_10",
      symbolsRequested: ["AMZN"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });
    await repo.complete("sync_10", { filingsIngested: 8, chunksCreated: 240 });

    await repo.start({
      id: "sync_11",
      symbolsRequested: ["DIS"],
      filingTypes: ["10-K"],
      symbolsTotal: 1,
      triggerSource: "scheduled",
      environment: "PAPER",
    });
    await repo.fail("sync_11", "Network error");

    const lastSuccess = await repo.getLastSuccessful();
    expect(lastSuccess).not.toBeNull();
    expect(lastSuccess!.id).toBe("sync_10");
    expect(lastSuccess!.status).toBe("completed");
  });

  test("handles optional date range", async () => {
    await repo.start({
      id: "sync_12",
      symbolsRequested: ["NFLX"],
      filingTypes: ["10-K", "10-Q"],
      dateRangeStart: "2024-01-01",
      dateRangeEnd: "2024-12-31",
      symbolsTotal: 1,
      triggerSource: "manual",
      environment: "PAPER",
    });

    const found = await repo.findById("sync_12");
    expect(found!.dateRangeStart).toBe("2024-01-01");
    expect(found!.dateRangeEnd).toBe("2024-12-31");
  });
});
