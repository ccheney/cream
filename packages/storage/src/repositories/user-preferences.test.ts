/**
 * User Preferences Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import { type CreateUserPreferencesInput, UserPreferencesRepository } from "./user-preferences.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      theme TEXT NOT NULL DEFAULT 'system',
      chart_timeframe TEXT NOT NULL DEFAULT '1M',
      feed_filters TEXT NOT NULL DEFAULT '[]',
      sidebar_collapsed INTEGER NOT NULL DEFAULT 0,
      notification_settings TEXT NOT NULL DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}',
      default_portfolio_view TEXT NOT NULL DEFAULT 'table',
      date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
      time_format TEXT NOT NULL DEFAULT '12h',
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

describe("UserPreferencesRepository", () => {
  let client: TursoClient;
  let repo: UserPreferencesRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new UserPreferencesRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  describe("create", () => {
    test("creates preferences with all fields", async () => {
      const input: CreateUserPreferencesInput = {
        id: "pref-001",
        userId: "user-001",
        theme: "dark",
        chartTimeframe: "1W",
        feedFilters: ["earnings", "news"],
        sidebarCollapsed: true,
        notificationSettings: {
          emailAlerts: false,
          pushNotifications: true,
          tradeConfirmations: true,
          dailySummary: false,
          riskAlerts: true,
        },
        defaultPortfolioView: "cards",
        dateFormat: "YYYY-MM-DD",
        timeFormat: "24h",
        currency: "EUR",
      };

      const result = await repo.create(input);

      expect(result.id).toBe("pref-001");
      expect(result.userId).toBe("user-001");
      expect(result.theme).toBe("dark");
      expect(result.chartTimeframe).toBe("1W");
      expect(result.feedFilters).toEqual(["earnings", "news"]);
      expect(result.sidebarCollapsed).toBe(true);
      expect(result.notificationSettings.emailAlerts).toBe(false);
      expect(result.notificationSettings.pushNotifications).toBe(true);
      expect(result.notificationSettings.tradeConfirmations).toBe(true);
      expect(result.notificationSettings.dailySummary).toBe(false);
      expect(result.notificationSettings.riskAlerts).toBe(true);
      expect(result.defaultPortfolioView).toBe("cards");
      expect(result.dateFormat).toBe("YYYY-MM-DD");
      expect(result.timeFormat).toBe("24h");
      expect(result.currency).toBe("EUR");
    });

    test("creates preferences with defaults", async () => {
      const result = await repo.create({
        id: "pref-defaults",
        userId: "user-defaults",
      });

      expect(result.theme).toBe("system");
      expect(result.chartTimeframe).toBe("1M");
      expect(result.feedFilters).toEqual([]);
      expect(result.sidebarCollapsed).toBe(false);
      expect(result.notificationSettings.emailAlerts).toBe(true);
      expect(result.notificationSettings.pushNotifications).toBe(false);
      expect(result.notificationSettings.tradeConfirmations).toBe(true);
      expect(result.notificationSettings.dailySummary).toBe(true);
      expect(result.notificationSettings.riskAlerts).toBe(true);
      expect(result.defaultPortfolioView).toBe("table");
      expect(result.dateFormat).toBe("MM/DD/YYYY");
      expect(result.timeFormat).toBe("12h");
      expect(result.currency).toBe("USD");
    });

    test("creates preferences with partial notification settings", async () => {
      const result = await repo.create({
        id: "pref-partial",
        userId: "user-partial",
        notificationSettings: {
          emailAlerts: false,
          // Other settings should use defaults
        },
      });

      expect(result.notificationSettings.emailAlerts).toBe(false);
      expect(result.notificationSettings.pushNotifications).toBe(false);
      expect(result.notificationSettings.tradeConfirmations).toBe(true);
      expect(result.notificationSettings.dailySummary).toBe(true);
      expect(result.notificationSettings.riskAlerts).toBe(true);
    });

    test("throws on duplicate user ID", async () => {
      await repo.create({ id: "pref-1", userId: "dup-user" });
      await expect(repo.create({ id: "pref-2", userId: "dup-user" })).rejects.toThrow(
        RepositoryError
      );
    });

    test("throws on duplicate ID", async () => {
      await repo.create({ id: "dup-id", userId: "user-1" });
      await expect(repo.create({ id: "dup-id", userId: "user-2" })).rejects.toThrow(
        RepositoryError
      );
    });
  });

  describe("findById", () => {
    test("finds preferences by ID", async () => {
      await repo.create({ id: "pref-find", userId: "user-find", theme: "light" });

      const found = await repo.findById("pref-find");
      expect(found).not.toBeNull();
      expect(found!.theme).toBe("light");
    });

    test("returns null for non-existent ID", async () => {
      const found = await repo.findById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("findByUserId", () => {
    test("finds preferences by user ID", async () => {
      await repo.create({ id: "pref-user", userId: "user-123", theme: "dark" });

      const found = await repo.findByUserId("user-123");
      expect(found).not.toBeNull();
      expect(found!.theme).toBe("dark");
      expect(found!.userId).toBe("user-123");
    });

    test("returns null for non-existent user ID", async () => {
      const found = await repo.findByUserId("nonexistent-user");
      expect(found).toBeNull();
    });
  });

  describe("getOrCreate", () => {
    test("returns existing preferences", async () => {
      await repo.create({ id: "pref-existing", userId: "user-existing", theme: "dark" });

      const result = await repo.getOrCreate("user-existing");

      expect(result.theme).toBe("dark");
      expect(result.userId).toBe("user-existing");
    });

    test("creates new preferences for new user", async () => {
      const result = await repo.getOrCreate("new-user");

      expect(result.userId).toBe("new-user");
      expect(result.theme).toBe("system"); // Default value
      expect(result.id).toContain("pref_new-user_");
    });

    test("creates with default values", async () => {
      const result = await repo.getOrCreate("brand-new-user");

      expect(result.theme).toBe("system");
      expect(result.chartTimeframe).toBe("1M");
      expect(result.feedFilters).toEqual([]);
      expect(result.sidebarCollapsed).toBe(false);
      expect(result.defaultPortfolioView).toBe("table");
    });
  });

  describe("update", () => {
    test("updates single field", async () => {
      await repo.create({ id: "pref-update", userId: "user-update", theme: "system" });

      const updated = await repo.update("user-update", { theme: "dark" });

      expect(updated.theme).toBe("dark");
      expect(updated.chartTimeframe).toBe("1M"); // Unchanged
    });

    test("updates multiple fields", async () => {
      await repo.create({ id: "pref-multi", userId: "user-multi" });

      const updated = await repo.update("user-multi", {
        theme: "light",
        chartTimeframe: "1W",
        sidebarCollapsed: true,
        currency: "GBP",
      });

      expect(updated.theme).toBe("light");
      expect(updated.chartTimeframe).toBe("1W");
      expect(updated.sidebarCollapsed).toBe(true);
      expect(updated.currency).toBe("GBP");
    });

    test("updates feed filters array", async () => {
      await repo.create({ id: "pref-filters", userId: "user-filters" });

      const updated = await repo.update("user-filters", {
        feedFilters: ["market", "alerts", "news"],
      });

      expect(updated.feedFilters).toEqual(["market", "alerts", "news"]);
    });

    test("merges notification settings", async () => {
      await repo.create({
        id: "pref-notif",
        userId: "user-notif",
        notificationSettings: {
          emailAlerts: true,
          pushNotifications: false,
          tradeConfirmations: true,
          dailySummary: true,
          riskAlerts: true,
        },
      });

      const updated = await repo.update("user-notif", {
        notificationSettings: {
          emailAlerts: false,
          pushNotifications: true,
        },
      });

      // Changed values
      expect(updated.notificationSettings.emailAlerts).toBe(false);
      expect(updated.notificationSettings.pushNotifications).toBe(true);
      // Preserved values
      expect(updated.notificationSettings.tradeConfirmations).toBe(true);
      expect(updated.notificationSettings.dailySummary).toBe(true);
      expect(updated.notificationSettings.riskAlerts).toBe(true);
    });

    test("throws for non-existent user", async () => {
      await expect(repo.update("nonexistent", { theme: "dark" })).rejects.toThrow(RepositoryError);
    });

    test("updates updated_at timestamp", async () => {
      await repo.create({ id: "pref-ts", userId: "user-ts" });
      const original = await repo.findByUserId("user-ts");

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update("user-ts", { theme: "dark" });

      expect(updated.updatedAt).not.toBe(original!.updatedAt);
    });
  });

  describe("reset", () => {
    test("resets all preferences to defaults", async () => {
      await repo.create({
        id: "pref-reset",
        userId: "user-reset",
        theme: "dark",
        chartTimeframe: "1Y",
        feedFilters: ["custom"],
        sidebarCollapsed: true,
        notificationSettings: {
          emailAlerts: false,
          pushNotifications: true,
          tradeConfirmations: false,
          dailySummary: false,
          riskAlerts: false,
        },
        defaultPortfolioView: "cards",
        dateFormat: "YYYY-MM-DD",
        timeFormat: "24h",
        currency: "JPY",
      });

      const reset = await repo.reset("user-reset");

      expect(reset.theme).toBe("system");
      expect(reset.chartTimeframe).toBe("1M");
      expect(reset.feedFilters).toEqual([]);
      expect(reset.sidebarCollapsed).toBe(false);
      expect(reset.notificationSettings.emailAlerts).toBe(true);
      expect(reset.notificationSettings.pushNotifications).toBe(false);
      expect(reset.notificationSettings.tradeConfirmations).toBe(true);
      expect(reset.notificationSettings.dailySummary).toBe(true);
      expect(reset.notificationSettings.riskAlerts).toBe(true);
      expect(reset.defaultPortfolioView).toBe("table");
      expect(reset.dateFormat).toBe("MM/DD/YYYY");
      expect(reset.timeFormat).toBe("12h");
      expect(reset.currency).toBe("USD");
    });

    test("preserves id and userId", async () => {
      await repo.create({ id: "pref-keep", userId: "user-keep", theme: "dark" });

      const reset = await repo.reset("user-keep");

      expect(reset.id).toBe("pref-keep");
      expect(reset.userId).toBe("user-keep");
    });

    test("throws for non-existent user", async () => {
      await expect(repo.reset("nonexistent")).rejects.toThrow(RepositoryError);
    });
  });

  describe("delete", () => {
    test("deletes preferences", async () => {
      await repo.create({ id: "pref-del", userId: "user-del" });

      const deleted = await repo.delete("user-del");
      expect(deleted).toBe(true);

      const found = await repo.findByUserId("user-del");
      expect(found).toBeNull();
    });

    test("returns false for non-existent user", async () => {
      const deleted = await repo.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("getDefaults", () => {
    test("returns default preferences object", () => {
      const defaults = repo.getDefaults();

      expect(defaults.theme).toBe("system");
      expect(defaults.chartTimeframe).toBe("1M");
      expect(defaults.feedFilters).toEqual([]);
      expect(defaults.sidebarCollapsed).toBe(false);
      expect(defaults.notificationSettings.emailAlerts).toBe(true);
      expect(defaults.notificationSettings.pushNotifications).toBe(false);
      expect(defaults.notificationSettings.tradeConfirmations).toBe(true);
      expect(defaults.notificationSettings.dailySummary).toBe(true);
      expect(defaults.notificationSettings.riskAlerts).toBe(true);
      expect(defaults.defaultPortfolioView).toBe("table");
      expect(defaults.dateFormat).toBe("MM/DD/YYYY");
      expect(defaults.timeFormat).toBe("12h");
      expect(defaults.currency).toBe("USD");
    });
  });

  describe("JSON column handling", () => {
    test("handles empty feed filters array", async () => {
      await repo.create({ id: "pref-empty", userId: "user-empty", feedFilters: [] });

      const found = await repo.findByUserId("user-empty");
      expect(found!.feedFilters).toEqual([]);
    });

    test("handles feed filters with special characters", async () => {
      const filters = ["filter:with:colons", "filter with spaces", 'filter"with"quotes'];
      await repo.create({ id: "pref-special", userId: "user-special", feedFilters: filters });

      const found = await repo.findByUserId("user-special");
      expect(found!.feedFilters).toEqual(filters);
    });

    test("handles notification settings with all false", async () => {
      await repo.create({
        id: "pref-allfalse",
        userId: "user-allfalse",
        notificationSettings: {
          emailAlerts: false,
          pushNotifications: false,
          tradeConfirmations: false,
          dailySummary: false,
          riskAlerts: false,
        },
      });

      const found = await repo.findByUserId("user-allfalse");
      expect(found!.notificationSettings.emailAlerts).toBe(false);
      expect(found!.notificationSettings.pushNotifications).toBe(false);
      expect(found!.notificationSettings.tradeConfirmations).toBe(false);
      expect(found!.notificationSettings.dailySummary).toBe(false);
      expect(found!.notificationSettings.riskAlerts).toBe(false);
    });
  });
});
