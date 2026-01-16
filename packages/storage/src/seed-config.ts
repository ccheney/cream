#!/usr/bin/env bun
/**
 * Database Seed Script for Runtime Configuration
 *
 * Initializes the database with sensible default configurations for
 * BACKTEST, PAPER, and LIVE environments. Safe to run multiple times
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
import { UniverseConfigsRepository } from "./repositories/universe-configs.js";

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
	news_analyst: { enabled: true },
	fundamentals_analyst: { enabled: true },
	bullish_researcher: { enabled: true },
	bearish_researcher: { enabled: true },
	trader: { enabled: true },
	risk_manager: { enabled: true },
	critic: { enabled: true },
};

const DEFAULT_UNIVERSE_CONFIG = {
	source: "static" as const,
	staticSymbols: ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"],
	indexSource: null,
	minVolume: null,
	minMarketCap: null,
	optionableOnly: false,
	includeList: [] as string[],
	excludeList: [] as string[],
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
	let environments: TradingEnvironment[] = ["BACKTEST", "PAPER", "LIVE"];

	if (envArg) {
		const envValue = envArg.split("=")[1]?.toUpperCase() as TradingEnvironment;
		if (["BACKTEST", "PAPER", "LIVE"].includes(envValue)) {
			environments = [envValue];
		} else {
			log.error({ envValue }, "Invalid environment. Must be BACKTEST, PAPER, or LIVE.");
			process.exit(1);
		}
	}

	return { force, environments };
}

interface SeedResult {
	environment: TradingEnvironment;
	trading: "created" | "skipped" | "replaced";
	agents: "created" | "skipped" | "replaced";
	universe: "created" | "skipped" | "replaced";
	constraints: "created" | "skipped" | "replaced";
}

async function seedEnvironment(
	environment: TradingEnvironment,
	tradingRepo: TradingConfigRepository,
	agentRepo: AgentConfigsRepository,
	universeRepo: UniverseConfigsRepository,
	constraintsRepo: ConstraintsConfigRepository,
	force: boolean
): Promise<SeedResult> {
	const result: SeedResult = {
		environment,
		trading: "skipped",
		agents: "skipped",
		universe: "skipped",
		constraints: "skipped",
	};

	const existingTrading = await tradingRepo.getActive(environment);
	const existingUniverse = await universeRepo.getActive(environment);
	const existingAgents = await agentRepo.getAll(environment);
	const existingConstraints = await constraintsRepo.getActive(environment);

	if (!existingTrading || force) {
		let version = 1;
		if (existingTrading && force) {
			await tradingRepo.setStatus(existingTrading.id, "archived");
			version = existingTrading.version + 1;
			result.trading = "replaced";
		} else {
			result.trading = "created";
		}

		const configId = `tc_${environment.toLowerCase()}_${Date.now()}_seed`;
		await tradingRepo.create({
			id: configId,
			environment,
			version,
			...getDefaultTradingConfig(),
			status: "active",
		});
	}

	const hasAllAgents = existingAgents.length === AGENT_TYPES.length;
	if (!hasAllAgents || force) {
		result.agents = existingAgents.length > 0 ? "replaced" : "created";

		for (const agentType of AGENT_TYPES) {
			const defaults = DEFAULT_AGENT_CONFIGS[agentType];
			await agentRepo.upsert(environment, agentType, {
				enabled: defaults.enabled,
				systemPromptOverride: null,
			});
		}
	}

	if (!existingUniverse || force) {
		if (existingUniverse && force) {
			await universeRepo.setStatus(existingUniverse.id, "archived");
			result.universe = "replaced";
		} else {
			result.universe = "created";
		}

		const draft = await universeRepo.saveDraft(environment, DEFAULT_UNIVERSE_CONFIG);
		await universeRepo.setStatus(draft.id, "active");
	}

	// Seed constraints config with defaults
	if (!existingConstraints || force) {
		if (existingConstraints && force) {
			await constraintsRepo.setStatus(existingConstraints.id, "archived");
			result.constraints = "replaced";
		} else {
			result.constraints = "created";
		}

		const configId = `cc_${environment.toLowerCase()}_${Date.now()}_seed`;
		await constraintsRepo.create({
			id: configId,
			environment,
			status: "active",
		});
	}

	return result;
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
	const universeRepo = new UniverseConfigsRepository();
	const constraintsRepo = new ConstraintsConfigRepository();

	const results: SeedResult[] = [];

	for (const env of options.environments) {
		log.info({ environment: env }, "Seeding environment");
		try {
			const result = await seedEnvironment(
				env,
				tradingRepo,
				agentRepo,
				universeRepo,
				constraintsRepo,
				options.force
			);
			results.push(result);
		} catch (error) {
			log.error(
				{ environment: env, error: error instanceof Error ? error.message : String(error) },
				"Failed to seed environment"
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
				universe: result.universe,
				constraints: result.constraints,
			},
			"Environment seed summary"
		);
	}
}

main().catch((error) => {
	log.error({ error: error instanceof Error ? error.message : String(error) }, "Fatal error");
	process.exit(1);
});
