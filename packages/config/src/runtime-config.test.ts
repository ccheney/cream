/**
 * Runtime Config Service Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type AgentConfigsRepository,
  createRuntimeConfigService,
  type RuntimeAgentConfig,
  type RuntimeAgentType,
  RuntimeConfigError,
  type RuntimeConfigService,
  type RuntimeTradingConfig,
  type RuntimeUniverseConfig,
  type TradingConfigRepository,
  type UniverseConfigsRepository,
} from "./runtime-config";

// ============================================
// Test Fixtures
// ============================================

function createMockTradingConfig(
  overrides: Partial<RuntimeTradingConfig> = {}
): RuntimeTradingConfig {
  return {
    id: "tc-001",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    promotedFrom: null,
    ...overrides,
  };
}

function createMockAgentConfig(
  agentType: RuntimeAgentType,
  overrides: Partial<RuntimeAgentConfig> = {}
): RuntimeAgentConfig {
  return {
    id: `ac-${agentType}`,
    environment: "PAPER",
    agentType,
    model: "gemini-3-pro-preview",
    systemPromptOverride: null,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockUniverseConfig(
  overrides: Partial<RuntimeUniverseConfig> = {}
): RuntimeUniverseConfig {
  return {
    id: "uc-001",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createAllAgentConfigs(): RuntimeAgentConfig[] {
  const agentTypes: RuntimeAgentType[] = [
    "technical_analyst",
    "news_analyst",
    "fundamentals_analyst",
    "bullish_researcher",
    "bearish_researcher",
    "trader",
    "risk_manager",
    "critic",
  ];
  return agentTypes.map((type) => createMockAgentConfig(type));
}

// ============================================
// Mock Repositories
// ============================================

function createMockTradingConfigRepo(): TradingConfigRepository {
  return {
    getActive: mock(() => Promise.resolve(createMockTradingConfig())),
    getDraft: mock(() => Promise.resolve(null)),
    saveDraft: mock(() => Promise.resolve(createMockTradingConfig({ status: "draft" }))),
    setStatus: mock(() => Promise.resolve(createMockTradingConfig())),
    getHistory: mock(() => Promise.resolve([createMockTradingConfig()])),
    findById: mock(() => Promise.resolve(createMockTradingConfig())),
    getNextVersion: mock(() => Promise.resolve(2)),
    create: mock(() => Promise.resolve(createMockTradingConfig())),
    promote: mock(() => Promise.resolve(createMockTradingConfig())),
  } as unknown as TradingConfigRepository;
}

function createMockAgentConfigsRepo(): AgentConfigsRepository {
  return {
    getAll: mock(() => Promise.resolve(createAllAgentConfigs())),
    upsert: mock(() => Promise.resolve(createMockAgentConfig("technical_analyst"))),
    cloneToEnvironment: mock(() => Promise.resolve()),
  } as unknown as AgentConfigsRepository;
}

function createMockUniverseConfigsRepo(): UniverseConfigsRepository {
  return {
    getActive: mock(() => Promise.resolve(createMockUniverseConfig())),
    getDraft: mock(() => Promise.resolve(null)),
    saveDraft: mock(() => Promise.resolve(createMockUniverseConfig({ status: "draft" }))),
    setStatus: mock(() => Promise.resolve(createMockUniverseConfig())),
  } as unknown as UniverseConfigsRepository;
}

// ============================================
// Tests
// ============================================

describe("RuntimeConfigService", () => {
  let tradingRepo: TradingConfigRepository;
  let agentRepo: AgentConfigsRepository;
  let universeRepo: UniverseConfigsRepository;
  let service: RuntimeConfigService;

  beforeEach(() => {
    tradingRepo = createMockTradingConfigRepo();
    agentRepo = createMockAgentConfigsRepo();
    universeRepo = createMockUniverseConfigsRepo();
    service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
  });

  describe("getActiveConfig", () => {
    test("returns full config when all parts exist", async () => {
      const config = await service.getActiveConfig("PAPER");

      expect(config.trading).toBeDefined();
      expect(config.trading.id).toBe("tc-001");
      expect(config.universe).toBeDefined();
      expect(config.universe.id).toBe("uc-001");
      expect(config.agents).toBeDefined();
      expect(Object.keys(config.agents)).toHaveLength(8);
    });

    test("throws RuntimeConfigError when no trading config", async () => {
      (tradingRepo.getActive as ReturnType<typeof mock>).mockResolvedValue(null);

      await expect(service.getActiveConfig("PAPER")).rejects.toThrow(RuntimeConfigError);
      await expect(service.getActiveConfig("PAPER")).rejects.toThrow(/No active config found/);
    });

    test("throws RuntimeConfigError when no universe config", async () => {
      (universeRepo.getActive as ReturnType<typeof mock>).mockResolvedValue(null);

      await expect(service.getActiveConfig("PAPER")).rejects.toThrow(RuntimeConfigError);
    });
  });

  describe("getDraft", () => {
    test("returns draft config when exists", async () => {
      (tradingRepo.getDraft as ReturnType<typeof mock>).mockResolvedValue(
        createMockTradingConfig({ status: "draft" })
      );
      (universeRepo.getDraft as ReturnType<typeof mock>).mockResolvedValue(
        createMockUniverseConfig({ status: "draft" })
      );

      const draft = await service.getDraft("PAPER");

      expect(draft.trading.status).toBe("draft");
    });

    test("returns active config when no draft exists", async () => {
      const config = await service.getDraft("PAPER");

      expect(config.trading.status).toBe("active");
    });
  });

  describe("saveDraft", () => {
    test("saves trading config changes", async () => {
      await service.saveDraft("PAPER", {
        trading: {
          maxConsensusIterations: 5,
          agentTimeoutMs: 45000,
        },
      });

      expect(tradingRepo.saveDraft).toHaveBeenCalled();
    });

    test("saves universe config changes", async () => {
      await service.saveDraft("PAPER", {
        universe: {
          source: "index",
          indexSource: "SP500",
        },
      });

      expect(universeRepo.saveDraft).toHaveBeenCalled();
    });

    test("saves agent config changes", async () => {
      await service.saveDraft("PAPER", {
        agents: {
          technical_analyst: {
            model: "gemini-3-flash-preview",
            enabled: false,
          },
        },
      });

      expect(agentRepo.upsert).toHaveBeenCalled();
    });
  });

  describe("validateForPromotion", () => {
    test("passes validation for valid config", async () => {
      const config = await service.getActiveConfig("PAPER");
      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("fails when conviction percentages are out of order", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.highConvictionPct = 0.3;
      config.trading.mediumConvictionPct = 0.5;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("highConvictionPct"))).toBe(true);
    });

    test("fails when agent timeout exceeds total timeout", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.agentTimeoutMs = 500000;
      config.trading.totalConsensusTimeoutMs = 300000;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("agentTimeoutMs"))).toBe(true);
    });

    test("fails when static universe has no symbols", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.universe.source = "static";
      config.universe.staticSymbols = [];

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("staticSymbols"))).toBe(true);
    });

    test("fails when index source missing indexSource", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.universe.source = "index";
      config.universe.indexSource = null;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("indexSource"))).toBe(true);
    });

    test("fails when less than 3 agents enabled", async () => {
      const config = await service.getActiveConfig("PAPER");
      // Disable all but 2 agents
      for (const agentType of Object.keys(config.agents)) {
        config.agents[agentType as RuntimeAgentType].enabled = false;
      }
      config.agents.technical_analyst.enabled = true;
      config.agents.trader.enabled = true;

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "agents")).toBe(true);
    });

    test("warns when Kelly fraction is aggressive", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.trading.kellyFraction = 0.7;

      const result = await service.validateForPromotion(config);

      expect(result.warnings.some((w) => w.includes("Kelly"))).toBe(true);
    });

    test("fails when symbols in both include and exclude", async () => {
      const config = await service.getActiveConfig("PAPER");
      config.universe.includeList = ["AAPL", "GOOGL"];
      config.universe.excludeList = ["AAPL"];

      const result = await service.validateForPromotion(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("AAPL"))).toBe(true);
    });
  });

  describe("promote", () => {
    test("promotes draft to active", async () => {
      (tradingRepo.getDraft as ReturnType<typeof mock>).mockResolvedValue(
        createMockTradingConfig({ id: "tc-draft", status: "draft" })
      );
      (universeRepo.getDraft as ReturnType<typeof mock>).mockResolvedValue(
        createMockUniverseConfig({ id: "uc-draft", status: "draft" })
      );

      await service.promote("PAPER");

      expect(tradingRepo.setStatus).toHaveBeenCalledWith("tc-draft", "active");
      expect(universeRepo.setStatus).toHaveBeenCalledWith("uc-draft", "active");
    });

    test("throws when validation fails", async () => {
      (tradingRepo.getDraft as ReturnType<typeof mock>).mockResolvedValue(
        createMockTradingConfig({
          status: "draft",
          highConvictionPct: 0.3,
          mediumConvictionPct: 0.5,
        })
      );

      await expect(service.promote("PAPER")).rejects.toThrow(RuntimeConfigError);
      await expect(service.promote("PAPER")).rejects.toThrow(/validation failed/i);
    });
  });

  describe("getHistory", () => {
    test("returns config history", async () => {
      (tradingRepo.getHistory as ReturnType<typeof mock>).mockResolvedValue([
        createMockTradingConfig({ version: 2, maxConsensusIterations: 5 }),
        createMockTradingConfig({ version: 1, maxConsensusIterations: 3 }),
      ]);

      const history = await service.getHistory("PAPER", 10);

      expect(history).toHaveLength(2);
      expect(history[0].tradingConfig.version).toBe(2);
      expect(history[0].changedFields).toContain("maxConsensusIterations");
    });
  });

  describe("rollback", () => {
    test("creates new version from old config", async () => {
      (tradingRepo.findById as ReturnType<typeof mock>).mockResolvedValue(
        createMockTradingConfig({ id: "tc-old", version: 1, environment: "PAPER" })
      );

      await service.rollback("PAPER", "tc-old");

      expect(tradingRepo.create).toHaveBeenCalled();
      expect(tradingRepo.setStatus).toHaveBeenCalled();
    });

    test("throws when version not found", async () => {
      (tradingRepo.findById as ReturnType<typeof mock>).mockResolvedValue(null);

      await expect(service.rollback("PAPER", "nonexistent")).rejects.toThrow(RuntimeConfigError);
    });

    test("throws when version is from different environment", async () => {
      (tradingRepo.findById as ReturnType<typeof mock>).mockResolvedValue(
        createMockTradingConfig({ id: "tc-live", environment: "LIVE" })
      );

      await expect(service.rollback("PAPER", "tc-live")).rejects.toThrow(RuntimeConfigError);
      await expect(service.rollback("PAPER", "tc-live")).rejects.toThrow(/LIVE, not PAPER/);
    });
  });

  describe("RuntimeConfigError", () => {
    test("notSeeded creates correct error", () => {
      const error = RuntimeConfigError.notSeeded("PAPER");

      expect(error.code).toBe("NOT_SEEDED");
      expect(error.environment).toBe("PAPER");
      expect(error.message).toContain("db:seed");
    });

    test("validationFailed creates correct error", () => {
      const errors = [
        { field: "trading.kellyFraction", message: "Must be between 0 and 1", value: 2 },
      ];
      const error = RuntimeConfigError.validationFailed(errors, "LIVE");

      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.environment).toBe("LIVE");
      expect(error.details).toEqual(errors);
    });
  });
});
