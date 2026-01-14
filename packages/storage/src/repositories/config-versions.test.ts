/**
 * Config Versions Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import { ConfigVersionsRepository, type CreateConfigVersionInput } from "./config-versions.js";

async function setupTables(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS config_versions (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      config_json TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      activated_at TEXT,
      deactivated_at TEXT
    )
  `);
}

describe("ConfigVersionsRepository", () => {
	let client: TursoClient;
	let repo: ConfigVersionsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new ConfigVersionsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	test("creates a config version", async () => {
		const input: CreateConfigVersionInput = {
			id: "config-001",
			environment: "PAPER",
			config: { maxPositions: 10, riskLimit: 0.02 },
			description: "Initial config",
			createdBy: "admin",
		};

		const result = await repo.create(input);

		expect(result.id).toBe("config-001");
		expect(result.environment).toBe("PAPER");
		expect(result.config).toEqual({ maxPositions: 10, riskLimit: 0.02 });
		expect(result.description).toBe("Initial config");
		expect(result.createdBy).toBe("admin");
		expect(result.active).toBe(false);
	});

	test("creates config with minimal input", async () => {
		const result = await repo.create({
			id: "config-minimal",
			environment: "BACKTEST",
			config: { test: true },
		});

		expect(result.description).toBeNull();
		expect(result.createdBy).toBeNull();
	});

	test("finds config by ID", async () => {
		await repo.create({
			id: "config-find",
			environment: "LIVE",
			config: { setting: "value" },
		});

		const found = await repo.findById("config-find");
		expect(found).not.toBeNull();
		expect(found!.environment).toBe("LIVE");
	});

	test("returns null for non-existent ID", async () => {
		const found = await repo.findById("nonexistent");
		expect(found).toBeNull();
	});

	test("findByIdOrThrow throws for non-existent ID", async () => {
		await expect(repo.findByIdOrThrow("nonexistent")).rejects.toThrow(RepositoryError);
	});

	test("gets active config for environment", async () => {
		await repo.create({
			id: "config-inactive",
			environment: "PAPER",
			config: { version: 1 },
		});

		await repo.create({
			id: "config-active",
			environment: "PAPER",
			config: { version: 2 },
		});

		await repo.activate("config-active");

		const active = await repo.getActive("PAPER");
		expect(active).not.toBeNull();
		expect(active!.id).toBe("config-active");
		expect(active!.active).toBe(true);
	});

	test("returns null when no active config", async () => {
		await repo.create({
			id: "config-inactive",
			environment: "PAPER",
			config: {},
		});

		const active = await repo.getActive("PAPER");
		expect(active).toBeNull();
	});

	test("getActiveOrThrow throws when no active config", async () => {
		await expect(repo.getActiveOrThrow("PAPER")).rejects.toThrow("No active config found");
	});

	test("finds configs by environment", async () => {
		await repo.create({ id: "c1", environment: "PAPER", config: {} });
		await repo.create({ id: "c2", environment: "PAPER", config: {} });
		await repo.create({ id: "c3", environment: "LIVE", config: {} });

		const paperConfigs = await repo.findByEnvironment("PAPER");
		expect(paperConfigs).toHaveLength(2);
		expect(paperConfigs.every((c) => c.environment === "PAPER")).toBe(true);
	});

	test("findByEnvironment respects limit", async () => {
		for (let i = 0; i < 5; i++) {
			await repo.create({ id: `limit-${i}`, environment: "TEST", config: {} });
		}

		const limited = await repo.findByEnvironment("TEST", 3);
		expect(limited).toHaveLength(3);
	});

	test("activates a config", async () => {
		await repo.create({
			id: "to-activate",
			environment: "PAPER",
			config: { active: true },
		});

		const activated = await repo.activate("to-activate");

		expect(activated.active).toBe(true);
		expect(activated.activatedAt).not.toBeNull();
	});

	test("activation deactivates previous active config", async () => {
		await repo.create({ id: "first", environment: "PAPER", config: {} });
		await repo.create({ id: "second", environment: "PAPER", config: {} });

		await repo.activate("first");
		await repo.activate("second");

		const first = await repo.findById("first");
		const second = await repo.findById("second");

		expect(first!.active).toBe(false);
		expect(first!.deactivatedAt).not.toBeNull();
		expect(second!.active).toBe(true);
	});

	test("deactivates a config", async () => {
		await repo.create({ id: "to-deactivate", environment: "PAPER", config: {} });
		await repo.activate("to-deactivate");

		const deactivated = await repo.deactivate("to-deactivate");

		expect(deactivated.active).toBe(false);
		expect(deactivated.deactivatedAt).not.toBeNull();
	});

	test("deactivate throws for non-existent ID", async () => {
		await expect(repo.deactivate("nonexistent")).rejects.toThrow(RepositoryError);
	});

	test("compares two config versions", async () => {
		await repo.create({
			id: "compare-1",
			environment: "PAPER",
			config: { maxPositions: 10, riskLimit: 0.02, mode: "aggressive" },
		});
		await repo.create({
			id: "compare-2",
			environment: "PAPER",
			config: { maxPositions: 20, riskLimit: 0.02, newSetting: true },
		});

		const result = await repo.compare("compare-1", "compare-2");

		expect(result.config1.id).toBe("compare-1");
		expect(result.config2.id).toBe("compare-2");
		expect(result.differences.length).toBeGreaterThan(0);

		const maxPosDiff = result.differences.find((d) => d.path === "maxPositions");
		expect(maxPosDiff).toBeDefined();
		expect(maxPosDiff!.value1).toBe(10);
		expect(maxPosDiff!.value2).toBe(20);

		const modeDiff = result.differences.find((d) => d.path === "mode");
		expect(modeDiff).toBeDefined();
		expect(modeDiff!.value1).toBe("aggressive");
		expect(modeDiff!.value2).toBeUndefined();

		const newSettingDiff = result.differences.find((d) => d.path === "newSetting");
		expect(newSettingDiff).toBeDefined();
		expect(newSettingDiff!.value1).toBeUndefined();
		expect(newSettingDiff!.value2).toBe(true);
	});

	test("compare with identical configs has no differences", async () => {
		await repo.create({
			id: "same-1",
			environment: "PAPER",
			config: { setting: "value" },
		});
		await repo.create({
			id: "same-2",
			environment: "PAPER",
			config: { setting: "value" },
		});

		const result = await repo.compare("same-1", "same-2");
		expect(result.differences).toHaveLength(0);
	});

	test("deletes a config", async () => {
		await repo.create({ id: "to-delete", environment: "PAPER", config: {} });

		const deleted = await repo.delete("to-delete");
		expect(deleted).toBe(true);

		const found = await repo.findById("to-delete");
		expect(found).toBeNull();
	});

	test("delete returns false for non-existent ID", async () => {
		const deleted = await repo.delete("nonexistent");
		expect(deleted).toBe(false);
	});

	test("cannot delete active config", async () => {
		await repo.create({ id: "active-config", environment: "PAPER", config: {} });
		await repo.activate("active-config");

		await expect(repo.delete("active-config")).rejects.toThrow("Cannot delete active config");
	});

	test("gets config history", async () => {
		await repo.create({ id: "h1", environment: "PAPER", config: {} });
		await repo.create({ id: "h2", environment: "PAPER", config: {} });
		await repo.create({ id: "h3", environment: "PAPER", config: {} });

		await repo.activate("h1");
		await repo.activate("h2");
		await repo.activate("h3");

		const history = await repo.getHistory("PAPER");

		expect(history.versions).toHaveLength(3);
		expect(history.activationHistory).toHaveLength(3);
		// All configs should be in the activation history
		const activatedIds = history.activationHistory.map((h) => h.id);
		expect(activatedIds).toContain("h1");
		expect(activatedIds).toContain("h2");
		expect(activatedIds).toContain("h3");
	});

	test("getHistory with no activation history", async () => {
		await repo.create({ id: "no-activation", environment: "TEST", config: {} });

		const history = await repo.getHistory("TEST");

		expect(history.versions).toHaveLength(1);
		expect(history.activationHistory).toHaveLength(0);
	});

	test("handles complex nested config objects", async () => {
		const complexConfig = {
			trading: {
				maxPositions: 10,
				limits: {
					daily: 100000,
					perTrade: 10000,
				},
			},
			agents: ["tech_analyst", "risk_manager"],
			enabled: true,
		};

		await repo.create({
			id: "complex",
			environment: "PAPER",
			config: complexConfig,
		});

		const found = await repo.findById("complex");
		expect(found!.config).toEqual(complexConfig);
	});
});
