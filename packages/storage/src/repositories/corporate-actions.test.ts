/**
 * Corporate Actions Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { type CorporateActionInsert, CorporateActionsRepository } from "./corporate-actions.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS corporate_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('split', 'reverse_split', 'dividend', 'special_dividend', 'spinoff', 'merger', 'acquisition', 'delisting', 'name_change')),
      ex_date TEXT NOT NULL,
      record_date TEXT,
      pay_date TEXT,
      ratio REAL,
      amount REAL,
      details TEXT,
      provider TEXT NOT NULL DEFAULT 'polygon',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, action_type, ex_date)
    )
  `);
}

describe("CorporateActionsRepository", () => {
  let client: TursoClient;
  let repo: CorporateActionsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new CorporateActionsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("upserts a corporate action", async () => {
    const action: CorporateActionInsert = {
      symbol: "AAPL",
      actionType: "split",
      exDate: "2020-08-31",
      recordDate: "2020-08-24",
      payDate: "2020-08-31",
      ratio: 4.0,
      provider: "polygon",
    };

    await repo.upsert(action);

    const result = await repo.getForSymbol("AAPL");
    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe("AAPL");
    expect(result[0]!.actionType).toBe("split");
    expect(result[0]!.ratio).toBe(4.0);
  });

  test("upsert overwrites existing action", async () => {
    await repo.upsert({
      symbol: "TSLA",
      actionType: "split",
      exDate: "2022-08-25",
      ratio: 3.0,
      provider: "polygon",
    });

    await repo.upsert({
      symbol: "TSLA",
      actionType: "split",
      exDate: "2022-08-25",
      ratio: 3.0,
      recordDate: "2022-08-17",
      payDate: "2022-08-24",
      provider: "polygon",
    });

    const result = await repo.getForSymbol("TSLA");
    expect(result).toHaveLength(1);
    expect(result[0]!.recordDate).toBe("2022-08-17");
    expect(result[0]!.payDate).toBe("2022-08-24");
  });

  test("gets corporate actions for symbol", async () => {
    await repo.upsert({
      symbol: "MSFT",
      actionType: "dividend",
      exDate: "2024-01-15",
      amount: 0.75,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "MSFT",
      actionType: "dividend",
      exDate: "2024-04-15",
      amount: 0.75,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "GOOGL",
      actionType: "dividend",
      exDate: "2024-03-15",
      amount: 0.2,
      provider: "polygon",
    });

    const msftActions = await repo.getForSymbol("MSFT");
    expect(msftActions).toHaveLength(2);
    expect(msftActions.every((a) => a.symbol === "MSFT")).toBe(true);
  });

  test("gets corporate actions with date range", async () => {
    await repo.upsert({
      symbol: "JNJ",
      actionType: "dividend",
      exDate: "2024-01-10",
      amount: 1.19,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "JNJ",
      actionType: "dividend",
      exDate: "2024-04-10",
      amount: 1.24,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "JNJ",
      actionType: "dividend",
      exDate: "2024-07-10",
      amount: 1.24,
      provider: "polygon",
    });

    const filtered = await repo.getForSymbol("JNJ", "2024-03-01", "2024-05-31");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.exDate).toBe("2024-04-10");
  });

  test("gets splits for symbol", async () => {
    await repo.upsert({
      symbol: "NVDA",
      actionType: "split",
      exDate: "2024-06-10",
      ratio: 10.0,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "NVDA",
      actionType: "reverse_split",
      exDate: "2020-01-15",
      ratio: 0.25,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "NVDA",
      actionType: "dividend",
      exDate: "2024-06-15",
      amount: 0.04,
      provider: "polygon",
    });

    const splits = await repo.getSplits("NVDA");
    expect(splits).toHaveLength(2);
    expect(splits.every((s) => s.actionType === "split" || s.actionType === "reverse_split")).toBe(
      true
    );
  });

  test("gets splits after date", async () => {
    await repo.upsert({
      symbol: "AMD",
      actionType: "split",
      exDate: "2020-01-15",
      ratio: 2.0,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "AMD",
      actionType: "split",
      exDate: "2023-06-01",
      ratio: 3.0,
      provider: "polygon",
    });

    const recentSplits = await repo.getSplits("AMD", "2022-01-01");
    expect(recentSplits).toHaveLength(1);
    expect(recentSplits[0]!.exDate).toBe("2023-06-01");
  });

  test("gets dividends for symbol", async () => {
    await repo.upsert({
      symbol: "KO",
      actionType: "dividend",
      exDate: "2024-01-15",
      amount: 0.485,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "KO",
      actionType: "special_dividend",
      exDate: "2024-02-01",
      amount: 1.0,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "KO",
      actionType: "split",
      exDate: "2012-08-13",
      ratio: 2.0,
      provider: "polygon",
    });

    const dividends = await repo.getDividends("KO");
    expect(dividends).toHaveLength(2);
    expect(
      dividends.every((d) => d.actionType === "dividend" || d.actionType === "special_dividend")
    ).toBe(true);
  });

  test("gets dividends after date", async () => {
    await repo.upsert({
      symbol: "PG",
      actionType: "dividend",
      exDate: "2023-12-15",
      amount: 0.94,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "PG",
      actionType: "dividend",
      exDate: "2024-03-15",
      amount: 1.01,
      provider: "polygon",
    });

    const recentDividends = await repo.getDividends("PG", "2024-01-01");
    expect(recentDividends).toHaveLength(1);
    expect(recentDividends[0]!.exDate).toBe("2024-03-15");
  });

  test("gets actions by ex-date", async () => {
    await repo.upsert({
      symbol: "AAPL",
      actionType: "dividend",
      exDate: "2024-05-10",
      amount: 0.25,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "MSFT",
      actionType: "dividend",
      exDate: "2024-05-10",
      amount: 0.75,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "GOOGL",
      actionType: "dividend",
      exDate: "2024-05-15",
      amount: 0.2,
      provider: "polygon",
    });

    const actionsOnDate = await repo.getByExDate("2024-05-10");
    expect(actionsOnDate).toHaveLength(2);
    expect(actionsOnDate.map((a) => a.symbol)).toContain("AAPL");
    expect(actionsOnDate.map((a) => a.symbol)).toContain("MSFT");
  });

  test("handles all action types", async () => {
    const actionTypes = [
      "split",
      "reverse_split",
      "dividend",
      "special_dividend",
      "spinoff",
      "merger",
      "acquisition",
      "delisting",
      "name_change",
    ] as const;

    for (const actionType of actionTypes) {
      await repo.upsert({
        symbol: `TEST_${actionType}`,
        actionType,
        exDate: "2024-01-01",
        provider: "polygon",
      });
    }

    for (const actionType of actionTypes) {
      const result = await repo.getForSymbol(`TEST_${actionType}`);
      expect(result).toHaveLength(1);
      expect(result[0]!.actionType).toBe(actionType);
    }
  });

  test("handles details JSON field", async () => {
    await repo.upsert({
      symbol: "META",
      actionType: "spinoff",
      exDate: "2024-01-15",
      details: {
        newSymbol: "RLTY",
        newName: "Reality Labs Inc",
        shareRatio: 0.1,
      },
      provider: "polygon",
    });

    const result = await repo.getForSymbol("META");
    expect(result[0]!.details).toEqual({
      newSymbol: "RLTY",
      newName: "Reality Labs Inc",
      shareRatio: 0.1,
    });
  });

  test("handles null optional fields", async () => {
    await repo.upsert({
      symbol: "MINIMAL",
      actionType: "delisting",
      exDate: "2024-06-01",
      provider: "polygon",
    });

    const result = await repo.getForSymbol("MINIMAL");
    expect(result[0]!.recordDate).toBeNull();
    expect(result[0]!.payDate).toBeNull();
    expect(result[0]!.ratio).toBeNull();
    expect(result[0]!.amount).toBeNull();
    expect(result[0]!.details).toBeNull();
  });

  test("returns empty array for non-existent symbol", async () => {
    const result = await repo.getForSymbol("NONEXISTENT");
    expect(result).toHaveLength(0);
  });

  test("orders results correctly", async () => {
    // For getForSymbol: descending by ex_date
    await repo.upsert({
      symbol: "ORDER",
      actionType: "dividend",
      exDate: "2024-01-01",
      amount: 0.5,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "ORDER",
      actionType: "dividend",
      exDate: "2024-06-01",
      amount: 0.5,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "ORDER",
      actionType: "dividend",
      exDate: "2024-03-01",
      amount: 0.5,
      provider: "polygon",
    });

    const result = await repo.getForSymbol("ORDER");
    expect(result[0]!.exDate).toBe("2024-06-01");
    expect(result[1]!.exDate).toBe("2024-03-01");
    expect(result[2]!.exDate).toBe("2024-01-01");
  });

  test("getSplits orders ascending by ex_date", async () => {
    await repo.upsert({
      symbol: "SPLIT_ORDER",
      actionType: "split",
      exDate: "2024-06-01",
      ratio: 2.0,
      provider: "polygon",
    });
    await repo.upsert({
      symbol: "SPLIT_ORDER",
      actionType: "split",
      exDate: "2024-01-01",
      ratio: 3.0,
      provider: "polygon",
    });

    const splits = await repo.getSplits("SPLIT_ORDER");
    expect(splits[0]!.exDate).toBe("2024-01-01");
    expect(splits[1]!.exDate).toBe("2024-06-01");
  });
});
