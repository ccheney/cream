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
 * @see docs/plans/22-self-service-dashboard.md (Phase 1)
 */

import { createContext } from "@cream/domain";
import {
  AGENT_TYPES,
  AgentConfigsRepository,
  type AgentType,
} from "./repositories/agent-configs.js";
import { TradingConfigRepository, type TradingEnvironment } from "./repositories/trading-config.js";
import { UniverseConfigsRepository } from "./repositories/universe-configs.js";
import { createTursoClient } from "./turso.js";

/** Extracted from packages/config/configs/default.yaml and apps/worker/src/index.ts */
const DEFAULT_TRADING_CONFIG = {
  maxConsensusIterations: 3,
  agentTimeoutMs: 30_000,
  totalConsensusTimeoutMs: 300_000,

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

const DEFAULT_AGENT_CONFIGS: Record<
  AgentType,
  {
    model: string;
    temperature: number;
    maxTokens: number;
    enabled: boolean;
  }
> = {
  technical_analyst: {
    model: "gemini-3-pro-preview",
    temperature: 0,
    maxTokens: 4096,
    enabled: true,
  },
  news_analyst: {
    model: "gemini-3-pro-preview",
    temperature: 0,
    maxTokens: 4096,
    enabled: true,
  },
  fundamentals_analyst: {
    model: "gemini-3-pro-preview",
    temperature: 0,
    maxTokens: 4096,
    enabled: true,
  },
  bullish_researcher: {
    model: "gemini-3-pro-preview",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  bearish_researcher: {
    model: "gemini-3-pro-preview",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  trader: {
    model: "gemini-3-pro-preview",
    temperature: 0,
    maxTokens: 4096,
    enabled: true,
  },
  risk_manager: {
    model: "gemini-3-pro-preview",
    temperature: 0,
    maxTokens: 4096,
    enabled: true,
  },
  critic: {
    model: "gemini-3-pro-preview",
    temperature: 0.2,
    maxTokens: 4096,
    enabled: true,
  },
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
      // biome-ignore lint/suspicious/noConsole: CLI script requires console output
      console.error(`Invalid environment: ${envValue}. Must be BACKTEST, PAPER, or LIVE.`);
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
}

async function seedEnvironment(
  environment: TradingEnvironment,
  tradingRepo: TradingConfigRepository,
  agentRepo: AgentConfigsRepository,
  universeRepo: UniverseConfigsRepository,
  force: boolean
): Promise<SeedResult> {
  const result: SeedResult = {
    environment,
    trading: "skipped",
    agents: "skipped",
    universe: "skipped",
  };

  const existingTrading = await tradingRepo.getActive(environment);
  const existingUniverse = await universeRepo.getActive(environment);
  const existingAgents = await agentRepo.getAll(environment);

  if (!existingTrading || force) {
    if (existingTrading && force) {
      await tradingRepo.setStatus(existingTrading.id, "archived");
      result.trading = "replaced";
    } else {
      result.trading = "created";
    }

    const configId = `tc_${environment.toLowerCase()}_v1_seed`;
    await tradingRepo.create({
      id: configId,
      environment,
      version: 1,
      ...DEFAULT_TRADING_CONFIG,
      status: "active",
    });
  }

  const hasAllAgents = existingAgents.length === AGENT_TYPES.length;
  if (!hasAllAgents || force) {
    result.agents = existingAgents.length > 0 ? "replaced" : "created";

    for (const agentType of AGENT_TYPES) {
      const defaults = DEFAULT_AGENT_CONFIGS[agentType];
      await agentRepo.upsert(environment, agentType, {
        model: defaults.model,
        temperature: defaults.temperature,
        maxTokens: defaults.maxTokens,
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

  return result;
}

async function main(): Promise<void> {
  const options = parseArgs();

  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.log("🌱 Seeding runtime configuration...\n");
  if (options.force) {
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log("⚠️  Force mode enabled - existing configs will be replaced\n");
  }

  // BACKTEST context is safe for seeding any environment's config
  const ctx = createContext("BACKTEST", "manual");
  const client = await createTursoClient(ctx);

  const tradingRepo = new TradingConfigRepository(client);
  const agentRepo = new AgentConfigsRepository(client);
  const universeRepo = new UniverseConfigsRepository(client);

  const results: SeedResult[] = [];

  for (const env of options.environments) {
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log(`📦 Seeding ${env} environment...`);
    try {
      const result = await seedEnvironment(
        env,
        tradingRepo,
        agentRepo,
        universeRepo,
        options.force
      );
      results.push(result);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: CLI script requires console output
      console.error(`   ❌ Failed to seed ${env}:`, error);
      process.exit(1);
    }
  }

  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.log("\n✅ Seed complete!\n");
  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.log("Summary:");
  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.log("─".repeat(50));

  for (const result of results) {
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log(`\n${result.environment}:`);
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log(`  Trading config: ${formatStatus(result.trading)}`);
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log(`  Agent configs:  ${formatStatus(result.agents)}`);
    // biome-ignore lint/suspicious/noConsole: CLI script requires console output
    console.log(`  Universe config: ${formatStatus(result.universe)}`);
  }

  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.log("\n");
}

function formatStatus(status: "created" | "skipped" | "replaced"): string {
  switch (status) {
    case "created":
      return "✨ Created";
    case "skipped":
      return "⏭️  Skipped (already exists)";
    case "replaced":
      return "🔄 Replaced";
  }
}

main().catch((error) => {
  // biome-ignore lint/suspicious/noConsole: CLI script requires console output
  console.error("Fatal error:", error);
  process.exit(1);
});
