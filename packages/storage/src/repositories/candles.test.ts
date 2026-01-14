/**
 * Candles Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type CandleInsert, CandlesRepository } from "./candles.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS candles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w')),
      timestamp TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL DEFAULT 0,
      vwap REAL,
      trade_count INTEGER,
      adjusted INTEGER NOT NULL DEFAULT 0,
      split_adjusted INTEGER NOT NULL DEFAULT 0,
      dividend_adjusted INTEGER NOT NULL DEFAULT 0,
      quality_flags TEXT,
      provider TEXT NOT NULL DEFAULT 'alpaca',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, timeframe, timestamp)
    )
  `);

	await client.run(
		`CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe ON candles(symbol, timeframe)`
	);
	await client.run(`CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp)`);
}

describe("CandlesRepository", () => {
	let client: TursoClient;
	let repo: CandlesRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new CandlesRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	test("upserts a single candle", async () => {
		const candle: CandleInsert = {
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 150.0,
			high: 152.0,
			low: 149.0,
			close: 151.5,
			volume: 1000000,
			vwap: 150.75,
			tradeCount: 5000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		};

		await repo.upsert(candle);

		const result = await repo.getLastCandle("AAPL", "1h");
		expect(result).not.toBeNull();
		expect(result!.symbol).toBe("AAPL");
		expect(result!.timeframe).toBe("1h");
		expect(result!.open).toBe(150.0);
		expect(result!.close).toBe(151.5);
		expect(result!.volume).toBe(1000000);
		expect(result!.vwap).toBe(150.75);
	});

	test("bulk upserts candles", async () => {
		const candles: CandleInsert[] = [
			{
				symbol: "MSFT",
				timeframe: "1d",
				timestamp: "2024-01-01T00:00:00Z",
				open: 400.0,
				high: 410.0,
				low: 398.0,
				close: 408.0,
				volume: 5000000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "MSFT",
				timeframe: "1d",
				timestamp: "2024-01-02T00:00:00Z",
				open: 408.0,
				high: 415.0,
				low: 405.0,
				close: 412.0,
				volume: 4500000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
		];

		const count = await repo.bulkUpsert(candles);
		expect(count).toBe(2);

		const fetched = await repo.getLatest("MSFT", "1d", 10);
		expect(fetched).toHaveLength(2);
	});

	test("upsert overwrites existing candle", async () => {
		const candle: CandleInsert = {
			symbol: "GOOGL",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 140.0,
			high: 142.0,
			low: 139.0,
			close: 141.0,
			volume: 500000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		};

		await repo.upsert(candle);

		// Upsert with updated close price
		await repo.upsert({
			...candle,
			close: 143.0,
			volume: 600000,
		});

		const result = await repo.getLastCandle("GOOGL", "1h");
		expect(result!.close).toBe(143.0);
		expect(result!.volume).toBe(600000);
	});

	test("gets candles by date range", async () => {
		await repo.bulkUpsert([
			{
				symbol: "QQQ",
				timeframe: "1d",
				timestamp: "2024-01-01T00:00:00Z",
				open: 400,
				high: 402,
				low: 399,
				close: 401,
				volume: 1000000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "QQQ",
				timeframe: "1d",
				timestamp: "2024-01-02T00:00:00Z",
				open: 401,
				high: 405,
				low: 400,
				close: 404,
				volume: 1100000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "QQQ",
				timeframe: "1d",
				timestamp: "2024-01-03T00:00:00Z",
				open: 404,
				high: 408,
				low: 403,
				close: 407,
				volume: 1200000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "QQQ",
				timeframe: "1d",
				timestamp: "2024-01-04T00:00:00Z",
				open: 407,
				high: 410,
				low: 405,
				close: 409,
				volume: 1000000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
		]);

		const candles = await repo.getRange(
			"QQQ",
			"1d",
			"2024-01-02T00:00:00Z",
			"2024-01-03T23:59:59Z"
		);

		expect(candles).toHaveLength(2);
		expect(candles[0]!.timestamp).toBe("2024-01-02T00:00:00Z");
		expect(candles[1]!.timestamp).toBe("2024-01-03T00:00:00Z");
	});

	test("gets latest candles respects limit", async () => {
		for (let i = 0; i < 10; i++) {
			await repo.upsert({
				symbol: "TEST",
				timeframe: "1m",
				timestamp: `2024-01-01T10:0${i}:00Z`,
				open: 100 + i,
				high: 101 + i,
				low: 99 + i,
				close: 100.5 + i,
				volume: 10000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			});
		}

		const limited = await repo.getLatest("TEST", "1m", 5);
		expect(limited).toHaveLength(5);
		// Should be in ascending order
		expect(limited[0]!.open).toBeLessThan(limited[4]!.open);
	});

	test("gets last candle", async () => {
		await repo.bulkUpsert([
			{
				symbol: "NVDA",
				timeframe: "1h",
				timestamp: "2024-01-01T10:00:00Z",
				open: 500,
				high: 510,
				low: 498,
				close: 505,
				volume: 2000000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "NVDA",
				timeframe: "1h",
				timestamp: "2024-01-01T11:00:00Z",
				open: 505,
				high: 515,
				low: 503,
				close: 512,
				volume: 1800000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "NVDA",
				timeframe: "1h",
				timestamp: "2024-01-01T12:00:00Z",
				open: 512,
				high: 520,
				low: 510,
				close: 518,
				volume: 1500000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
		]);

		const latest = await repo.getLastCandle("NVDA", "1h");
		expect(latest).not.toBeNull();
		expect(latest!.timestamp).toBe("2024-01-01T12:00:00Z");
		expect(latest!.close).toBe(518);
	});

	test("returns null when no candle exists", async () => {
		const latest = await repo.getLastCandle("NONEXISTENT", "1h");
		expect(latest).toBeNull();
	});

	test("gets candle count", async () => {
		await repo.bulkUpsert([
			{
				symbol: "AMD",
				timeframe: "1h",
				timestamp: "2024-01-01T10:00:00Z",
				open: 150,
				high: 152,
				low: 149,
				close: 151,
				volume: 500000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "AMD",
				timeframe: "1h",
				timestamp: "2024-01-01T11:00:00Z",
				open: 151,
				high: 153,
				low: 150,
				close: 152,
				volume: 450000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "AMD",
				timeframe: "1d",
				timestamp: "2024-01-01T00:00:00Z",
				open: 149,
				high: 153,
				low: 148,
				close: 152,
				volume: 2000000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
		]);

		const hourlyCount = await repo.count("AMD", "1h");
		expect(hourlyCount).toBe(2);

		const dailyCount = await repo.count("AMD", "1d");
		expect(dailyCount).toBe(1);
	});

	test("deletes candles older than date", async () => {
		await repo.bulkUpsert([
			{
				symbol: "DEL",
				timeframe: "1d",
				timestamp: "2024-01-01T00:00:00Z",
				open: 100,
				high: 101,
				low: 99,
				close: 100,
				volume: 10000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "DEL",
				timeframe: "1d",
				timestamp: "2024-01-02T00:00:00Z",
				open: 100,
				high: 102,
				low: 99,
				close: 101,
				volume: 11000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
			{
				symbol: "DEL",
				timeframe: "1d",
				timestamp: "2024-01-03T00:00:00Z",
				open: 101,
				high: 103,
				low: 100,
				close: 102,
				volume: 12000,
				adjusted: false,
				splitAdjusted: false,
				dividendAdjusted: false,
				provider: "polygon",
			},
		]);

		const deleted = await repo.deleteOlderThan("DEL", "1d", "2024-01-03T00:00:00Z");
		expect(deleted).toBe(2);

		const remaining = await repo.getLatest("DEL", "1d", 10);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]!.timestamp).toBe("2024-01-03T00:00:00Z");
	});

	test("gets symbols with candle data", async () => {
		await repo.upsert({
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 100000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		});
		await repo.upsert({
			symbol: "MSFT",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 400,
			high: 405,
			low: 398,
			close: 403,
			volume: 80000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timeframe: "1d",
			timestamp: "2024-01-01T00:00:00Z",
			open: 140,
			high: 145,
			low: 139,
			close: 143,
			volume: 50000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		});

		const allSymbols = await repo.getSymbols();
		expect(allSymbols).toHaveLength(3);
		expect(allSymbols).toContain("AAPL");
		expect(allSymbols).toContain("MSFT");
		expect(allSymbols).toContain("GOOGL");

		const hourlySymbols = await repo.getSymbols("1h");
		expect(hourlySymbols).toHaveLength(2);
		expect(hourlySymbols).not.toContain("GOOGL");
	});

	test("handles null optional fields", async () => {
		await repo.upsert({
			symbol: "NULL",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 100,
			high: 101,
			low: 99,
			close: 100.5,
			volume: 10000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "polygon",
		});

		const candle = await repo.getLastCandle("NULL", "1h");
		expect(candle).not.toBeNull();
		expect(candle!.vwap).toBeNull();
		expect(candle!.tradeCount).toBeNull();
	});

	test("bulkUpsert returns 0 for empty array", async () => {
		const count = await repo.bulkUpsert([]);
		expect(count).toBe(0);
	});

	test("handles adjusted flags correctly", async () => {
		await repo.upsert({
			symbol: "ADJ",
			timeframe: "1d",
			timestamp: "2024-01-01T00:00:00Z",
			open: 100,
			high: 105,
			low: 99,
			close: 104,
			volume: 50000,
			adjusted: true,
			splitAdjusted: true,
			dividendAdjusted: false,
			provider: "polygon",
		});

		const candle = await repo.getLastCandle("ADJ", "1d");
		expect(candle).not.toBeNull();
		expect(candle!.adjusted).toBe(true);
		expect(candle!.splitAdjusted).toBe(true);
		expect(candle!.dividendAdjusted).toBe(false);
	});

	test("handles quality flags array", async () => {
		await repo.upsert({
			symbol: "FLAGS",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 100,
			high: 105,
			low: 99,
			close: 104,
			volume: 50000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			qualityFlags: ["gap_filled", "low_volume"],
			provider: "polygon",
		});

		const candle = await repo.getLastCandle("FLAGS", "1h");
		expect(candle).not.toBeNull();
		expect(candle!.qualityFlags).toEqual(["gap_filled", "low_volume"]);
	});

	test("stores provider correctly", async () => {
		await repo.upsert({
			symbol: "PROV",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00Z",
			open: 100,
			high: 105,
			low: 99,
			close: 104,
			volume: 50000,
			adjusted: false,
			splitAdjusted: false,
			dividendAdjusted: false,
			provider: "alpaca",
		});

		const candle = await repo.getLastCandle("PROV", "1h");
		expect(candle).not.toBeNull();
		expect(candle!.provider).toBe("alpaca");
	});
});
