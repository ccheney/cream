/**
 * Trading Config Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import { type CreateTradingConfigInput, TradingConfigRepository } from "./trading-config.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS trading_config (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      version INTEGER NOT NULL,
      max_consensus_iterations INTEGER DEFAULT 3,
      agent_timeout_ms INTEGER DEFAULT 30000,
      total_consensus_timeout_ms INTEGER DEFAULT 300000,
      conviction_delta_hold REAL DEFAULT 0.2,
      conviction_delta_action REAL DEFAULT 0.3,
      high_conviction_pct REAL DEFAULT 0.7,
      medium_conviction_pct REAL DEFAULT 0.5,
      low_conviction_pct REAL DEFAULT 0.25,
      min_risk_reward_ratio REAL DEFAULT 1.5,
      kelly_fraction REAL DEFAULT 0.5,
      trading_cycle_interval_ms INTEGER DEFAULT 3600000,
      prediction_markets_interval_ms INTEGER DEFAULT 900000,
      global_model TEXT NOT NULL DEFAULT 'gemini-3-flash-preview',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      promoted_from TEXT,
      FOREIGN KEY (promoted_from) REFERENCES trading_config(id)
    )
  `);

  // Create partial unique index for active config per environment
  await client.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_config_env_active
    ON trading_config(environment) WHERE status = 'active'
  `);
}

describe("TradingConfigRepository", () => {
  let client: TursoClient;
  let repo: TradingConfigRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new TradingConfigRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  describe("create", () => {
    test("creates a config with all fields", async () => {
      const input: CreateTradingConfigInput = {
        id: "tc-001",
        environment: "PAPER",
        version: 1,
        maxConsensusIterations: 5,
        agentTimeoutMs: 45000,
        totalConsensusTimeoutMs: 450000,
        convictionDeltaHold: 0.15,
        convictionDeltaAction: 0.25,
        highConvictionPct: 0.8,
        mediumConvictionPct: 0.6,
        lowConvictionPct: 0.3,
        minRiskRewardRatio: 2.0,
        kellyFraction: 0.4,
        tradingCycleIntervalMs: 7200000,
        predictionMarketsIntervalMs: 1800000,
        status: "draft",
      };

      const result = await repo.create(input);

      expect(result.id).toBe("tc-001");
      expect(result.environment).toBe("PAPER");
      expect(result.version).toBe(1);
      expect(result.maxConsensusIterations).toBe(5);
      expect(result.agentTimeoutMs).toBe(45000);
      expect(result.totalConsensusTimeoutMs).toBe(450000);
      expect(result.convictionDeltaHold).toBe(0.15);
      expect(result.convictionDeltaAction).toBe(0.25);
      expect(result.highConvictionPct).toBe(0.8);
      expect(result.mediumConvictionPct).toBe(0.6);
      expect(result.lowConvictionPct).toBe(0.3);
      expect(result.minRiskRewardRatio).toBe(2.0);
      expect(result.kellyFraction).toBe(0.4);
      expect(result.tradingCycleIntervalMs).toBe(7200000);
      expect(result.predictionMarketsIntervalMs).toBe(1800000);
      expect(result.status).toBe("draft");
      expect(result.promotedFrom).toBeNull();
    });

    test("creates config with defaults", async () => {
      const result = await repo.create({
        id: "tc-defaults",
        environment: "BACKTEST",
        version: 1,
      });

      expect(result.maxConsensusIterations).toBe(3);
      expect(result.agentTimeoutMs).toBe(30000);
      expect(result.totalConsensusTimeoutMs).toBe(300000);
      expect(result.convictionDeltaHold).toBe(0.2);
      expect(result.convictionDeltaAction).toBe(0.3);
      expect(result.highConvictionPct).toBe(0.7);
      expect(result.mediumConvictionPct).toBe(0.5);
      expect(result.lowConvictionPct).toBe(0.25);
      expect(result.minRiskRewardRatio).toBe(1.5);
      expect(result.kellyFraction).toBe(0.5);
      expect(result.tradingCycleIntervalMs).toBe(3600000);
      expect(result.predictionMarketsIntervalMs).toBe(900000);
      expect(result.status).toBe("draft");
    });

    test("throws on duplicate ID", async () => {
      await repo.create({ id: "dup", environment: "PAPER", version: 1 });
      await expect(repo.create({ id: "dup", environment: "PAPER", version: 2 })).rejects.toThrow(
        RepositoryError
      );
    });
  });

  describe("findById", () => {
    test("finds config by ID", async () => {
      await repo.create({ id: "tc-find", environment: "LIVE", version: 1 });

      const found = await repo.findById("tc-find");
      expect(found).not.toBeNull();
      expect(found!.environment).toBe("LIVE");
    });

    test("returns null for non-existent ID", async () => {
      const found = await repo.findById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("findByIdOrThrow", () => {
    test("throws for non-existent ID", async () => {
      await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
    });
  });

  describe("getActive", () => {
    test("gets active config for environment", async () => {
      await repo.create({ id: "tc-inactive", environment: "PAPER", version: 1 });
      await repo.create({ id: "tc-active", environment: "PAPER", version: 2 });
      await repo.setStatus("tc-active", "active");

      const active = await repo.getActive("PAPER");
      expect(active).not.toBeNull();
      expect(active!.id).toBe("tc-active");
      expect(active!.status).toBe("active");
    });

    test("returns null when no active config", async () => {
      await repo.create({ id: "tc-draft", environment: "PAPER", version: 1 });

      const active = await repo.getActive("PAPER");
      expect(active).toBeNull();
    });
  });

  describe("getActiveOrThrow", () => {
    test("throws when no active config", async () => {
      await expect(repo.getActiveOrThrow("PAPER")).rejects.toThrow("No active trading config");
    });
  });

  describe("getDraft", () => {
    test("gets draft for environment", async () => {
      await repo.create({ id: "tc-draft-1", environment: "PAPER", version: 1 });

      const draft = await repo.getDraft("PAPER");
      expect(draft).not.toBeNull();
      expect(draft!.status).toBe("draft");
      expect(draft!.environment).toBe("PAPER");
    });

    test("returns null when no draft", async () => {
      await repo.create({ id: "tc-active", environment: "PAPER", version: 1 });
      await repo.setStatus("tc-active", "active");

      const draft = await repo.getDraft("PAPER");
      expect(draft).toBeNull();
    });
  });

  describe("saveDraft", () => {
    test("updates existing draft", async () => {
      await repo.create({
        id: "tc-draft",
        environment: "PAPER",
        version: 1,
        maxConsensusIterations: 3,
      });

      const updated = await repo.saveDraft("PAPER", {
        maxConsensusIterations: 5,
        agentTimeoutMs: 60000,
      });

      expect(updated.id).toBe("tc-draft");
      expect(updated.maxConsensusIterations).toBe(5);
      expect(updated.agentTimeoutMs).toBe(60000);
    });

    test("creates new draft when none exists", async () => {
      const draft = await repo.saveDraft("PAPER", {
        maxConsensusIterations: 4,
      });

      expect(draft.status).toBe("draft");
      expect(draft.environment).toBe("PAPER");
      expect(draft.maxConsensusIterations).toBe(4);
    });

    test("creates draft with version based on active config", async () => {
      await repo.create({ id: "tc-v1", environment: "PAPER", version: 1 });
      await repo.setStatus("tc-v1", "active");

      const draft = await repo.saveDraft("PAPER", {
        maxConsensusIterations: 5,
      });

      expect(draft.version).toBe(2);
    });
  });

  describe("setStatus", () => {
    test("sets status to active", async () => {
      await repo.create({ id: "tc-to-activate", environment: "PAPER", version: 1 });

      const activated = await repo.setStatus("tc-to-activate", "active");

      expect(activated.status).toBe("active");
    });

    test("archives previous active when setting new active", async () => {
      await repo.create({ id: "tc-first", environment: "PAPER", version: 1 });
      await repo.create({ id: "tc-second", environment: "PAPER", version: 2 });

      await repo.setStatus("tc-first", "active");
      await repo.setStatus("tc-second", "active");

      const first = await repo.findById("tc-first");
      const second = await repo.findById("tc-second");

      expect(first!.status).toBe("archived");
      expect(second!.status).toBe("active");
    });

    test("sets status to testing", async () => {
      await repo.create({ id: "tc-test", environment: "PAPER", version: 1 });

      const testing = await repo.setStatus("tc-test", "testing");

      expect(testing.status).toBe("testing");
    });

    test("sets status to archived", async () => {
      await repo.create({ id: "tc-archive", environment: "PAPER", version: 1 });

      const archived = await repo.setStatus("tc-archive", "archived");

      expect(archived.status).toBe("archived");
    });
  });

  describe("getHistory", () => {
    test("gets version history for environment", async () => {
      await repo.create({ id: "tc-h1", environment: "PAPER", version: 1 });
      await repo.create({ id: "tc-h2", environment: "PAPER", version: 2 });
      await repo.create({ id: "tc-h3", environment: "PAPER", version: 3 });
      await repo.create({ id: "tc-other", environment: "LIVE", version: 1 });

      const history = await repo.getHistory("PAPER");

      expect(history).toHaveLength(3);
      expect(history.every((c) => c.environment === "PAPER")).toBe(true);
      // Should be ordered by version DESC
      expect(history[0]!.version).toBe(3);
      expect(history[1]!.version).toBe(2);
      expect(history[2]!.version).toBe(1);
    });

    test("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: `tc-limit-${i}`, environment: "TEST" as any, version: i + 1 });
      }

      const history = await repo.getHistory("TEST" as any, 3);

      expect(history).toHaveLength(3);
    });
  });

  describe("compare", () => {
    test("compares two config versions", async () => {
      await repo.create({
        id: "tc-cmp-1",
        environment: "PAPER",
        version: 1,
        maxConsensusIterations: 3,
        agentTimeoutMs: 30000,
        kellyFraction: 0.5,
      });
      await repo.create({
        id: "tc-cmp-2",
        environment: "PAPER",
        version: 2,
        maxConsensusIterations: 5,
        agentTimeoutMs: 30000,
        kellyFraction: 0.4,
      });

      const result = await repo.compare("tc-cmp-1", "tc-cmp-2");

      expect(result.config1.id).toBe("tc-cmp-1");
      expect(result.config2.id).toBe("tc-cmp-2");

      const iterDiff = result.differences.find((d) => d.field === "maxConsensusIterations");
      expect(iterDiff).toBeDefined();
      expect(iterDiff!.value1).toBe(3);
      expect(iterDiff!.value2).toBe(5);

      const kellyDiff = result.differences.find((d) => d.field === "kellyFraction");
      expect(kellyDiff).toBeDefined();
      expect(kellyDiff!.value1).toBe(0.5);
      expect(kellyDiff!.value2).toBe(0.4);

      // agentTimeoutMs should NOT be in differences (same value)
      const timeoutDiff = result.differences.find((d) => d.field === "agentTimeoutMs");
      expect(timeoutDiff).toBeUndefined();
    });

    test("returns no differences for identical configs", async () => {
      await repo.create({
        id: "tc-same-1",
        environment: "PAPER",
        version: 1,
        maxConsensusIterations: 3,
      });
      await repo.create({
        id: "tc-same-2",
        environment: "PAPER",
        version: 2,
        maxConsensusIterations: 3,
      });

      const result = await repo.compare("tc-same-1", "tc-same-2");

      expect(result.differences).toHaveLength(0);
    });
  });

  describe("promote", () => {
    test("promotes active config to another environment", async () => {
      await repo.create({
        id: "tc-source",
        environment: "PAPER",
        version: 1,
        maxConsensusIterations: 5,
        kellyFraction: 0.4,
      });
      await repo.setStatus("tc-source", "active");

      const promoted = await repo.promote("tc-source", "LIVE");

      expect(promoted.environment).toBe("LIVE");
      expect(promoted.status).toBe("draft");
      expect(promoted.promotedFrom).toBe("tc-source");
      expect(promoted.maxConsensusIterations).toBe(5);
      expect(promoted.kellyFraction).toBe(0.4);
    });

    test("throws when promoting non-active config", async () => {
      await repo.create({
        id: "tc-draft",
        environment: "PAPER",
        version: 1,
      });

      await expect(repo.promote("tc-draft", "LIVE")).rejects.toThrow("Only active configs");
    });

    test("increments version in target environment", async () => {
      // Create existing config in LIVE
      await repo.create({ id: "tc-live-v1", environment: "LIVE", version: 1 });
      await repo.setStatus("tc-live-v1", "active");

      // Create and activate config in PAPER
      await repo.create({ id: "tc-paper", environment: "PAPER", version: 1 });
      await repo.setStatus("tc-paper", "active");

      const promoted = await repo.promote("tc-paper", "LIVE");

      expect(promoted.version).toBe(2);
    });
  });

  describe("delete", () => {
    test("deletes a draft config", async () => {
      await repo.create({ id: "tc-delete", environment: "PAPER", version: 1 });

      const deleted = await repo.delete("tc-delete");
      expect(deleted).toBe(true);

      const found = await repo.findById("tc-delete");
      expect(found).toBeNull();
    });

    test("returns false for non-existent ID", async () => {
      const deleted = await repo.delete("nonexistent");
      expect(deleted).toBe(false);
    });

    test("throws when deleting active config", async () => {
      await repo.create({ id: "tc-active", environment: "PAPER", version: 1 });
      await repo.setStatus("tc-active", "active");

      await expect(repo.delete("tc-active")).rejects.toThrow("Cannot delete active");
    });
  });

  describe("getNextVersion", () => {
    test("returns 1 for new environment", async () => {
      const nextVersion = await repo.getNextVersion("PAPER");
      expect(nextVersion).toBe(1);
    });

    test("returns incremented version", async () => {
      await repo.create({ id: "tc-v1", environment: "PAPER", version: 1 });
      await repo.create({ id: "tc-v2", environment: "PAPER", version: 2 });

      const nextVersion = await repo.getNextVersion("PAPER");
      expect(nextVersion).toBe(3);
    });
  });
});
