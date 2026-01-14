/**
 * Alert Settings Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { AlertSettingsRepository, type CreateAlertSettingsInput } from "./alert-settings.js";
import { RepositoryError } from "./base.js";

async function setupTables(client: TursoClient): Promise<void> {
	// Create user table first (foreign key dependency)
	await client.run(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      two_factor_enabled INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `);

	// Create alert_settings table
	await client.run(`
    CREATE TABLE IF NOT EXISTS alert_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      enable_push INTEGER NOT NULL DEFAULT 1,
      enable_email INTEGER NOT NULL DEFAULT 1,
      email_address TEXT,
      critical_only INTEGER NOT NULL DEFAULT 0,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `);

	// Create index
	await client.run(`
    CREATE INDEX IF NOT EXISTS idx_alert_settings_user_id ON alert_settings(user_id)
  `);
}

async function createTestUser(client: TursoClient, userId: string): Promise<void> {
	await client.run(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`, [
		userId,
		`Test User ${userId}`,
		`${userId}@example.com`,
	]);
}

describe("AlertSettingsRepository", () => {
	let client: TursoClient;
	let repo: AlertSettingsRepository;

	beforeEach(async () => {
		client = await createInMemoryClient();
		await setupTables(client);
		repo = new AlertSettingsRepository(client);
	});

	afterEach(() => {
		client.close();
	});

	describe("create", () => {
		test("creates settings with all fields", async () => {
			await createTestUser(client, "user-001");

			const input: CreateAlertSettingsInput = {
				id: "as-001",
				userId: "user-001",
				enablePush: false,
				enableEmail: true,
				emailAddress: "custom@example.com",
				criticalOnly: true,
				quietHours: { start: "22:00", end: "08:00" },
			};

			const result = await repo.create(input);

			expect(result.id).toBe("as-001");
			expect(result.userId).toBe("user-001");
			expect(result.enablePush).toBe(false);
			expect(result.enableEmail).toBe(true);
			expect(result.emailAddress).toBe("custom@example.com");
			expect(result.criticalOnly).toBe(true);
			expect(result.quietHours).toEqual({ start: "22:00", end: "08:00" });
		});

		test("creates settings with defaults", async () => {
			await createTestUser(client, "user-002");

			const result = await repo.create({
				id: "as-defaults",
				userId: "user-002",
			});

			expect(result.enablePush).toBe(true);
			expect(result.enableEmail).toBe(true);
			expect(result.emailAddress).toBeNull();
			expect(result.criticalOnly).toBe(false);
			expect(result.quietHours).toBeNull();
		});

		test("throws on duplicate user_id", async () => {
			await createTestUser(client, "user-dup");
			await repo.create({ id: "as-dup-1", userId: "user-dup" });

			await expect(repo.create({ id: "as-dup-2", userId: "user-dup" })).rejects.toThrow(
				RepositoryError
			);
		});

		test("throws on duplicate id", async () => {
			await createTestUser(client, "user-a");
			await createTestUser(client, "user-b");
			await repo.create({ id: "as-same-id", userId: "user-a" });

			await expect(repo.create({ id: "as-same-id", userId: "user-b" })).rejects.toThrow(
				RepositoryError
			);
		});
	});

	describe("findById", () => {
		test("finds settings by ID", async () => {
			await createTestUser(client, "user-find");
			await repo.create({ id: "as-find", userId: "user-find" });

			const found = await repo.findById("as-find");

			expect(found).not.toBeNull();
			expect(found!.id).toBe("as-find");
			expect(found!.userId).toBe("user-find");
		});

		test("returns null for non-existent ID", async () => {
			const found = await repo.findById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("findByUserId", () => {
		test("finds settings by user ID", async () => {
			await createTestUser(client, "user-byid");
			await repo.create({
				id: "as-byid",
				userId: "user-byid",
				enablePush: false,
			});

			const found = await repo.findByUserId("user-byid");

			expect(found).not.toBeNull();
			expect(found!.userId).toBe("user-byid");
			expect(found!.enablePush).toBe(false);
		});

		test("returns null for non-existent user ID", async () => {
			const found = await repo.findByUserId("nonexistent-user");
			expect(found).toBeNull();
		});
	});

	describe("getOrCreate", () => {
		test("returns existing settings", async () => {
			await createTestUser(client, "user-existing");
			await repo.create({
				id: "as-existing",
				userId: "user-existing",
				criticalOnly: true,
			});

			const result = await repo.getOrCreate("user-existing");

			expect(result.id).toBe("as-existing");
			expect(result.criticalOnly).toBe(true);
		});

		test("creates new settings with defaults if not exists", async () => {
			await createTestUser(client, "user-new");

			const result = await repo.getOrCreate("user-new");

			expect(result.userId).toBe("user-new");
			expect(result.enablePush).toBe(true);
			expect(result.enableEmail).toBe(true);
			expect(result.emailAddress).toBeNull();
			expect(result.criticalOnly).toBe(false);
			expect(result.quietHours).toBeNull();
		});

		test("returns same settings on repeated calls", async () => {
			await createTestUser(client, "user-repeat");

			const first = await repo.getOrCreate("user-repeat");
			const second = await repo.getOrCreate("user-repeat");

			expect(first.id).toBe(second.id);
			expect(first.userId).toBe(second.userId);
		});
	});

	describe("update", () => {
		test("updates existing settings", async () => {
			await createTestUser(client, "user-update");
			await repo.create({
				id: "as-update",
				userId: "user-update",
				enablePush: true,
				enableEmail: true,
			});

			const updated = await repo.update("user-update", {
				enablePush: false,
				criticalOnly: true,
			});

			expect(updated.enablePush).toBe(false);
			expect(updated.enableEmail).toBe(true); // unchanged
			expect(updated.criticalOnly).toBe(true);
		});

		test("creates settings if not exists", async () => {
			await createTestUser(client, "user-create-via-update");

			const result = await repo.update("user-create-via-update", {
				enablePush: false,
				emailAddress: "new@example.com",
			});

			expect(result.userId).toBe("user-create-via-update");
			expect(result.enablePush).toBe(false);
			expect(result.emailAddress).toBe("new@example.com");
		});

		test("updates quiet hours", async () => {
			await createTestUser(client, "user-quiet");
			await repo.create({ id: "as-quiet", userId: "user-quiet" });

			const updated = await repo.update("user-quiet", {
				quietHours: { start: "23:00", end: "07:00" },
			});

			expect(updated.quietHours).toEqual({ start: "23:00", end: "07:00" });
		});

		test("clears quiet hours when set to null", async () => {
			await createTestUser(client, "user-clear-quiet");
			await repo.create({
				id: "as-clear-quiet",
				userId: "user-clear-quiet",
				quietHours: { start: "22:00", end: "06:00" },
			});

			const updated = await repo.update("user-clear-quiet", {
				quietHours: null,
			});

			expect(updated.quietHours).toBeNull();
		});

		test("updates email address", async () => {
			await createTestUser(client, "user-email");
			await repo.create({
				id: "as-email",
				userId: "user-email",
				emailAddress: "old@example.com",
			});

			const updated = await repo.update("user-email", {
				emailAddress: "new@example.com",
			});

			expect(updated.emailAddress).toBe("new@example.com");
		});

		test("clears email address when set to null", async () => {
			await createTestUser(client, "user-clear-email");
			await repo.create({
				id: "as-clear-email",
				userId: "user-clear-email",
				emailAddress: "old@example.com",
			});

			const updated = await repo.update("user-clear-email", {
				emailAddress: null,
			});

			expect(updated.emailAddress).toBeNull();
		});
	});

	describe("delete", () => {
		test("deletes settings by ID", async () => {
			await createTestUser(client, "user-delete");
			await repo.create({ id: "as-delete", userId: "user-delete" });

			const deleted = await repo.delete("as-delete");
			expect(deleted).toBe(true);

			const found = await repo.findById("as-delete");
			expect(found).toBeNull();
		});

		test("returns false for non-existent ID", async () => {
			const deleted = await repo.delete("nonexistent");
			expect(deleted).toBe(false);
		});
	});

	describe("deleteByUserId", () => {
		test("deletes settings by user ID", async () => {
			await createTestUser(client, "user-delete-by-uid");
			await repo.create({ id: "as-delete-uid", userId: "user-delete-by-uid" });

			const deleted = await repo.deleteByUserId("user-delete-by-uid");
			expect(deleted).toBe(true);

			const found = await repo.findByUserId("user-delete-by-uid");
			expect(found).toBeNull();
		});

		test("returns false for non-existent user ID", async () => {
			const deleted = await repo.deleteByUserId("nonexistent-user");
			expect(deleted).toBe(false);
		});
	});
});
