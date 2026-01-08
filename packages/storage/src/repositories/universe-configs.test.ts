/**
 * Universe Configs Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import { type CreateUniverseConfigInput, UniverseConfigsRepository } from "./universe-configs.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS universe_configs (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      source TEXT NOT NULL,
      static_symbols TEXT,
      index_source TEXT,
      min_volume INTEGER,
      min_market_cap INTEGER,
      optionable_only INTEGER NOT NULL DEFAULT 0,
      include_list TEXT,
      exclude_list TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create partial unique index for active config per environment
  await client.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_configs_env_active
    ON universe_configs(environment) WHERE status = 'active'
  `);
}

describe("UniverseConfigsRepository", () => {
  let client: TursoClient;
  let repo: UniverseConfigsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new UniverseConfigsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  describe("create", () => {
    test("creates a config with all fields", async () => {
      const input: CreateUniverseConfigInput = {
        id: "uc-001",
        environment: "PAPER",
        source: "static",
        staticSymbols: ["AAPL", "MSFT", "GOOGL"],
        indexSource: null,
        minVolume: 1000000,
        minMarketCap: 10000000000,
        optionableOnly: true,
        includeList: ["NVDA"],
        excludeList: ["TSLA"],
        status: "draft",
      };

      const result = await repo.create(input);

      expect(result.id).toBe("uc-001");
      expect(result.environment).toBe("PAPER");
      expect(result.source).toBe("static");
      expect(result.staticSymbols).toEqual(["AAPL", "MSFT", "GOOGL"]);
      expect(result.indexSource).toBeNull();
      expect(result.minVolume).toBe(1000000);
      expect(result.minMarketCap).toBe(10000000000);
      expect(result.optionableOnly).toBe(true);
      expect(result.includeList).toEqual(["NVDA"]);
      expect(result.excludeList).toEqual(["TSLA"]);
      expect(result.status).toBe("draft");
    });

    test("creates config with defaults", async () => {
      const result = await repo.create({
        id: "uc-defaults",
        environment: "BACKTEST",
        source: "index",
      });

      expect(result.staticSymbols).toBeNull();
      expect(result.indexSource).toBeNull();
      expect(result.minVolume).toBeNull();
      expect(result.minMarketCap).toBeNull();
      expect(result.optionableOnly).toBe(false);
      expect(result.includeList).toEqual([]);
      expect(result.excludeList).toEqual([]);
      expect(result.status).toBe("draft");
    });

    test("creates config with index source", async () => {
      const result = await repo.create({
        id: "uc-index",
        environment: "PAPER",
        source: "index",
        indexSource: "SP500",
      });

      expect(result.source).toBe("index");
      expect(result.indexSource).toBe("SP500");
    });

    test("creates config with screener source", async () => {
      const result = await repo.create({
        id: "uc-screener",
        environment: "PAPER",
        source: "screener",
        minVolume: 500000,
        minMarketCap: 1000000000,
      });

      expect(result.source).toBe("screener");
      expect(result.minVolume).toBe(500000);
      expect(result.minMarketCap).toBe(1000000000);
    });

    test("throws on duplicate ID", async () => {
      await repo.create({ id: "dup", environment: "PAPER", source: "static" });
      await expect(
        repo.create({ id: "dup", environment: "PAPER", source: "index" })
      ).rejects.toThrow(RepositoryError);
    });
  });

  describe("findById", () => {
    test("finds config by ID", async () => {
      await repo.create({ id: "uc-find", environment: "LIVE", source: "static" });

      const found = await repo.findById("uc-find");
      expect(found).not.toBeNull();
      expect(found!.environment).toBe("LIVE");
    });

    test("returns null for non-existent ID", async () => {
      const found = await repo.findById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("findByIdOrThrow", () => {
    test("returns config when found", async () => {
      await repo.create({ id: "uc-throw", environment: "PAPER", source: "static" });

      const found = await repo.findByIdOrThrow("uc-throw");
      expect(found.id).toBe("uc-throw");
    });

    test("throws for non-existent ID", async () => {
      await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
    });
  });

  describe("getActive", () => {
    test("gets active config for environment", async () => {
      await repo.create({ id: "uc-inactive", environment: "PAPER", source: "static" });
      await repo.create({ id: "uc-active", environment: "PAPER", source: "index" });
      await repo.setStatus("uc-active", "active");

      const active = await repo.getActive("PAPER");
      expect(active).not.toBeNull();
      expect(active!.id).toBe("uc-active");
      expect(active!.status).toBe("active");
    });

    test("returns null when no active config", async () => {
      await repo.create({ id: "uc-draft", environment: "PAPER", source: "static" });

      const active = await repo.getActive("PAPER");
      expect(active).toBeNull();
    });
  });

  describe("getActiveOrThrow", () => {
    test("returns active config when found", async () => {
      await repo.create({ id: "uc-active", environment: "PAPER", source: "static" });
      await repo.setStatus("uc-active", "active");

      const active = await repo.getActiveOrThrow("PAPER");
      expect(active.id).toBe("uc-active");
    });

    test("throws when no active config", async () => {
      await expect(repo.getActiveOrThrow("PAPER")).rejects.toThrow("No active universe config");
    });
  });

  describe("getDraft", () => {
    test("gets draft for environment", async () => {
      await repo.create({ id: "uc-draft-1", environment: "PAPER", source: "static" });

      const draft = await repo.getDraft("PAPER");
      expect(draft).not.toBeNull();
      expect(draft!.status).toBe("draft");
      expect(draft!.environment).toBe("PAPER");
    });

    test("returns most recent draft", async () => {
      await repo.create({ id: "uc-draft-old", environment: "PAPER", source: "static" });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await repo.create({ id: "uc-draft-new", environment: "PAPER", source: "index" });

      const draft = await repo.getDraft("PAPER");
      expect(draft!.id).toBe("uc-draft-new");
    });

    test("returns null when no draft", async () => {
      await repo.create({ id: "uc-active", environment: "PAPER", source: "static" });
      await repo.setStatus("uc-active", "active");

      const draft = await repo.getDraft("PAPER");
      expect(draft).toBeNull();
    });
  });

  describe("saveDraft", () => {
    test("updates existing draft", async () => {
      await repo.create({
        id: "uc-draft",
        environment: "PAPER",
        source: "static",
        staticSymbols: ["AAPL"],
      });

      const updated = await repo.saveDraft("PAPER", {
        source: "index",
        indexSource: "SP500",
        staticSymbols: null,
      });

      expect(updated.id).toBe("uc-draft");
      expect(updated.source).toBe("index");
      expect(updated.indexSource).toBe("SP500");
      expect(updated.staticSymbols).toBeNull();
    });

    test("updates boolean fields correctly", async () => {
      await repo.create({
        id: "uc-bool",
        environment: "PAPER",
        source: "static",
        optionableOnly: false,
      });

      const updated = await repo.saveDraft("PAPER", {
        optionableOnly: true,
      });

      expect(updated.optionableOnly).toBe(true);
    });

    test("updates array fields correctly", async () => {
      await repo.create({
        id: "uc-arr",
        environment: "PAPER",
        source: "static",
        includeList: ["AAPL"],
        excludeList: [],
      });

      const updated = await repo.saveDraft("PAPER", {
        includeList: ["AAPL", "MSFT"],
        excludeList: ["TSLA"],
      });

      expect(updated.includeList).toEqual(["AAPL", "MSFT"]);
      expect(updated.excludeList).toEqual(["TSLA"]);
    });

    test("creates new draft when none exists", async () => {
      const draft = await repo.saveDraft("PAPER", {
        source: "static",
        staticSymbols: ["AAPL", "MSFT"],
      });

      expect(draft.status).toBe("draft");
      expect(draft.environment).toBe("PAPER");
      expect(draft.source).toBe("static");
      expect(draft.staticSymbols).toEqual(["AAPL", "MSFT"]);
    });

    test("creates draft based on active config defaults", async () => {
      await repo.create({
        id: "uc-active",
        environment: "PAPER",
        source: "index",
        indexSource: "SP500",
        minVolume: 1000000,
        optionableOnly: true,
      });
      await repo.setStatus("uc-active", "active");

      const draft = await repo.saveDraft("PAPER", {
        minMarketCap: 5000000000,
      });

      expect(draft.status).toBe("draft");
      expect(draft.source).toBe("index"); // Inherited from active
      expect(draft.indexSource).toBe("SP500"); // Inherited from active
      expect(draft.minVolume).toBe(1000000); // Inherited from active
      expect(draft.optionableOnly).toBe(true); // Inherited from active
      expect(draft.minMarketCap).toBe(5000000000); // New value
    });
  });

  describe("setStatus", () => {
    test("sets status to active", async () => {
      await repo.create({ id: "uc-to-activate", environment: "PAPER", source: "static" });

      const activated = await repo.setStatus("uc-to-activate", "active");

      expect(activated.status).toBe("active");
    });

    test("archives previous active when setting new active", async () => {
      await repo.create({ id: "uc-first", environment: "PAPER", source: "static" });
      await repo.create({ id: "uc-second", environment: "PAPER", source: "index" });

      await repo.setStatus("uc-first", "active");
      await repo.setStatus("uc-second", "active");

      const first = await repo.findById("uc-first");
      const second = await repo.findById("uc-second");

      expect(first!.status).toBe("archived");
      expect(second!.status).toBe("active");
    });

    test("sets status to testing", async () => {
      await repo.create({ id: "uc-test", environment: "PAPER", source: "static" });

      const testing = await repo.setStatus("uc-test", "testing");

      expect(testing.status).toBe("testing");
    });

    test("sets status to archived", async () => {
      await repo.create({ id: "uc-archive", environment: "PAPER", source: "static" });

      const archived = await repo.setStatus("uc-archive", "archived");

      expect(archived.status).toBe("archived");
    });

    test("throws for non-existent config", async () => {
      await expect(repo.setStatus("nonexistent", "active")).rejects.toThrow(RepositoryError);
    });
  });

  describe("getHistory", () => {
    test("gets history for environment", async () => {
      await repo.create({ id: "uc-h1", environment: "PAPER", source: "static" });
      await repo.create({ id: "uc-h2", environment: "PAPER", source: "index" });
      await repo.create({ id: "uc-h3", environment: "PAPER", source: "screener" });
      await repo.create({ id: "uc-other", environment: "LIVE", source: "static" });

      const history = await repo.getHistory("PAPER");

      expect(history).toHaveLength(3);
      expect(history.every((c) => c.environment === "PAPER")).toBe(true);
    });

    test("returns history ordered by created_at DESC", async () => {
      await repo.create({ id: "uc-old", environment: "PAPER", source: "static" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await repo.create({ id: "uc-new", environment: "PAPER", source: "index" });

      const history = await repo.getHistory("PAPER");

      expect(history[0]!.id).toBe("uc-new");
      expect(history[1]!.id).toBe("uc-old");
    });

    test("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: `uc-limit-${i}`, environment: "PAPER", source: "static" });
      }

      const history = await repo.getHistory("PAPER", 3);

      expect(history).toHaveLength(3);
    });

    test("returns empty array for environment with no configs", async () => {
      const history = await repo.getHistory("LIVE");
      expect(history).toEqual([]);
    });
  });

  describe("delete", () => {
    test("deletes a draft config", async () => {
      await repo.create({ id: "uc-delete", environment: "PAPER", source: "static" });

      const deleted = await repo.delete("uc-delete");
      expect(deleted).toBe(true);

      const found = await repo.findById("uc-delete");
      expect(found).toBeNull();
    });

    test("deletes an archived config", async () => {
      await repo.create({ id: "uc-archived", environment: "PAPER", source: "static" });
      await repo.setStatus("uc-archived", "archived");

      const deleted = await repo.delete("uc-archived");
      expect(deleted).toBe(true);
    });

    test("returns false for non-existent ID", async () => {
      const deleted = await repo.delete("nonexistent");
      expect(deleted).toBe(false);
    });

    test("throws when deleting active config", async () => {
      await repo.create({ id: "uc-active", environment: "PAPER", source: "static" });
      await repo.setStatus("uc-active", "active");

      await expect(repo.delete("uc-active")).rejects.toThrow("Cannot delete active");
    });
  });

  describe("JSON serialization", () => {
    test("serializes and deserializes staticSymbols array", async () => {
      const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN"];
      await repo.create({
        id: "uc-json-1",
        environment: "PAPER",
        source: "static",
        staticSymbols: symbols,
      });

      const found = await repo.findById("uc-json-1");
      expect(found!.staticSymbols).toEqual(symbols);
    });

    test("serializes and deserializes includeList array", async () => {
      const includeList = ["NVDA", "AMD"];
      await repo.create({
        id: "uc-json-2",
        environment: "PAPER",
        source: "index",
        includeList,
      });

      const found = await repo.findById("uc-json-2");
      expect(found!.includeList).toEqual(includeList);
    });

    test("serializes and deserializes excludeList array", async () => {
      const excludeList = ["TSLA", "GME", "AMC"];
      await repo.create({
        id: "uc-json-3",
        environment: "PAPER",
        source: "screener",
        excludeList,
      });

      const found = await repo.findById("uc-json-3");
      expect(found!.excludeList).toEqual(excludeList);
    });

    test("handles empty arrays", async () => {
      await repo.create({
        id: "uc-json-empty",
        environment: "PAPER",
        source: "static",
        staticSymbols: [],
        includeList: [],
        excludeList: [],
      });

      const found = await repo.findById("uc-json-empty");
      expect(found!.staticSymbols).toEqual([]);
      expect(found!.includeList).toEqual([]);
      expect(found!.excludeList).toEqual([]);
    });

    test("handles null staticSymbols", async () => {
      await repo.create({
        id: "uc-json-null",
        environment: "PAPER",
        source: "index",
        staticSymbols: null,
      });

      const found = await repo.findById("uc-json-null");
      expect(found!.staticSymbols).toBeNull();
    });
  });

  describe("boolean conversion", () => {
    test("stores and retrieves optionableOnly true", async () => {
      await repo.create({
        id: "uc-bool-true",
        environment: "PAPER",
        source: "static",
        optionableOnly: true,
      });

      const found = await repo.findById("uc-bool-true");
      expect(found!.optionableOnly).toBe(true);
    });

    test("stores and retrieves optionableOnly false", async () => {
      await repo.create({
        id: "uc-bool-false",
        environment: "PAPER",
        source: "static",
        optionableOnly: false,
      });

      const found = await repo.findById("uc-bool-false");
      expect(found!.optionableOnly).toBe(false);
    });
  });
});
