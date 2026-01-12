/**
 * Features Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type FeatureInsert, FeaturesRepository } from "./features.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w')),
      indicator_name TEXT NOT NULL,
      raw_value REAL NOT NULL,
      normalized_value REAL,
      parameters TEXT,
      quality_score REAL CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, timestamp, timeframe, indicator_name)
    )
  `);
}

describe("FeaturesRepository", () => {
  let client: TursoClient;
  let repo: FeaturesRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new FeaturesRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("upserts a feature", async () => {
    const feature: FeatureInsert = {
      symbol: "AAPL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 65.5,
      normalizedValue: 0.655,
      qualityScore: 0.95,
    };

    await repo.upsert(feature);

    const result = await repo.getAtTimestamp("AAPL", "2024-01-01T10:00:00Z", "1h");
    expect(result).toHaveLength(1);
    expect(result[0]!.indicatorName).toBe("RSI");
    expect(result[0]!.rawValue).toBe(65.5);
    expect(result[0]!.normalizedValue).toBe(0.655);
  });

  test("upsert overwrites existing feature", async () => {
    await repo.upsert({
      symbol: "AAPL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 60.0,
    });

    await repo.upsert({
      symbol: "AAPL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 70.0,
      normalizedValue: 0.7,
    });

    const result = await repo.getAtTimestamp("AAPL", "2024-01-01T10:00:00Z", "1h");
    expect(result).toHaveLength(1);
    expect(result[0]!.rawValue).toBe(70.0);
    expect(result[0]!.normalizedValue).toBe(0.7);
  });

  test("bulk upserts features", async () => {
    const features: FeatureInsert[] = [
      {
        symbol: "MSFT",
        timestamp: "2024-01-01T10:00:00Z",
        timeframe: "1d",
        indicatorName: "SMA_20",
        rawValue: 375.5,
      },
      {
        symbol: "MSFT",
        timestamp: "2024-01-01T10:00:00Z",
        timeframe: "1d",
        indicatorName: "EMA_20",
        rawValue: 376.2,
      },
      {
        symbol: "MSFT",
        timestamp: "2024-01-01T10:00:00Z",
        timeframe: "1d",
        indicatorName: "RSI",
        rawValue: 55.0,
      },
    ];

    const count = await repo.bulkUpsert(features);
    expect(count).toBe(3);

    const result = await repo.getAtTimestamp("MSFT", "2024-01-01T10:00:00Z", "1d");
    expect(result).toHaveLength(3);
  });

  test("bulkUpsert returns 0 for empty array", async () => {
    const count = await repo.bulkUpsert([]);
    expect(count).toBe(0);
  });

  test("gets features at timestamp", async () => {
    await repo.upsert({
      symbol: "GOOGL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "ATR",
      rawValue: 2.5,
    });
    await repo.upsert({
      symbol: "GOOGL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "MACD",
      rawValue: 1.2,
    });
    await repo.upsert({
      symbol: "GOOGL",
      timestamp: "2024-01-01T11:00:00Z",
      timeframe: "1h",
      indicatorName: "ATR",
      rawValue: 2.7,
    });

    const result = await repo.getAtTimestamp("GOOGL", "2024-01-01T10:00:00Z", "1h");
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.indicatorName)).toContain("ATR");
    expect(result.map((f) => f.indicatorName)).toContain("MACD");
  });

  test("gets indicator range", async () => {
    await repo.upsert({
      symbol: "NVDA",
      timestamp: "2024-01-01T09:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 50.0,
    });
    await repo.upsert({
      symbol: "NVDA",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 55.0,
    });
    await repo.upsert({
      symbol: "NVDA",
      timestamp: "2024-01-01T11:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 60.0,
    });
    await repo.upsert({
      symbol: "NVDA",
      timestamp: "2024-01-01T12:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 65.0,
    });

    const range = await repo.getIndicatorRange(
      "NVDA",
      "RSI",
      "1h",
      "2024-01-01T10:00:00Z",
      "2024-01-01T11:30:00Z"
    );

    expect(range).toHaveLength(2);
    expect(range[0]!.rawValue).toBe(55.0);
    expect(range[1]!.rawValue).toBe(60.0);
  });

  test("gets latest features", async () => {
    await repo.upsert({
      symbol: "AMD",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 50.0,
    });
    await repo.upsert({
      symbol: "AMD",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "MACD",
      rawValue: 1.0,
    });
    await repo.upsert({
      symbol: "AMD",
      timestamp: "2024-01-01T11:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 55.0,
    });
    await repo.upsert({
      symbol: "AMD",
      timestamp: "2024-01-01T11:00:00Z",
      timeframe: "1h",
      indicatorName: "MACD",
      rawValue: 1.5,
    });

    const latest = await repo.getLatest("AMD", "1h");
    expect(latest).toHaveLength(2);
    expect(latest.every((f) => f.timestamp === "2024-01-01T11:00:00Z")).toBe(true);
  });

  test("gets latest features filtered by indicator names", async () => {
    await repo.upsert({
      symbol: "TSM",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1d",
      indicatorName: "RSI",
      rawValue: 60.0,
    });
    await repo.upsert({
      symbol: "TSM",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1d",
      indicatorName: "MACD",
      rawValue: 2.0,
    });
    await repo.upsert({
      symbol: "TSM",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1d",
      indicatorName: "ATR",
      rawValue: 5.0,
    });

    const filtered = await repo.getLatest("TSM", "1d", ["RSI", "MACD"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.indicatorName)).toContain("RSI");
    expect(filtered.map((f) => f.indicatorName)).toContain("MACD");
    expect(filtered.map((f) => f.indicatorName)).not.toContain("ATR");
  });

  test("returns empty array when no latest features exist", async () => {
    const latest = await repo.getLatest("NONEXISTENT", "1h");
    expect(latest).toHaveLength(0);
  });

  test("lists available indicators", async () => {
    await repo.upsert({
      symbol: "META",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 55.0,
    });
    await repo.upsert({
      symbol: "META",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "ATR",
      rawValue: 3.0,
    });
    await repo.upsert({
      symbol: "META",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "MACD",
      rawValue: 0.5,
    });

    const indicators = await repo.listIndicators("META", "1h");
    expect(indicators).toHaveLength(3);
    expect(indicators).toContain("RSI");
    expect(indicators).toContain("ATR");
    expect(indicators).toContain("MACD");
    // Should be sorted alphabetically
    expect(indicators[0]).toBe("ATR");
    expect(indicators[1]).toBe("MACD");
    expect(indicators[2]).toBe("RSI");
  });

  test("deletes features older than date", async () => {
    await repo.upsert({
      symbol: "OLD",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 50.0,
    });
    await repo.upsert({
      symbol: "OLD",
      timestamp: "2024-01-02T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 55.0,
    });
    await repo.upsert({
      symbol: "NEW",
      timestamp: "2024-01-03T10:00:00Z",
      timeframe: "1h",
      indicatorName: "RSI",
      rawValue: 60.0,
    });

    const deleted = await repo.deleteOlderThan("2024-01-03T00:00:00Z");
    expect(deleted).toBe(2);

    const remaining = await repo.getAtTimestamp("NEW", "2024-01-03T10:00:00Z", "1h");
    expect(remaining).toHaveLength(1);
  });

  test("handles parameters JSON field", async () => {
    await repo.upsert({
      symbol: "PARAMS",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "SMA",
      rawValue: 100.0,
      parameters: { period: 20, source: "close" },
    });

    const result = await repo.getAtTimestamp("PARAMS", "2024-01-01T10:00:00Z", "1h");
    expect(result[0]!.parameters).toEqual({ period: 20, source: "close" });
  });

  test("handles null optional fields", async () => {
    await repo.upsert({
      symbol: "MINIMAL",
      timestamp: "2024-01-01T10:00:00Z",
      timeframe: "1h",
      indicatorName: "CUSTOM",
      rawValue: 42.0,
    });

    const result = await repo.getAtTimestamp("MINIMAL", "2024-01-01T10:00:00Z", "1h");
    expect(result[0]!.normalizedValue).toBeNull();
    expect(result[0]!.parameters).toBeNull();
    expect(result[0]!.qualityScore).toBeNull();
  });

  test("handles all timeframes", async () => {
    const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;

    for (const timeframe of timeframes) {
      await repo.upsert({
        symbol: `TF_${timeframe}`,
        timestamp: "2024-01-01T10:00:00Z",
        timeframe,
        indicatorName: "TEST",
        rawValue: 1.0,
      });
    }

    for (const timeframe of timeframes) {
      const result = await repo.getAtTimestamp(
        `TF_${timeframe}`,
        "2024-01-01T10:00:00Z",
        timeframe
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.timeframe).toBe(timeframe);
    }
  });

  test("returns empty array for non-existent symbol", async () => {
    const result = await repo.getAtTimestamp("NONEXISTENT", "2024-01-01T10:00:00Z", "1h");
    expect(result).toHaveLength(0);
  });

  test("returns empty array for non-existent indicator", async () => {
    const result = await repo.listIndicators("NONEXISTENT", "1h");
    expect(result).toHaveLength(0);
  });
});
