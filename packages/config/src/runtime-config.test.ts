/**
 * Runtime Config Service Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, mock, test } from "bun:test";
import {
	type AgentConfigsRepository,
	createRuntimeConfigService,
	type RuntimeAgentConfig,
	type RuntimeAgentType,
	RuntimeConfigError,
	type RuntimeConfigService,
	type RuntimeScannerConfig,
	type RuntimeTradingConfig,
	type ScannerConfigsRepository,
	type TradingConfigRepository,
} from "./runtime-config";

function createMockTradingConfig(
	overrides: Partial<RuntimeTradingConfig> = {},
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
	overrides: Partial<RuntimeAgentConfig> = {},
): RuntimeAgentConfig {
	return {
		id: `ac-${agentType}`,
		environment: "PAPER",
		agentType,
		systemPromptOverride: null,
		enabled: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function createMockScannerConfig(
	overrides: Partial<RuntimeScannerConfig> = {},
): RuntimeScannerConfig {
	return {
		id: "uc-001",
		environment: "PAPER",
		minPrice: 5,
		minAvgVolume: 100000,
		volumeSpikeThreshold: 3,
		priceMoveThreshold: 2,
		gapThreshold: 2,
		maxCandidates: 10,
		cooldownSeconds: 300,
		enabled: true,
		status: "active",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function createAllAgentConfigs(): RuntimeAgentConfig[] {
	const agentTypes: RuntimeAgentType[] = [
		"grounding_agent",
		"news_analyst",
		"fundamentals_analyst",
		"bullish_researcher",
		"bearish_researcher",
		"trader",
		"risk_manager",
		"critic",
	];

	return agentTypes.map((agentType) => createMockAgentConfig(agentType));
}

function testDouble<T>(partial: Partial<T>): T {
	return partial as T;
}

function createMockTradingConfigRepo(): TradingConfigRepository {
	return testDouble<TradingConfigRepository>({
		getActive: mock(() => Promise.resolve(createMockTradingConfig())),
		getDraft: mock(() => Promise.resolve(null)),
		saveDraft: mock(() => Promise.resolve(createMockTradingConfig({ status: "draft" }))),
		setStatus: mock(() => Promise.resolve(createMockTradingConfig())),
		getHistory: mock(() => Promise.resolve([createMockTradingConfig()])),
		findById: mock(() => Promise.resolve(createMockTradingConfig())),
		getNextVersion: mock(() => Promise.resolve(2)),
		create: mock(() => Promise.resolve(createMockTradingConfig())),
		promote: mock(() => Promise.resolve(createMockTradingConfig())),
	});
}

function createMockAgentConfigsRepo(): AgentConfigsRepository {
	return testDouble<AgentConfigsRepository>({
		getAll: mock(() => Promise.resolve(createAllAgentConfigs())),
		upsert: mock(() => Promise.resolve(createMockAgentConfig("grounding_agent"))),
		cloneToEnvironment: mock(() => Promise.resolve()),
	});
}

function createMockScannerConfigsRepo(): ScannerConfigsRepository {
	return testDouble<ScannerConfigsRepository>({
		getActive: mock(() => Promise.resolve(createMockScannerConfig())),
		getDraft: mock(() => Promise.resolve(null)),
		saveDraft: mock(() => Promise.resolve(createMockScannerConfig({ status: "draft" }))),
		setStatus: mock(() => Promise.resolve(createMockScannerConfig())),
	});
}

function asMock(fn: unknown): ReturnType<typeof mock> {
	return fn as ReturnType<typeof mock>;
}

function createServiceHarness(): {
	tradingRepo: TradingConfigRepository;
	agentRepo: AgentConfigsRepository;
	scannerRepo: ScannerConfigsRepository;
	service: RuntimeConfigService;
} {
	const tradingRepo = createMockTradingConfigRepo();
	const agentRepo = createMockAgentConfigsRepo();
	const scannerRepo = createMockScannerConfigsRepo();
	const service = createRuntimeConfigService(tradingRepo, agentRepo, scannerRepo);

	return {
		tradingRepo,
		agentRepo,
		scannerRepo,
		service,
	};
}

describe("RuntimeConfigService getActiveConfig", () => {
	test("returns full config when all parts exist", async () => {
		const { service } = createServiceHarness();

		const config = await service.getActiveConfig("PAPER");

		expect(config.trading).toBeDefined();
		expect(config.trading.id).toBe("tc-001");
		expect(config.scanner).toBeDefined();
		expect(config.scanner.id).toBe("uc-001");
		expect(config.agents).toBeDefined();
		expect(Object.keys(config.agents)).toHaveLength(8);
	});

	test("throws RuntimeConfigError when no trading config", async () => {
		const { service, tradingRepo } = createServiceHarness();
		asMock(tradingRepo.getActive).mockResolvedValue(null);

		await expect(service.getActiveConfig("PAPER")).rejects.toThrow(RuntimeConfigError);
		await expect(service.getActiveConfig("PAPER")).rejects.toThrow(/No active config found/);
	});

	test("throws RuntimeConfigError when no scanner config", async () => {
		const { service, scannerRepo } = createServiceHarness();
		asMock(scannerRepo.getActive).mockResolvedValue(null);

		await expect(service.getActiveConfig("PAPER")).rejects.toThrow(RuntimeConfigError);
	});
});

describe("RuntimeConfigService getDraft", () => {
	test("returns draft config when exists", async () => {
		const { service, tradingRepo, scannerRepo } = createServiceHarness();
		asMock(tradingRepo.getDraft).mockResolvedValue(createMockTradingConfig({ status: "draft" }));
		asMock(scannerRepo.getDraft).mockResolvedValue(createMockScannerConfig({ status: "draft" }));

		const draft = await service.getDraft("PAPER");

		expect(draft.trading.status).toBe("draft");
	});

	test("returns active config when no draft exists", async () => {
		const { service } = createServiceHarness();

		const config = await service.getDraft("PAPER");

		expect(config.trading.status).toBe("active");
	});
});

describe("RuntimeConfigService saveDraft trading and scanner", () => {
	test("saves trading config changes", async () => {
		const { service, tradingRepo } = createServiceHarness();

		await service.saveDraft("PAPER", {
			trading: {
				maxConsensusIterations: 5,
				agentTimeoutMs: 45000,
			},
		});

		expect(tradingRepo.saveDraft).toHaveBeenCalled();
	});

	test("saves scanner config changes", async () => {
		const { service, scannerRepo } = createServiceHarness();

		await service.saveDraft("PAPER", {
			scanner: {
				minPrice: 10,
				maxCandidates: 15,
			},
		});

		expect(scannerRepo.saveDraft).toHaveBeenCalled();
	});
});

describe("RuntimeConfigService saveDraft agents", () => {
	test("saves agent config changes", async () => {
		const { service, agentRepo } = createServiceHarness();

		await service.saveDraft("PAPER", {
			agents: {
				grounding_agent: {
					enabled: false,
				},
			},
		});

		expect(agentRepo.upsert).toHaveBeenCalled();
	});
});

describe("RuntimeConfigService validateForPromotion trading rules", () => {
	test("passes validation for valid config", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("fails when conviction percentages are out of order", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.trading.highConvictionPct = 0.3;
		config.trading.mediumConvictionPct = 0.5;

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.field.includes("highConvictionPct"))).toBe(true);
	});

	test("fails when agent timeout exceeds total timeout", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.trading.agentTimeoutMs = 500000;
		config.trading.totalConsensusTimeoutMs = 300000;

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.field.includes("agentTimeoutMs"))).toBe(true);
	});
});

describe("RuntimeConfigService validateForPromotion scanner rules", () => {
	test("fails when max candidates is invalid", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.scanner.maxCandidates = 0;

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.field.includes("maxCandidates"))).toBe(true);
	});

	test("fails when volume spike threshold is invalid", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.scanner.volumeSpikeThreshold = 0.5;

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.field.includes("volumeSpikeThreshold"))).toBe(true);
	});
});

describe("RuntimeConfigService validateForPromotion agent and risk rules", () => {
	test("fails when less than 3 agents enabled", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");

		for (const agentType of Object.keys(config.agents)) {
			config.agents[agentType as RuntimeAgentType].enabled = false;
		}
		config.agents.grounding_agent.enabled = true;
		config.agents.trader.enabled = true;

		const result = await service.validateForPromotion(config);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.field === "agents")).toBe(true);
	});

	test("warns when Kelly fraction is aggressive", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.trading.kellyFraction = 0.7;

		const result = await service.validateForPromotion(config);

		expect(result.warnings.some((warning) => warning.includes("Kelly"))).toBe(true);
	});

	test("warns when scanner is disabled", async () => {
		const { service } = createServiceHarness();
		const config = await service.getActiveConfig("PAPER");
		config.scanner.enabled = false;

		const result = await service.validateForPromotion(config);

		expect(result.warnings.some((warning) => warning.includes("Scanner is disabled"))).toBe(true);
	});
});

describe("RuntimeConfigService promote", () => {
	test("promotes draft to active", async () => {
		const { service, tradingRepo, scannerRepo } = createServiceHarness();
		asMock(tradingRepo.getDraft).mockResolvedValue(
			createMockTradingConfig({ id: "tc-draft", status: "draft" }),
		);
		asMock(scannerRepo.getDraft).mockResolvedValue(
			createMockScannerConfig({ id: "uc-draft", status: "draft" }),
		);

		await service.promote("PAPER");

		expect(tradingRepo.setStatus).toHaveBeenCalledWith("tc-draft", "active");
		expect(scannerRepo.setStatus).toHaveBeenCalledWith("uc-draft", "active");
	});

	test("throws when validation fails", async () => {
		const { service, tradingRepo } = createServiceHarness();
		asMock(tradingRepo.getDraft).mockResolvedValue(
			createMockTradingConfig({
				status: "draft",
				highConvictionPct: 0.3,
				mediumConvictionPct: 0.5,
			}),
		);

		await expect(service.promote("PAPER")).rejects.toThrow(RuntimeConfigError);
		await expect(service.promote("PAPER")).rejects.toThrow(/validation failed/i);
	});
});

describe("RuntimeConfigService getHistory", () => {
	test("returns config history with full context", async () => {
		const { service, tradingRepo } = createServiceHarness();
		const mockConfig1 = createMockTradingConfig({
			id: "tc-1",
			version: 2,
			maxConsensusIterations: 5,
			status: "active",
		});
		const mockConfig2 = createMockTradingConfig({
			id: "tc-2",
			version: 1,
			maxConsensusIterations: 3,
		});

		asMock(tradingRepo.getHistory).mockResolvedValue([mockConfig1, mockConfig2]);
		asMock(tradingRepo.getActive).mockResolvedValue(mockConfig1);

		const history = await service.getHistory("PAPER", 10);

		expect(history).toHaveLength(2);
		expect(history[0]?.id).toBe("tc-1");
		expect(history[0]?.version).toBe(2);
		expect(history[0]?.config.trading.version).toBe(2);
		expect(history[0]?.isActive).toBe(true);
		expect(history[0]?.changedFields).toContain("maxConsensusIterations");
		expect(history[0]?.createdAt).toBeDefined();
		expect(history[0]?.description).toBeDefined();
		expect(history[1]?.id).toBe("tc-2");
		expect(history[1]?.version).toBe(1);
		expect(history[1]?.isActive).toBe(false);
	});
});

describe("RuntimeConfigService rollback", () => {
	test("creates new version from old config", async () => {
		const { service, tradingRepo } = createServiceHarness();
		asMock(tradingRepo.findById).mockResolvedValue(
			createMockTradingConfig({ id: "tc-old", version: 1, environment: "PAPER" }),
		);

		await service.rollback("PAPER", "tc-old");

		expect(tradingRepo.create).toHaveBeenCalled();
		expect(tradingRepo.setStatus).toHaveBeenCalled();
	});

	test("throws when version not found", async () => {
		const { service, tradingRepo } = createServiceHarness();
		asMock(tradingRepo.findById).mockResolvedValue(null);

		await expect(service.rollback("PAPER", "nonexistent")).rejects.toThrow(RuntimeConfigError);
	});

	test("throws when version is from different environment", async () => {
		const { service, tradingRepo } = createServiceHarness();
		asMock(tradingRepo.findById).mockResolvedValue(
			createMockTradingConfig({ id: "tc-live", environment: "LIVE" }),
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
