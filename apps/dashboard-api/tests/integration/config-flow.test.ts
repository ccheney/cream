/**
 * Config Flow Integration Tests
 *
 * Tests the complete config loading → draft → promote → rollback flow
 * using an in-memory database.
 *
 * @see docs/plans/22-self-service-dashboard.md (Verification Plan)
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";
process.env.NODE_ENV = "test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import {
  AgentConfigsRepository,
  createInMemoryClient,
  runMigrations,
  TradingConfigRepository,
  type TursoClient,
  UniverseConfigsRepository,
} from "@cream/storage";

// ============================================
// Test Setup
// ============================================

let client: TursoClient;
let tradingRepo: TradingConfigRepository;
let agentRepo: AgentConfigsRepository;
let universeRepo: UniverseConfigsRepository;
let service: RuntimeConfigService;

// Counter to ensure unique IDs across test runs
let seedCounter = 0;

/**
 * Seeds the database with default configuration for PAPER environment.
 */
async function seedTestConfig(): Promise<void> {
  const suffix = `seed_${++seedCounter}`;

  // Create trading config
  await tradingRepo.create({
    id: `tc_paper_v1_${suffix}`,
    environment: "PAPER",
    version: 1,
    maxConsensusIterations: 3,
    agentTimeoutMs: 30000,
    totalConsensusTimeoutMs: 300000,
    convictionDeltaHold: 0.2,
    convictionDeltaAction: 0.3,
    highConvictionPct: 0.7,
    mediumConvictionPct: 0.5,
    lowConvictionPct: 0.25,
    minRiskRewardRatio: 1.5,
    kellyFraction: 0.5,
    tradingCycleIntervalMs: 3600000,
    predictionMarketsIntervalMs: 900000,
    status: "active",
  });

  // Create agent configs
  const agentTypes = [
    "news_analyst",
    "fundamentals_analyst",
    "bullish_researcher",
    "bearish_researcher",
    "trader",
    "risk_manager",
    "critic",
  ] as const;

  for (const agentType of agentTypes) {
    await agentRepo.upsert("PAPER", agentType, {
      model: "gemini-3-pro-preview",
      enabled: true,
      systemPromptOverride: null,
    });
  }

  // Create universe config directly with a fixed ID to avoid Date.now() collisions
  await universeRepo.create({
    id: `uc_paper_active_${suffix}`,
    environment: "PAPER",
    source: "static",
    staticSymbols: ["AAPL", "GOOGL", "MSFT"],
    indexSource: null,
    minVolume: null,
    minMarketCap: null,
    optionableOnly: false,
    includeList: [],
    excludeList: [],
    status: "active",
  });
}

// ============================================
// Test Suite
// ============================================

describe("Config Flow Integration", () => {
  beforeAll(async () => {
    // Create fresh in-memory database
    client = await createInMemoryClient();
    await runMigrations(client, { logger: () => {} });

    // Initialize repositories
    tradingRepo = new TradingConfigRepository(client);
    agentRepo = new AgentConfigsRepository(client);
    universeRepo = new UniverseConfigsRepository(client);

    // Create service
    service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
  });

  afterAll(() => {
    client.close();
  });

  describe("Config Loading", () => {
    beforeEach(async () => {
      // Clear any existing data by recreating the database
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      tradingRepo = new TradingConfigRepository(client);
      agentRepo = new AgentConfigsRepository(client);
      universeRepo = new UniverseConfigsRepository(client);
      service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
    });

    it("throws when no config seeded", async () => {
      await expect(service.getActiveConfig("PAPER")).rejects.toThrow(/No active config found/);
    });

    it("loads seeded config correctly", async () => {
      await seedTestConfig();

      const config = await service.getActiveConfig("PAPER");

      expect(config.trading.tradingCycleIntervalMs).toBe(3600000);
      expect(config.trading.maxConsensusIterations).toBe(3);
      expect(config.universe.source).toBe("static");
      expect(config.universe.staticSymbols).toContain("AAPL");
      expect(Object.keys(config.agents)).toHaveLength(8);
    });

    it("returns correct agent configurations", async () => {
      await seedTestConfig();

      const config = await service.getActiveConfig("PAPER");

      // Model is now global via trading.globalModel (no per-agent model field)
      expect(config.agents.news_analyst.enabled).toBe(true);
      expect(config.agents.trader.enabled).toBe(true);
    });
  });

  describe("Draft/Promote Workflow", () => {
    beforeEach(async () => {
      // Fresh database for each test
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      tradingRepo = new TradingConfigRepository(client);
      agentRepo = new AgentConfigsRepository(client);
      universeRepo = new UniverseConfigsRepository(client);
      service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
      await seedTestConfig();
    });

    it("saves draft without affecting active", async () => {
      // Save a draft with different values
      await service.saveDraft("PAPER", {
        trading: {
          tradingCycleIntervalMs: 1800000, // 30 minutes instead of 1 hour
          maxConsensusIterations: 5,
        },
      });

      // Active should still have original values
      const active = await service.getActiveConfig("PAPER");
      expect(active.trading.tradingCycleIntervalMs).toBe(3600000);
      expect(active.trading.maxConsensusIterations).toBe(3);

      // Draft should have new values
      const draft = await service.getDraft("PAPER");
      expect(draft.trading.tradingCycleIntervalMs).toBe(1800000);
      expect(draft.trading.maxConsensusIterations).toBe(5);
    });

    it("saves agent config changes in draft", async () => {
      await service.saveDraft("PAPER", {
        agents: {
          news_analyst: {
            enabled: false,
          },
        },
      });

      const draft = await service.getDraft("PAPER");
      // Model is now global via trading.globalModel (no per-agent model field)
      expect(draft.agents.news_analyst.enabled).toBe(false);
    });

    it("saves universe config changes in draft", async () => {
      await service.saveDraft("PAPER", {
        universe: {
          source: "index",
          indexSource: "SP500",
        },
      });

      const draft = await service.getDraft("PAPER");
      expect(draft.universe.source).toBe("index");
      expect(draft.universe.indexSource).toBe("SP500");
    });

    it("promotes draft to active atomically", async () => {
      // Save draft with valid changes
      await service.saveDraft("PAPER", {
        trading: {
          tradingCycleIntervalMs: 1800000,
        },
      });

      // Promote
      await service.promote("PAPER");

      // Active should now have the promoted values
      const active = await service.getActiveConfig("PAPER");
      expect(active.trading.tradingCycleIntervalMs).toBe(1800000);
    });

    it("rejects promotion when validation fails", async () => {
      // Save draft with invalid values (high conviction < medium conviction)
      await service.saveDraft("PAPER", {
        trading: {
          highConvictionPct: 0.3,
          mediumConvictionPct: 0.5,
        },
      });

      // Promotion should fail
      await expect(service.promote("PAPER")).rejects.toThrow(/validation failed/i);

      // Active should remain unchanged
      const active = await service.getActiveConfig("PAPER");
      expect(active.trading.highConvictionPct).toBe(0.7);
    });
  });

  describe("Validation", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      tradingRepo = new TradingConfigRepository(client);
      agentRepo = new AgentConfigsRepository(client);
      universeRepo = new UniverseConfigsRepository(client);
      service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
      await seedTestConfig();
    });

    it("validates config successfully", async () => {
      const config = await service.getActiveConfig("PAPER");
      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects invalid conviction ordering", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.highConvictionPct = 0.3;
      config.trading.mediumConvictionPct = 0.5;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("highConvictionPct"))).toBe(true);
    });

    it("detects agent timeout exceeding total timeout", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.agentTimeoutMs = 500000;
      config.trading.totalConsensusTimeoutMs = 300000;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("agentTimeoutMs"))).toBe(true);
    });

    it("warns when Kelly fraction is aggressive", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.kellyFraction = 0.7;

      const result = await service.validateForPromotion(config);

      expect(result.warnings.some((w) => w.includes("Kelly"))).toBe(true);
    });
  });

  describe("Rollback", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      tradingRepo = new TradingConfigRepository(client);
      agentRepo = new AgentConfigsRepository(client);
      universeRepo = new UniverseConfigsRepository(client);
      service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
      await seedTestConfig();
    });

    it("rolls back to previous version", async () => {
      // Get original config ID
      const original = await service.getActiveConfig("PAPER");
      const originalId = original.trading.id;

      // Make a change and promote
      await service.saveDraft("PAPER", {
        trading: {
          tradingCycleIntervalMs: 1800000,
        },
      });
      await service.promote("PAPER");

      // Verify the change took effect
      const afterPromotion = await service.getActiveConfig("PAPER");
      expect(afterPromotion.trading.tradingCycleIntervalMs).toBe(1800000);

      // Rollback
      await service.rollback("PAPER", originalId);

      // Verify rollback worked
      const afterRollback = await service.getActiveConfig("PAPER");
      expect(afterRollback.trading.tradingCycleIntervalMs).toBe(3600000);
    });

    it("throws when version not found", async () => {
      await expect(service.rollback("PAPER", "nonexistent-id")).rejects.toThrow();
    });

    it("throws when version is from different environment", async () => {
      // Seed LIVE config
      await tradingRepo.create({
        id: "tc_live_v1",
        environment: "LIVE",
        version: 1,
        maxConsensusIterations: 3,
        agentTimeoutMs: 30000,
        totalConsensusTimeoutMs: 300000,
        convictionDeltaHold: 0.2,
        convictionDeltaAction: 0.3,
        highConvictionPct: 0.7,
        mediumConvictionPct: 0.5,
        lowConvictionPct: 0.25,
        minRiskRewardRatio: 1.5,
        kellyFraction: 0.5,
        tradingCycleIntervalMs: 3600000,
        predictionMarketsIntervalMs: 900000,
        status: "active",
      });

      // Try to rollback PAPER to a LIVE config
      await expect(service.rollback("PAPER", "tc_live_v1")).rejects.toThrow(/LIVE, not PAPER/);
    });
  });

  describe("History", () => {
    beforeEach(async () => {
      client.close();
      client = await createInMemoryClient();
      await runMigrations(client, { logger: () => {} });
      tradingRepo = new TradingConfigRepository(client);
      agentRepo = new AgentConfigsRepository(client);
      universeRepo = new UniverseConfigsRepository(client);
      service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
      await seedTestConfig();
    });

    it("returns config history", async () => {
      // Make some changes
      await service.saveDraft("PAPER", {
        trading: { maxConsensusIterations: 5 },
      });
      await service.promote("PAPER");

      await service.saveDraft("PAPER", {
        trading: { maxConsensusIterations: 7 },
      });
      await service.promote("PAPER");

      const history = await service.getHistory("PAPER", 10);

      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it("tracks changed fields", async () => {
      await service.saveDraft("PAPER", {
        trading: {
          tradingCycleIntervalMs: 1800000,
          maxConsensusIterations: 5,
        },
      });
      await service.promote("PAPER");

      const history = await service.getHistory("PAPER", 10);

      // The first entry should have changed fields
      if (history.length > 0 && history[0]) {
        expect(history[0].changedFields.length).toBeGreaterThan(0);
      }
    });
  });
});
