/**
 * Universe Cache Repository Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type UniverseCacheInsert, UniverseCacheRepository } from "./universe-cache.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS universe_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK (source_type IN ('index', 'etf', 'screener', 'static', 'custom')),
      source_id TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      tickers TEXT NOT NULL,
      ticker_count INTEGER NOT NULL,
      metadata TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      provider TEXT,
      UNIQUE(source_type, source_id)
    )
  `);
}

// Helper to format date as SQLite datetime format (YYYY-MM-DD HH:MM:SS)
function toSqliteDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
}

// Helper to get a future date in SQLite format
function getFutureDate(hours: number): string {
	return toSqliteDate(new Date(Date.now() + hours * 60 * 60 * 1000));
}

// Helper to get a past date in SQLite format
function getPastDate(hours: number): string {
	return toSqliteDate(new Date(Date.now() - hours * 60 * 60 * 1000));
}

describe("UniverseCacheRepository", () => {
	let client: TursoClient;
	let repo: UniverseCacheRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new UniverseCacheRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	test("sets and gets a cached universe", async () => {
		const cache: UniverseCacheInsert = {
			sourceType: "index",
			sourceId: "SP500",
			sourceHash: "abc123",
			tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"],
			expiresAt: getFutureDate(24),
			provider: "alpaca",
		};

		await repo.set(cache);

		const result = await repo.get("index", "SP500");
		expect(result).not.toBeNull();
		expect(result!.sourceType).toBe("index");
		expect(result!.sourceId).toBe("SP500");
		expect(result!.sourceHash).toBe("abc123");
		expect(result!.tickers).toEqual(["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]);
		expect(result!.tickerCount).toBe(5);
		expect(result!.provider).toBe("alpaca");
	});

	test("returns null for expired cache", async () => {
		const cache: UniverseCacheInsert = {
			sourceType: "etf",
			sourceId: "QQQ",
			sourceHash: "xyz789",
			tickers: ["AAPL", "MSFT"],
			expiresAt: getPastDate(1), // Expired 1 hour ago
		};

		await repo.set(cache);

		const result = await repo.get("etf", "QQQ");
		expect(result).toBeNull();
	});

	test("returns null for non-existent cache", async () => {
		const result = await repo.get("index", "NONEXISTENT");
		expect(result).toBeNull();
	});

	test("updates existing cache on conflict", async () => {
		await repo.set({
			sourceType: "index",
			sourceId: "SP500",
			sourceHash: "hash1",
			tickers: ["AAPL", "MSFT"],
			expiresAt: getFutureDate(24),
		});

		// Update with new data
		await repo.set({
			sourceType: "index",
			sourceId: "SP500",
			sourceHash: "hash2",
			tickers: ["AAPL", "MSFT", "GOOGL", "AMZN"],
			expiresAt: getFutureDate(48),
		});

		const result = await repo.get("index", "SP500");
		expect(result!.sourceHash).toBe("hash2");
		expect(result!.tickers).toHaveLength(4);
		expect(result!.tickerCount).toBe(4);
	});

	test("gets cache by hash", async () => {
		await repo.set({
			sourceType: "screener",
			sourceId: "tech-growth",
			sourceHash: "screener-hash-123",
			tickers: ["NVDA", "AMD", "CRM"],
			expiresAt: getFutureDate(12),
		});

		const result = await repo.getByHash("screener-hash-123");
		expect(result).not.toBeNull();
		expect(result!.sourceId).toBe("tech-growth");
		expect(result!.tickers).toEqual(["NVDA", "AMD", "CRM"]);
	});

	test("getByHash returns null for expired cache", async () => {
		await repo.set({
			sourceType: "screener",
			sourceId: "expired-screener",
			sourceHash: "expired-hash",
			tickers: ["AAPL"],
			expiresAt: getPastDate(1),
		});

		const result = await repo.getByHash("expired-hash");
		expect(result).toBeNull();
	});

	test("deletes a cached universe", async () => {
		await repo.set({
			sourceType: "static",
			sourceId: "my-watchlist",
			sourceHash: "static-hash",
			tickers: ["AAPL", "TSLA"],
			expiresAt: getFutureDate(24),
		});

		const deleted = await repo.delete("static", "my-watchlist");
		expect(deleted).toBe(true);

		const result = await repo.get("static", "my-watchlist");
		expect(result).toBeNull();
	});

	test("delete returns false for non-existent cache", async () => {
		const deleted = await repo.delete("index", "NONEXISTENT");
		expect(deleted).toBe(false);
	});

	test("purges expired cache entries", async () => {
		// Add expired entries
		await repo.set({
			sourceType: "index",
			sourceId: "expired1",
			sourceHash: "exp1",
			tickers: ["A"],
			expiresAt: getPastDate(2),
		});
		await repo.set({
			sourceType: "index",
			sourceId: "expired2",
			sourceHash: "exp2",
			tickers: ["B"],
			expiresAt: getPastDate(1),
		});

		// Add valid entry
		await repo.set({
			sourceType: "index",
			sourceId: "valid",
			sourceHash: "valid-hash",
			tickers: ["C"],
			expiresAt: getFutureDate(24),
		});

		const purged = await repo.purgeExpired();
		expect(purged).toBe(2);

		// Valid entry should still exist
		const valid = await repo.get("index", "valid");
		expect(valid).not.toBeNull();
	});

	test("lists all valid sources", async () => {
		await repo.set({
			sourceType: "index",
			sourceId: "SP500",
			sourceHash: "h1",
			tickers: ["AAPL"],
			expiresAt: getFutureDate(24),
		});
		await repo.set({
			sourceType: "etf",
			sourceId: "QQQ",
			sourceHash: "h2",
			tickers: ["MSFT"],
			expiresAt: getFutureDate(24),
		});
		await repo.set({
			sourceType: "custom",
			sourceId: "my-picks",
			sourceHash: "h3",
			tickers: ["GOOGL"],
			expiresAt: getPastDate(1), // Expired, should not be listed
		});

		const sources = await repo.listSources();
		expect(sources).toHaveLength(2);
		expect(sources).toContainEqual({ sourceType: "etf", sourceId: "QQQ" });
		expect(sources).toContainEqual({ sourceType: "index", sourceId: "SP500" });
	});

	test("handles metadata correctly", async () => {
		await repo.set({
			sourceType: "screener",
			sourceId: "momentum",
			sourceHash: "mom-hash",
			tickers: ["AAPL", "NVDA"],
			expiresAt: getFutureDate(24),
			metadata: {
				minVolume: 1000000,
				minPrice: 10,
				maxRsi: 70,
				sector: "Technology",
			},
		});

		const result = await repo.get("screener", "momentum");
		expect(result).not.toBeNull();
		expect(result!.metadata).toEqual({
			minVolume: 1000000,
			minPrice: 10,
			maxRsi: 70,
			sector: "Technology",
		});
	});

	test("handles null optional fields", async () => {
		await repo.set({
			sourceType: "static",
			sourceId: "minimal",
			sourceHash: "min-hash",
			tickers: ["SPY"],
			expiresAt: getFutureDate(24),
		});

		const result = await repo.get("static", "minimal");
		expect(result).not.toBeNull();
		expect(result!.metadata).toBeNull();
		expect(result!.provider).toBeNull();
	});

	test("computes tickerCount from tickers array", async () => {
		await repo.set({
			sourceType: "index",
			sourceId: "DOW30",
			sourceHash: "dow-hash",
			tickers: ["AAPL", "MSFT", "JNJ", "V", "JPM"],
			expiresAt: getFutureDate(24),
		});

		const result = await repo.get("index", "DOW30");
		expect(result!.tickerCount).toBe(5);
	});

	test("handles all source types", async () => {
		const sourceTypes = ["index", "etf", "screener", "static", "custom"] as const;

		for (const sourceType of sourceTypes) {
			await repo.set({
				sourceType,
				sourceId: `test-${sourceType}`,
				sourceHash: `hash-${sourceType}`,
				tickers: ["TEST"],
				expiresAt: getFutureDate(24),
			});

			const result = await repo.get(sourceType, `test-${sourceType}`);
			expect(result).not.toBeNull();
			expect(result!.sourceType).toBe(sourceType);
		}
	});
});
