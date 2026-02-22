#!/usr/bin/env bun
/**
 * Database Seed Script for Runtime Configuration
 *
 * Initializes the database with sensible default configurations for
 * PAPER and LIVE environments. Safe to run multiple times
 * (idempotent) - only seeds if no active config exists.
 *
 * Usage:
 *   bun run packages/storage/src/seed-config.ts
 *   bun run packages/storage/src/seed-config.ts --force  # Overwrite existing
 *   bun run packages/storage/src/seed-config.ts --env=PAPER  # Seed only PAPER
 *
 * Environment:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/cream
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 1)
 */

import { getDefaultGlobalModel } from "@cream/domain";
import { log } from "./logger.js";
import {
	AGENT_TYPES,
	AgentConfigsRepository,
	type AgentType,
} from "./repositories/agent-configs.js";
import { ConstraintsConfigRepository } from "./repositories/constraints-config.js";
import { TradingConfigRepository, type TradingEnvironment } from "./repositories/trading-config.js";
import { ScannerConfigsRepository } from "./repositories/scanner-configs.js";

/** Extracted from packages/config/configs/default.yaml and apps/worker/src/index.ts */
function getDefaultTradingConfig() {
	return {
		globalModel: getDefaultGlobalModel(), // Global model from LLM_MODEL_ID env var
		maxConsensusIterations: 3,
		agentTimeoutMs: 1_800_000, // 30 minutes - LLMs can be slow
		totalConsensusTimeoutMs: 1_800_000, // 30 minutes total for full consensus
		convictionDeltaHold: 0.2,
		convictionDeltaAction: 0.3,
		highConvictionPct: 0.7, // % of Kelly optimal
		mediumConvictionPct: 0.5,
		lowConvictionPct: 0.25,
		minRiskRewardRatio: 1.5,
		kellyFraction: 0.5,
		tradingCycleIntervalMs: 60 * 60 * 1000,
		predictionMarketsIntervalMs: 15 * 60 * 1000,
	};
}

/**
 * Default agent configs - model is now global (in trading config)
 * Only enabled/disabled and prompt overrides are per-agent
 */
const DEFAULT_AGENT_CONFIGS: Record<
	AgentType,
	{
		enabled: boolean;
	}
> = {
	grounding_agent: { enabled: true },
	news_analyst: { enabled: true },
	fundamentals_analyst: { enabled: true },
	bullish_researcher: { enabled: true },
	bearish_researcher: { enabled: true },
	trader: { enabled: true },
	risk_manager: { enabled: true },
	critic: { enabled: true },
};

const DEFAULT_SCANNER_CONFIG = {
	minPrice: 5,
	minAvgVolume: 100_000,
	volumeSpikeThreshold: 3,
	priceMoveThreshold: 2,
	gapThreshold: 2,
	maxCandidates: 10,
	cooldownSeconds: 300,
	enabled: true,
};

interface SeedOptions {
	force: boolean;
	environments: TradingEnvironment[];
}

function parseArgs(): SeedOptions {
	const args = Bun.argv.slice(2);
	const force = args.includes("--force");

	// Parse --env flag
	const envArg = args.find((arg) => arg.startsWith("--env="));
	let environments: TradingEnvironment[] = ["PAPER", "LIVE"];

	if (envArg) {
		const envValue = envArg.split("=")[1]?.toUpperCase() as TradingEnvironment;
		if (["PAPER", "LIVE"].includes(envValue)) {
			environments = [envValue];
		} else {
			log.error({ envValue }, "Invalid environment. Must be PAPER or LIVE.");
			process.exit(1);
		}
	}

	return { force, environments };
}

interface SeedResult {
	environment: TradingEnvironment;
	trading: "created" | "skipped" | "replaced";
	agents: "created" | "skipped" | "replaced";
	scanner: "created" | "skipped" | "replaced";
	constraints: "created" | "skipped" | "replaced";
}

async function seedTradingConfig(
	environment: TradingEnvironment,
	tradingRepo: TradingConfigRepository,
	existingTrading: Awaited<ReturnType<TradingConfigRepository["getActive"]>>,
	force: boolean,
): Promise<SeedResult["trading"]> {
	if (existingTrading && !force) {
		return "skipped";
	}

	let version = 1;
	let status: SeedResult["trading"] = "created";
	if (existingTrading && force) {
		await tradingRepo.setStatus(existingTrading.id, "archived");
		version = existingTrading.version + 1;
		status = "replaced";
	}

	await tradingRepo.create({
		environment,
		version,
		...getDefaultTradingConfig(),
		status: "active",
	});

	return status;
}

async function seedAgentConfigs(
	environment: TradingEnvironment,
	agentRepo: AgentConfigsRepository,
	existingAgents: Awaited<ReturnType<AgentConfigsRepository["getAll"]>>,
	force: boolean,
): Promise<SeedResult["agents"]> {
	const hasAllAgents = existingAgents.length === AGENT_TYPES.length;
	if (hasAllAgents && !force) {
		return "skipped";
	}

	for (const agentType of AGENT_TYPES) {
		const defaults = DEFAULT_AGENT_CONFIGS[agentType];
		await agentRepo.upsert(environment, agentType, {
			enabled: defaults.enabled,
			systemPromptOverride: null,
		});
	}

	return existingAgents.length > 0 ? "replaced" : "created";
}

async function seedScannerConfig(
	environment: TradingEnvironment,
	scannerRepo: ScannerConfigsRepository,
	existingScanner: Awaited<ReturnType<ScannerConfigsRepository["getActive"]>>,
	force: boolean,
): Promise<SeedResult["scanner"]> {
	if (existingScanner && !force) {
		return "skipped";
	}

	let status: SeedResult["scanner"] = "created";
	if (existingScanner && force) {
		await scannerRepo.setStatus(existingScanner.id, "archived");
		status = "replaced";
	}

	const draft = await scannerRepo.saveDraft(environment, DEFAULT_SCANNER_CONFIG);
	await scannerRepo.setStatus(draft.id, "active");
	return status;
}

async function seedConstraintsConfig(
	environment: TradingEnvironment,
	constraintsRepo: ConstraintsConfigRepository,
	existingConstraints: Awaited<ReturnType<ConstraintsConfigRepository["getActive"]>>,
	force: boolean,
): Promise<SeedResult["constraints"]> {
	if (existingConstraints && !force) {
		return "skipped";
	}

	let status: SeedResult["constraints"] = "created";
	if (existingConstraints && force) {
		await constraintsRepo.setStatus(existingConstraints.id, "archived");
		status = "replaced";
	}

	await constraintsRepo.create({
		environment,
		status: "active",
	});
	return status;
}

async function seedEnvironment(
	environment: TradingEnvironment,
	tradingRepo: TradingConfigRepository,
	agentRepo: AgentConfigsRepository,
	scannerRepo: ScannerConfigsRepository,
	constraintsRepo: ConstraintsConfigRepository,
	force: boolean,
): Promise<SeedResult> {
	const existingTrading = await tradingRepo.getActive(environment);
	const existingScanner = await scannerRepo.getActive(environment);
	const existingAgents = await agentRepo.getAll(environment);
	const existingConstraints = await constraintsRepo.getActive(environment);

	const trading = await seedTradingConfig(environment, tradingRepo, existingTrading, force);
	const agents = await seedAgentConfigs(environment, agentRepo, existingAgents, force);
	const scanner = await seedScannerConfig(environment, scannerRepo, existingScanner, force);
	const constraints = await seedConstraintsConfig(
		environment,
		constraintsRepo,
		existingConstraints,
		force,
	);

	return { environment, trading, agents, scanner, constraints };
}

async function main(): Promise<void> {
	const options = parseArgs();

	log.info({}, "Seeding runtime configuration");
	if (options.force) {
		log.warn({}, "Force mode enabled - existing configs will be replaced");
	}

	// Repositories use getDb() internally via Drizzle (reads DATABASE_URL)
	const tradingRepo = new TradingConfigRepository();
	const agentRepo = new AgentConfigsRepository();
	const scannerRepo = new ScannerConfigsRepository();
	const constraintsRepo = new ConstraintsConfigRepository();

	const results: SeedResult[] = [];

	for (const env of options.environments) {
		log.info({ environment: env }, "Seeding environment");
		try {
			const result = await seedEnvironment(
				env,
				tradingRepo,
				agentRepo,
				scannerRepo,
				constraintsRepo,
				options.force,
			);
			results.push(result);
		} catch (error) {
			log.error(
				{ environment: env, error: error instanceof Error ? error.message : String(error) },
				"Failed to seed environment",
			);
			process.exit(1);
		}
	}

	log.info({}, "Seed complete");

	for (const result of results) {
		log.info(
			{
				environment: result.environment,
				trading: result.trading,
				agents: result.agents,
				scanner: result.scanner,
				constraints: result.constraints,
			},
			"Environment seed summary",
		);
	}
}

main().catch((error) => {
	log.error({ error: error instanceof Error ? error.message : String(error) }, "Fatal error");
	process.exit(1);
});
