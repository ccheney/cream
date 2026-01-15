/**
 * Regime Labels Repository Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { MARKET_SYMBOL, type RegimeLabelInsert, RegimeLabelsRepository } from "./regime-labels.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS regime_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d', '1w')),
      regime TEXT NOT NULL CHECK (regime IN ('bull_trend', 'bear_trend', 'range_bound', 'high_volatility', 'low_volatility', 'crisis')),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      trend_strength REAL,
      volatility_percentile REAL,
      correlation_to_market REAL,
      model_name TEXT NOT NULL DEFAULT 'hmm_regime',
      model_version TEXT,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, timestamp, timeframe)
    )
  `);

	await client.run(
		`CREATE INDEX IF NOT EXISTS idx_regime_labels_symbol_timeframe ON regime_labels(symbol, timeframe)`
	);
	await client.run(
		`CREATE INDEX IF NOT EXISTS idx_regime_labels_timestamp ON regime_labels(timestamp)`
	);
}

describe("RegimeLabelsRepository", () => {
	let client: TursoClient;
	let repo: RegimeLabelsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new RegimeLabelsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	test("upserts a regime label", async () => {
		const label: RegimeLabelInsert = {
			symbol: "AAPL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1h",
			regime: "bull_trend",
			confidence: 0.85,
			trendStrength: 0.7,
			modelName: "hmm_regime",
		};

		await repo.upsert(label);

		const result = await repo.getCurrent("AAPL", "1h");
		expect(result).not.toBeNull();
		expect(result!.symbol).toBe("AAPL");
		expect(result!.regime).toBe("bull_trend");
		expect(result!.confidence).toBe(0.85);
		expect(result!.trendStrength).toBe(0.7);
	});

	test("upsert overwrites existing regime label", async () => {
		const label: RegimeLabelInsert = {
			symbol: "AAPL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1h",
			regime: "bull_trend",
			confidence: 0.8,
			modelName: "hmm_regime",
		};

		await repo.upsert(label);

		// Update same symbol/timestamp/timeframe with new regime
		await repo.upsert({
			...label,
			regime: "bear_trend",
			confidence: 0.9,
		});

		const result = await repo.getCurrent("AAPL", "1h");
		expect(result!.regime).toBe("bear_trend");
		expect(result!.confidence).toBe(0.9);
	});

	test("gets current regime for symbol", async () => {
		// Insert multiple timestamps
		await repo.upsert({
			symbol: "MSFT",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "range_bound",
			confidence: 0.7,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "MSFT",
			timestamp: "2024-01-02T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.85,
			modelName: "hmm_regime",
		});

		const current = await repo.getCurrent("MSFT", "1d");
		expect(current).not.toBeNull();
		expect(current!.timestamp).toBe("2024-01-02T10:00:00Z");
		expect(current!.regime).toBe("bull_trend");
	});

	test("returns null when no regime exists", async () => {
		const result = await repo.getCurrent("NONEXISTENT", "1h");
		expect(result).toBeNull();
	});

	test("gets market-wide regime", async () => {
		await repo.upsert({
			symbol: MARKET_SYMBOL,
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "high_volatility",
			confidence: 0.92,
			modelName: "hmm_regime",
		});

		const marketRegime = await repo.getMarketRegime("1d");
		expect(marketRegime).not.toBeNull();
		expect(marketRegime!.regime).toBe("high_volatility");
		expect(marketRegime!.confidence).toBe(0.92);
	});

	test("gets regime history for a symbol", async () => {
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-01T00:00:00Z",
			timeframe: "4h",
			regime: "range_bound",
			confidence: 0.6,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-02T00:00:00Z",
			timeframe: "4h",
			regime: "bull_trend",
			confidence: 0.75,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-03T00:00:00Z",
			timeframe: "4h",
			regime: "high_volatility",
			confidence: 0.8,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-04T00:00:00Z",
			timeframe: "4h",
			regime: "bear_trend",
			confidence: 0.7,
			modelName: "hmm_regime",
		});

		const history = await repo.getHistory(
			"GOOGL",
			"4h",
			"2024-01-02T00:00:00Z",
			"2024-01-03T23:59:59Z"
		);

		expect(history).toHaveLength(2);
		expect(history[0]!.timestamp).toBe("2024-01-02T00:00:00Z");
		expect(history[1]!.timestamp).toBe("2024-01-03T00:00:00Z");
	});

	test("gets symbols in a specific regime", async () => {
		// Insert current regimes for multiple symbols
		await repo.upsert({
			symbol: "AAPL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.85,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "MSFT",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.9,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bear_trend",
			confidence: 0.8,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "NVDA",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.4, // Below min confidence threshold
			modelName: "hmm_regime",
		});

		const bullSymbols = await repo.getSymbolsInRegime("bull_trend", "1d", 0.5);

		expect(bullSymbols).toHaveLength(2);
		expect(bullSymbols).toContain("AAPL");
		expect(bullSymbols).toContain("MSFT");
		expect(bullSymbols).not.toContain("NVDA"); // Below confidence threshold
	});

	test("excludes market symbol from getSymbolsInRegime", async () => {
		await repo.upsert({
			symbol: MARKET_SYMBOL,
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.9,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "AAPL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.85,
			modelName: "hmm_regime",
		});

		const symbols = await repo.getSymbolsInRegime("bull_trend", "1d");

		expect(symbols).toHaveLength(1);
		expect(symbols).toContain("AAPL");
		expect(symbols).not.toContain(MARKET_SYMBOL);
	});

	test("gets regime distribution", async () => {
		await repo.upsert({
			symbol: "AAPL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.85,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "MSFT",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.9,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "GOOGL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bear_trend",
			confidence: 0.8,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "NVDA",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "range_bound",
			confidence: 0.7,
			modelName: "hmm_regime",
		});

		const distribution = await repo.getRegimeDistribution("1d");

		expect(distribution.get("bull_trend")).toBe(2);
		expect(distribution.get("bear_trend")).toBe(1);
		expect(distribution.get("range_bound")).toBe(1);
	});

	test("deletes regime labels older than date", async () => {
		await repo.upsert({
			symbol: "OLD",
			timestamp: "2024-01-01T00:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.8,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "OLD2",
			timestamp: "2024-01-02T00:00:00Z",
			timeframe: "1d",
			regime: "bear_trend",
			confidence: 0.7,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "NEW",
			timestamp: "2024-01-03T00:00:00Z",
			timeframe: "1d",
			regime: "range_bound",
			confidence: 0.9,
			modelName: "hmm_regime",
		});

		const deleted = await repo.deleteOlderThan("2024-01-03T00:00:00Z");
		expect(deleted).toBe(2);

		const oldResult = await repo.getCurrent("OLD", "1d");
		expect(oldResult).toBeNull();

		const newResult = await repo.getCurrent("NEW", "1d");
		expect(newResult).not.toBeNull();
	});

	test("handles all optional fields", async () => {
		await repo.upsert({
			symbol: "FULL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1w",
			regime: "crisis",
			confidence: 0.95,
			trendStrength: 0.2,
			volatilityPercentile: 0.99,
			correlationToMarket: 0.85,
			modelName: "hmm_regime",
			modelVersion: "v2.1.0",
		});

		const result = await repo.getCurrent("FULL", "1w");
		expect(result).not.toBeNull();
		expect(result!.regime).toBe("crisis");
		expect(result!.trendStrength).toBe(0.2);
		expect(result!.volatilityPercentile).toBe(0.99);
		expect(result!.correlationToMarket).toBe(0.85);
		expect(result!.modelVersion).toBe("v2.1.0");
	});

	test("handles null optional fields", async () => {
		await repo.upsert({
			symbol: "MINIMAL",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1h",
			regime: "low_volatility",
			confidence: 0.75,
			modelName: "hmm_regime",
		});

		const result = await repo.getCurrent("MINIMAL", "1h");
		expect(result).not.toBeNull();
		expect(result!.trendStrength).toBeNull();
		expect(result!.volatilityPercentile).toBeNull();
		expect(result!.correlationToMarket).toBeNull();
		expect(result!.modelVersion).toBeNull();
	});

	test("uses default minConfidence of 0.5", async () => {
		await repo.upsert({
			symbol: "LOW_CONF",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.4,
			modelName: "hmm_regime",
		});
		await repo.upsert({
			symbol: "HIGH_CONF",
			timestamp: "2024-01-01T10:00:00Z",
			timeframe: "1d",
			regime: "bull_trend",
			confidence: 0.6,
			modelName: "hmm_regime",
		});

		// Default minConfidence is 0.5
		const symbols = await repo.getSymbolsInRegime("bull_trend", "1d");
		expect(symbols).toHaveLength(1);
		expect(symbols).toContain("HIGH_CONF");
	});
});
