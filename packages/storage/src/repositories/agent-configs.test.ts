/**
 * Agent Configs Repository Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import {
	AGENT_TYPES,
	AgentConfigsRepository,
	type CreateAgentConfigInput,
} from "./agent-configs.js";
import { RepositoryError } from "./base.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      system_prompt_override TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

	// Create unique constraint on environment + agent_type
	await client.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_env_agent
    ON agent_configs(environment, agent_type)
  `);
}

describe("AgentConfigsRepository", () => {
	let client: TursoClient;
	let repo: AgentConfigsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new AgentConfigsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	describe("create", () => {
		test("creates config with all fields", async () => {
			const input: CreateAgentConfigInput = {
				id: "ac-001",
				environment: "PAPER",
				agentType: "news_analyst",
				systemPromptOverride: "Custom prompt for testing",
				enabled: true,
			};

			const result = await repo.create(input);

			expect(result.id).toBe("ac-001");
			expect(result.environment).toBe("PAPER");
			expect(result.agentType).toBe("news_analyst");
			expect(result.systemPromptOverride).toBe("Custom prompt for testing");
			expect(result.enabled).toBe(true);
		});

		test("creates config with defaults", async () => {
			const result = await repo.create({
				id: "ac-defaults",
				environment: "BACKTEST",
				agentType: "trader",
			});

			expect(result.systemPromptOverride).toBeNull();
			expect(result.enabled).toBe(true);
		});

		test("throws on duplicate ID", async () => {
			await repo.create({ id: "dup", environment: "PAPER", agentType: "trader" });
			await expect(
				repo.create({ id: "dup", environment: "PAPER", agentType: "critic" })
			).rejects.toThrow(RepositoryError);
		});

		test("throws on duplicate environment/agent_type", async () => {
			await repo.create({ id: "ac-1", environment: "PAPER", agentType: "trader" });
			await expect(
				repo.create({ id: "ac-2", environment: "PAPER", agentType: "trader" })
			).rejects.toThrow(RepositoryError);
		});

		test("creates disabled config", async () => {
			const result = await repo.create({
				id: "ac-disabled",
				environment: "PAPER",
				agentType: "critic",
				enabled: false,
			});

			expect(result.enabled).toBe(false);
		});
	});

	describe("findById", () => {
		test("finds config by ID", async () => {
			await repo.create({ id: "ac-find", environment: "LIVE", agentType: "news_analyst" });

			const found = await repo.findById("ac-find");
			expect(found).not.toBeNull();
			expect(found!.environment).toBe("LIVE");
			expect(found!.agentType).toBe("news_analyst");
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

	describe("get", () => {
		test("gets config for specific agent in environment", async () => {
			await repo.create({ id: "ac-get", environment: "PAPER", agentType: "risk_manager" });

			const config = await repo.get("PAPER", "risk_manager");

			expect(config).not.toBeNull();
			expect(config!.agentType).toBe("risk_manager");
			expect(config!.environment).toBe("PAPER");
		});

		test("returns null for non-existent combination", async () => {
			await repo.create({ id: "ac-other", environment: "PAPER", agentType: "trader" });

			const config = await repo.get("PAPER", "risk_manager");

			expect(config).toBeNull();
		});

		test("returns correct config for environment", async () => {
			await repo.create({
				id: "ac-paper",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "paper prompt",
			});
			await repo.create({
				id: "ac-live",
				environment: "LIVE",
				agentType: "trader",
				systemPromptOverride: "live prompt",
			});

			const paperConfig = await repo.get("PAPER", "trader");
			const liveConfig = await repo.get("LIVE", "trader");

			expect(paperConfig!.systemPromptOverride).toBe("paper prompt");
			expect(liveConfig!.systemPromptOverride).toBe("live prompt");
		});
	});

	describe("getOrThrow", () => {
		test("throws when no config found", async () => {
			await expect(repo.getOrThrow("PAPER", "trader")).rejects.toThrow("No config found");
		});
	});

	describe("getAll", () => {
		test("gets all configs for environment", async () => {
			await repo.create({ id: "ac-1", environment: "PAPER", agentType: "trader" });
			await repo.create({ id: "ac-2", environment: "PAPER", agentType: "critic" });
			await repo.create({ id: "ac-3", environment: "LIVE", agentType: "trader" });

			const configs = await repo.getAll("PAPER");

			expect(configs).toHaveLength(2);
			expect(configs.every((c) => c.environment === "PAPER")).toBe(true);
		});

		test("returns empty array when no configs", async () => {
			const configs = await repo.getAll("PAPER");

			expect(configs).toHaveLength(0);
		});

		test("returns configs ordered by agent_type", async () => {
			await repo.create({ id: "ac-z", environment: "PAPER", agentType: "trader" });
			await repo.create({ id: "ac-a", environment: "PAPER", agentType: "critic" });
			await repo.create({ id: "ac-m", environment: "PAPER", agentType: "news_analyst" });

			const configs = await repo.getAll("PAPER");

			expect(configs[0]!.agentType).toBe("critic");
			expect(configs[1]!.agentType).toBe("news_analyst");
			expect(configs[2]!.agentType).toBe("trader");
		});
	});

	describe("getEnabled", () => {
		test("gets only enabled configs", async () => {
			await repo.create({ id: "ac-enabled", environment: "PAPER", agentType: "trader" });
			await repo.create({
				id: "ac-disabled",
				environment: "PAPER",
				agentType: "critic",
				enabled: false,
			});

			const configs = await repo.getEnabled("PAPER");

			expect(configs).toHaveLength(1);
			expect(configs[0]!.agentType).toBe("trader");
		});
	});

	describe("update", () => {
		test("updates systemPromptOverride", async () => {
			await repo.create({ id: "ac-prompt", environment: "PAPER", agentType: "trader" });

			const updated = await repo.update("ac-prompt", { systemPromptOverride: "New prompt" });

			expect(updated.systemPromptOverride).toBe("New prompt");
		});

		test("clears systemPromptOverride with null", async () => {
			await repo.create({
				id: "ac-clear",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "Old prompt",
			});

			const updated = await repo.update("ac-clear", { systemPromptOverride: null });

			expect(updated.systemPromptOverride).toBeNull();
		});

		test("updates enabled", async () => {
			await repo.create({ id: "ac-dis", environment: "PAPER", agentType: "trader" });

			const updated = await repo.update("ac-dis", { enabled: false });

			expect(updated.enabled).toBe(false);
		});

		test("updates multiple fields", async () => {
			await repo.create({ id: "ac-multi", environment: "PAPER", agentType: "trader" });

			const updated = await repo.update("ac-multi", {
				systemPromptOverride: "Custom prompt",
				enabled: false,
			});

			expect(updated.systemPromptOverride).toBe("Custom prompt");
			expect(updated.enabled).toBe(false);
		});

		test("throws for non-existent ID", async () => {
			await expect(repo.update("nonexistent", { enabled: false })).rejects.toThrow(RepositoryError);
		});
	});

	describe("upsert", () => {
		test("creates new config when none exists", async () => {
			const config = await repo.upsert("PAPER", "trader", {
				systemPromptOverride: "Custom prompt",
				enabled: true,
			});

			expect(config.environment).toBe("PAPER");
			expect(config.agentType).toBe("trader");
			expect(config.systemPromptOverride).toBe("Custom prompt");
		});

		test("updates existing config", async () => {
			await repo.create({
				id: "ac-existing",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "Old prompt",
			});

			const config = await repo.upsert("PAPER", "trader", {
				systemPromptOverride: "New prompt",
			});

			expect(config.id).toBe("ac-existing");
			expect(config.systemPromptOverride).toBe("New prompt");
		});
	});

	describe("setEnabled", () => {
		test("enables agent", async () => {
			await repo.create({
				id: "ac-enable",
				environment: "PAPER",
				agentType: "trader",
				enabled: false,
			});

			const enabled = await repo.setEnabled("ac-enable", true);

			expect(enabled.enabled).toBe(true);
		});

		test("disables agent", async () => {
			await repo.create({ id: "ac-disable", environment: "PAPER", agentType: "trader" });

			const disabled = await repo.setEnabled("ac-disable", false);

			expect(disabled.enabled).toBe(false);
		});
	});

	describe("resetToDefaults", () => {
		test("resets existing config to defaults", async () => {
			await repo.create({
				id: "ac-reset",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "Custom prompt",
				enabled: false,
			});

			const reset = await repo.resetToDefaults("PAPER", "trader");

			expect(reset.id).toBe("ac-reset");
			expect(reset.systemPromptOverride).toBeNull();
			expect(reset.enabled).toBe(true);
		});

		test("creates config with defaults when none exists", async () => {
			const config = await repo.resetToDefaults("PAPER", "news_analyst");

			expect(config.environment).toBe("PAPER");
			expect(config.agentType).toBe("news_analyst");
			expect(config.enabled).toBe(true);
		});
	});

	describe("delete", () => {
		test("deletes config", async () => {
			await repo.create({ id: "ac-del", environment: "PAPER", agentType: "trader" });

			const deleted = await repo.delete("ac-del");
			expect(deleted).toBe(true);

			const found = await repo.findById("ac-del");
			expect(found).toBeNull();
		});

		test("returns false for non-existent ID", async () => {
			const deleted = await repo.delete("nonexistent");
			expect(deleted).toBe(false);
		});
	});

	describe("deleteAll", () => {
		test("deletes all configs for environment", async () => {
			await repo.create({ id: "ac-1", environment: "PAPER", agentType: "trader" });
			await repo.create({ id: "ac-2", environment: "PAPER", agentType: "critic" });
			await repo.create({ id: "ac-3", environment: "LIVE", agentType: "trader" });

			const deleted = await repo.deleteAll("PAPER");

			expect(deleted).toBe(2);

			const paperConfigs = await repo.getAll("PAPER");
			expect(paperConfigs).toHaveLength(0);

			const liveConfigs = await repo.getAll("LIVE");
			expect(liveConfigs).toHaveLength(1);
		});

		test("returns 0 when no configs to delete", async () => {
			const deleted = await repo.deleteAll("PAPER");
			expect(deleted).toBe(0);
		});
	});

	describe("cloneToEnvironment", () => {
		test("clones all configs to another environment", async () => {
			await repo.create({
				id: "ac-src-1",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "trader prompt",
			});
			await repo.create({
				id: "ac-src-2",
				environment: "PAPER",
				agentType: "critic",
				systemPromptOverride: "critic prompt",
			});

			const cloned = await repo.cloneToEnvironment("PAPER", "LIVE");

			expect(cloned).toHaveLength(2);

			const liveTrader = await repo.get("LIVE", "trader");
			expect(liveTrader).not.toBeNull();
			expect(liveTrader!.systemPromptOverride).toBe("trader prompt");

			const liveCritic = await repo.get("LIVE", "critic");
			expect(liveCritic).not.toBeNull();
			expect(liveCritic!.systemPromptOverride).toBe("critic prompt");
		});

		test("updates existing configs in target environment", async () => {
			await repo.create({
				id: "ac-src",
				environment: "PAPER",
				agentType: "trader",
				systemPromptOverride: "prompt-paper",
			});
			await repo.create({
				id: "ac-existing",
				environment: "LIVE",
				agentType: "trader",
				systemPromptOverride: "prompt-live",
			});

			await repo.cloneToEnvironment("PAPER", "LIVE");

			const liveTrader = await repo.get("LIVE", "trader");
			expect(liveTrader!.id).toBe("ac-existing");
			expect(liveTrader!.systemPromptOverride).toBe("prompt-paper");
		});
	});

	describe("AGENT_TYPES constant", () => {
		test("contains all 7 agent types", () => {
			expect(AGENT_TYPES).toHaveLength(7);
			expect(AGENT_TYPES).toContain("news_analyst");
			expect(AGENT_TYPES).toContain("fundamentals_analyst");
			expect(AGENT_TYPES).toContain("bullish_researcher");
			expect(AGENT_TYPES).toContain("bearish_researcher");
			expect(AGENT_TYPES).toContain("trader");
			expect(AGENT_TYPES).toContain("risk_manager");
			expect(AGENT_TYPES).toContain("critic");
		});
	});
});
