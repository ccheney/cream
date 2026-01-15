/**
 * FundamentalsRepository Tests
 *
 * Tests for the Fundamental Indicators data layer.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import { type CreateFundamentalIndicatorsInput, FundamentalsRepository } from "./fundamentals.js";

// Helper to generate unique IDs for tests
let idCounter = 0;
function testId(prefix: string): string {
	return `${prefix}-${++idCounter}-${Date.now()}`;
}

async function setupTables(client: TursoClient): Promise<void> {
	// Create fundamental_indicators table (from migration 008)
	await client.run(`
    CREATE TABLE IF NOT EXISTS fundamental_indicators (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,

      pe_ratio_ttm REAL,
      pe_ratio_forward REAL,
      pb_ratio REAL,
      ev_ebitda REAL,
      earnings_yield REAL,
      dividend_yield REAL,
      cape_10yr REAL,

      gross_profitability REAL,
      roe REAL,
      roa REAL,
      asset_growth REAL,
      accruals_ratio REAL,
      cash_flow_quality REAL,
      beneish_m_score REAL,

      market_cap REAL,
      sector TEXT,
      industry TEXT,

      source TEXT NOT NULL DEFAULT 'computed',
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),

      UNIQUE(symbol, date)
    )
  `);

	await client.run(
		"CREATE INDEX IF NOT EXISTS idx_fundamental_symbol_date ON fundamental_indicators(symbol, date)"
	);
	await client.run(
		"CREATE INDEX IF NOT EXISTS idx_fundamental_symbol ON fundamental_indicators(symbol)"
	);
}

describe("FundamentalsRepository", () => {
	let client: TursoClient;
	let repo: FundamentalsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new FundamentalsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	// ========================================
	// Create Operations
	// ========================================

	describe("Create Operations", () => {
		test("creates a fundamental indicators record", async () => {
			const id = testId("fund");
			const input: CreateFundamentalIndicatorsInput = {
				id,
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.5,
				peRatioForward: 26.2,
				pbRatio: 45.3,
				evEbitda: 22.1,
				earningsYield: 0.035,
				dividendYield: 0.005,
				roe: 1.47,
				roa: 0.28,
				grossProfitability: 0.43,
				marketCap: 2800000000000,
				sector: "Technology",
				industry: "Consumer Electronics",
			};

			const result = await repo.create(input);

			expect(result.id).toBe(id);
			expect(result.symbol).toBe("AAPL");
			expect(result.date).toBe("2024-01-15");
			expect(result.peRatioTtm).toBe(28.5);
			expect(result.peRatioForward).toBe(26.2);
			expect(result.pbRatio).toBe(45.3);
			expect(result.evEbitda).toBe(22.1);
			expect(result.earningsYield).toBe(0.035);
			expect(result.dividendYield).toBe(0.005);
			expect(result.roe).toBe(1.47);
			expect(result.roa).toBe(0.28);
			expect(result.grossProfitability).toBe(0.43);
			expect(result.marketCap).toBe(2800000000000);
			expect(result.sector).toBe("Technology");
			expect(result.industry).toBe("Consumer Electronics");
			expect(result.source).toBe("computed");
		});

		test("creates with minimal input", async () => {
			const result = await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
			});

			expect(result.symbol).toBe("MSFT");
			expect(result.date).toBe("2024-01-15");
			expect(result.peRatioTtm).toBeNull();
			expect(result.sector).toBeNull();
			expect(result.source).toBe("computed");
		});

		test("upserts fundamental indicators", async () => {
			const symbol = "GOOGL";
			const date = "2024-01-15";

			// Create initial record
			await repo.upsert({
				id: testId("fund"),
				symbol,
				date,
				peRatioTtm: 25.0,
				roe: 0.2,
			});

			// Upsert with updated values
			const updated = await repo.upsert({
				id: testId("fund"),
				symbol,
				date,
				peRatioTtm: 26.5,
				roe: 0.22,
				roa: 0.15,
			});

			expect(updated.peRatioTtm).toBe(26.5);
			expect(updated.roe).toBe(0.22);
			expect(updated.roa).toBe(0.15);

			// Verify only one record exists
			const records = await repo.findBySymbol(symbol);
			expect(records).toHaveLength(1);
		});

		test("bulk upserts multiple records", async () => {
			const inputs: CreateFundamentalIndicatorsInput[] = [
				{ id: testId("fund"), symbol: "AAPL", date: "2024-01-15", peRatioTtm: 28.0 },
				{ id: testId("fund"), symbol: "MSFT", date: "2024-01-15", peRatioTtm: 35.0 },
				{ id: testId("fund"), symbol: "GOOGL", date: "2024-01-15", peRatioTtm: 25.0 },
			];

			const count = await repo.bulkUpsert(inputs);
			expect(count).toBe(3);

			const total = await repo.count();
			expect(total).toBe(3);
		});
	});

	// ========================================
	// Find Operations
	// ========================================

	describe("Find Operations", () => {
		test("finds by ID", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.5,
			});

			const found = await repo.findById(created.id);
			expect(found).not.toBeNull();
			expect(found!.symbol).toBe("AAPL");
			expect(found!.peRatioTtm).toBe(28.5);
		});

		test("returns null for non-existent ID", async () => {
			const found = await repo.findById("nonexistent");
			expect(found).toBeNull();
		});

		test("finds by symbol and date", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.5,
			});

			const found = await repo.findBySymbolAndDate("AAPL", "2024-01-15");
			expect(found).not.toBeNull();
			expect(found!.peRatioTtm).toBe(28.5);
		});

		test("finds latest by symbol", async () => {
			// Create multiple records for same symbol
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-10",
				peRatioTtm: 27.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.5,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-12",
				peRatioTtm: 27.5,
			});

			const latest = await repo.findLatestBySymbol("AAPL");
			expect(latest).not.toBeNull();
			expect(latest!.date).toBe("2024-01-15");
			expect(latest!.peRatioTtm).toBe(28.5);
		});

		test("finds latest by multiple symbols", async () => {
			// Create records for multiple symbols
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-10",
				peRatioTtm: 27.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.5,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-12",
				peRatioTtm: 34.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-14",
				peRatioTtm: 35.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "GOOGL",
				date: "2024-01-15",
				peRatioTtm: 25.0,
			});

			const latest = await repo.findLatestBySymbols(["AAPL", "MSFT", "GOOGL"]);
			expect(latest).toHaveLength(3);

			const aaplRecord = latest.find((r) => r.symbol === "AAPL");
			expect(aaplRecord?.date).toBe("2024-01-15");
			expect(aaplRecord?.peRatioTtm).toBe(28.5);

			const msftRecord = latest.find((r) => r.symbol === "MSFT");
			expect(msftRecord?.date).toBe("2024-01-14");
			expect(msftRecord?.peRatioTtm).toBe(35.0);
		});

		test("finds by symbol with date range", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-05",
				peRatioTtm: 26.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-10",
				peRatioTtm: 27.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.0,
			});
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-20",
				peRatioTtm: 29.0,
			});

			const filtered = await repo.findBySymbol("AAPL", {
				startDate: "2024-01-08",
				endDate: "2024-01-16",
			});

			expect(filtered).toHaveLength(2);
			expect(filtered.map((r) => r.date).sort()).toEqual(["2024-01-10", "2024-01-15"]);
		});

		test("finds by sector", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				sector: "Technology",
				industry: "Consumer Electronics",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
				sector: "Technology",
				industry: "Software",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "JPM",
				date: "2024-01-15",
				sector: "Financial Services",
				industry: "Banks",
			});

			const techRecords = await repo.findBySector("Technology");
			expect(techRecords).toHaveLength(2);
			expect(techRecords.map((r) => r.symbol).sort()).toEqual(["AAPL", "MSFT"]);
		});

		test("finds many with filters", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				sector: "Technology",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
				sector: "Technology",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "JPM",
				date: "2024-01-15",
				sector: "Financial Services",
			});

			const result = await repo.findMany({ sector: "Technology" });
			expect(result.data).toHaveLength(2);
			expect(result.total).toBe(2);
		});

		test("paginates results", async () => {
			// Create 10 records
			for (let i = 0; i < 10; i++) {
				await repo.create({
					id: testId("fund"),
					symbol: `SYM${i.toString().padStart(2, "0")}`,
					date: "2024-01-15",
				});
			}

			const page1 = await repo.findMany({}, { page: 1, pageSize: 3 });
			expect(page1.data).toHaveLength(3);
			expect(page1.total).toBe(10);
			expect(page1.page).toBe(1);
			expect(page1.totalPages).toBe(4);
			expect(page1.hasNext).toBe(true);
			expect(page1.hasPrev).toBe(false);

			const page2 = await repo.findMany({}, { page: 2, pageSize: 3 });
			expect(page2.data).toHaveLength(3);
			expect(page2.page).toBe(2);
			expect(page2.hasPrev).toBe(true);
		});
	});

	// ========================================
	// Update Operations
	// ========================================

	describe("Update Operations", () => {
		test("updates fundamental indicators", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.0,
				roe: 1.4,
			});

			const updated = await repo.update(created.id, {
				peRatioTtm: 29.0,
				roe: 1.5,
				roa: 0.3,
			});

			expect(updated.peRatioTtm).toBe(29.0);
			expect(updated.roe).toBe(1.5);
			expect(updated.roa).toBe(0.3);
		});

		test("update with no changes returns existing record", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				peRatioTtm: 28.0,
			});

			const updated = await repo.update(created.id, {});
			expect(updated.peRatioTtm).toBe(28.0);
		});

		test("update throws for non-existent ID", async () => {
			await expect(repo.update("nonexistent", { peRatioTtm: 30.0 })).rejects.toThrow(
				RepositoryError
			);
		});
	});

	// ========================================
	// Delete Operations
	// ========================================

	describe("Delete Operations", () => {
		test("deletes by ID", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
			});

			const deleted = await repo.delete(created.id);
			expect(deleted).toBe(true);

			const found = await repo.findById(created.id);
			expect(found).toBeNull();
		});

		test("delete returns false for non-existent ID", async () => {
			const deleted = await repo.delete("nonexistent");
			expect(deleted).toBe(false);
		});

		test("deletes by symbol and date", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
			});

			const deleted = await repo.deleteBySymbolAndDate("AAPL", "2024-01-15");
			expect(deleted).toBe(true);

			const found = await repo.findBySymbolAndDate("AAPL", "2024-01-15");
			expect(found).toBeNull();
		});

		test("deletes all by symbol", async () => {
			await repo.create({ id: testId("fund"), symbol: "AAPL", date: "2024-01-10" });
			await repo.create({ id: testId("fund"), symbol: "AAPL", date: "2024-01-15" });
			await repo.create({ id: testId("fund"), symbol: "MSFT", date: "2024-01-15" });

			const count = await repo.deleteBySymbol("AAPL");
			expect(count).toBe(2);

			const aaplRecords = await repo.findBySymbol("AAPL");
			expect(aaplRecords).toHaveLength(0);

			const msftRecords = await repo.findBySymbol("MSFT");
			expect(msftRecords).toHaveLength(1);
		});

		test("deletes older than date", async () => {
			await repo.create({ id: testId("fund"), symbol: "AAPL", date: "2024-01-05" });
			await repo.create({ id: testId("fund"), symbol: "AAPL", date: "2024-01-10" });
			await repo.create({ id: testId("fund"), symbol: "AAPL", date: "2024-01-15" });

			const count = await repo.deleteOlderThan("2024-01-10");
			expect(count).toBe(1);

			const remaining = await repo.findBySymbol("AAPL");
			expect(remaining).toHaveLength(2);
			expect(remaining.map((r) => r.date).sort()).toEqual(["2024-01-10", "2024-01-15"]);
		});
	});

	// ========================================
	// Aggregation Operations
	// ========================================

	describe("Aggregation Operations", () => {
		test("gets distinct sectors", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				sector: "Technology",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "JPM",
				date: "2024-01-15",
				sector: "Financial Services",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "XOM",
				date: "2024-01-15",
				sector: "Energy",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
				sector: "Technology",
			});

			const sectors = await repo.getDistinctSectors();
			expect(sectors.sort()).toEqual(["Energy", "Financial Services", "Technology"]);
		});

		test("gets distinct industries", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				sector: "Technology",
				industry: "Consumer Electronics",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
				sector: "Technology",
				industry: "Software",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "JPM",
				date: "2024-01-15",
				sector: "Financial Services",
				industry: "Banks",
			});

			const allIndustries = await repo.getDistinctIndustries();
			expect(allIndustries.sort()).toEqual(["Banks", "Consumer Electronics", "Software"]);

			const techIndustries = await repo.getDistinctIndustries("Technology");
			expect(techIndustries.sort()).toEqual(["Consumer Electronics", "Software"]);
		});

		test("counts with filters", async () => {
			await repo.create({
				id: testId("fund"),
				symbol: "AAPL",
				date: "2024-01-15",
				sector: "Technology",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "MSFT",
				date: "2024-01-15",
				sector: "Technology",
			});
			await repo.create({
				id: testId("fund"),
				symbol: "JPM",
				date: "2024-01-15",
				sector: "Financial Services",
			});

			expect(await repo.count()).toBe(3);
			expect(await repo.count({ sector: "Technology" })).toBe(2);
			expect(await repo.count({ symbol: "AAPL" })).toBe(1);
		});
	});

	// ========================================
	// Edge Cases
	// ========================================

	describe("Edge Cases", () => {
		test("handles all numeric fields", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "TEST",
				date: "2024-01-15",
				peRatioTtm: 28.5,
				peRatioForward: 26.2,
				pbRatio: 45.3,
				evEbitda: 22.1,
				earningsYield: 0.035,
				dividendYield: 0.005,
				cape10yr: 32.5,
				grossProfitability: 0.43,
				roe: 1.47,
				roa: 0.28,
				assetGrowth: 0.12,
				accrualsRatio: 0.05,
				cashFlowQuality: 0.85,
				beneishMScore: -2.5,
				marketCap: 2800000000000,
			});

			expect(created.peRatioTtm).toBe(28.5);
			expect(created.peRatioForward).toBe(26.2);
			expect(created.pbRatio).toBe(45.3);
			expect(created.evEbitda).toBe(22.1);
			expect(created.earningsYield).toBe(0.035);
			expect(created.dividendYield).toBe(0.005);
			expect(created.cape10yr).toBe(32.5);
			expect(created.grossProfitability).toBe(0.43);
			expect(created.roe).toBe(1.47);
			expect(created.roa).toBe(0.28);
			expect(created.assetGrowth).toBe(0.12);
			expect(created.accrualsRatio).toBe(0.05);
			expect(created.cashFlowQuality).toBe(0.85);
			expect(created.beneishMScore).toBe(-2.5);
			expect(created.marketCap).toBe(2800000000000);
		});

		test("handles null values correctly", async () => {
			const created = await repo.create({
				id: testId("fund"),
				symbol: "TEST",
				date: "2024-01-15",
				peRatioTtm: null,
				sector: null,
			});

			expect(created.peRatioTtm).toBeNull();
			expect(created.sector).toBeNull();
		});

		test("handles empty symbol list in findLatestBySymbols", async () => {
			const result = await repo.findLatestBySymbols([]);
			expect(result).toHaveLength(0);
		});

		test("handles empty input in bulkUpsert", async () => {
			const count = await repo.bulkUpsert([]);
			expect(count).toBe(0);
		});

		test("findByIdOrThrow throws for non-existent", async () => {
			await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
		});
	});
});
