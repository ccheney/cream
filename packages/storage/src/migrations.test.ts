/**
 * Migration Runner Tests
 *
 * Tests the migration runner functionality with in-memory SQLite databases.
 * Environment: BACKTEST (set via CREAM_ENV=BACKTEST when running tests)
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import {
  getMigrationStatus,
  MigrationError,
  rollbackMigrations,
  runMigrations,
} from "./migrations.js";
import { createInMemoryClient, type TursoClient } from "./turso.js";

// ============================================
// Test Setup
// ============================================

const TEST_MIGRATIONS_DIR = `${import.meta.dir}/__test_migrations__`;

async function setupTestMigrations(): Promise<void> {
  await mkdir(TEST_MIGRATIONS_DIR, { recursive: true });

  // Migration 001: Create users table
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/001_users.sql`,
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    INSERT INTO schema_migrations (version, name) VALUES (1, 'users');
    `
  );

  // Rollback 001
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/001_users_down.sql`,
    `
    DROP INDEX IF EXISTS idx_users_email;
    DROP TABLE IF EXISTS users;
    DELETE FROM schema_migrations WHERE version = 1;
    `
  );

  // Migration 002: Create posts table
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/002_posts.sql`,
    `
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

    INSERT INTO schema_migrations (version, name) VALUES (2, 'posts');
    `
  );

  // Rollback 002
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/002_posts_down.sql`,
    `
    DROP INDEX IF EXISTS idx_posts_user_id;
    DROP TABLE IF EXISTS posts;
    DELETE FROM schema_migrations WHERE version = 2;
    `
  );

  // Migration 003: Add status column
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/003_add_status.sql`,
    `
    ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'draft'
      CHECK (status IN ('draft', 'published', 'archived'));

    INSERT INTO schema_migrations (version, name) VALUES (3, 'add_status');
    `
  );

  // Rollback 003 - SQLite doesn't support DROP COLUMN, so we recreate
  await Bun.write(
    `${TEST_MIGRATIONS_DIR}/003_add_status_down.sql`,
    `
    -- SQLite doesn't support DROP COLUMN, this is a placeholder
    -- In production, you'd recreate the table without the column
    DELETE FROM schema_migrations WHERE version = 3;
    `
  );
}

async function cleanupTestMigrations(): Promise<void> {
  try {
    await rm(TEST_MIGRATIONS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// ============================================
// Tests
// ============================================

describe("runMigrations", () => {
  let client: TursoClient;
  const logs: string[] = [];
  const logger = (msg: string) => logs.push(msg);

  beforeEach(async () => {
    await setupTestMigrations();
    client = await createInMemoryClient();
    logs.length = 0;
  });

  afterEach(async () => {
    client.close();
    await cleanupTestMigrations();
  });

  test("runs all pending migrations", async () => {
    const result = await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      logger,
    });

    expect(result.applied).toHaveLength(3);
    expect(result.applied[0]!.version).toBe(1);
    expect(result.applied[1]!.version).toBe(2);
    expect(result.applied[2]!.version).toBe(3);
    expect(result.currentVersion).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify tables exist
    const users = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(users).toHaveLength(1);

    const posts = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='posts'"
    );
    expect(posts).toHaveLength(1);
  });

  test("skips already applied migrations", async () => {
    // Run once
    await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      logger,
    });

    logs.length = 0;

    // Run again
    const result = await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      logger,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.currentVersion).toBe(3);
    expect(logs).toContain("No pending migrations");
  });

  test("applies migrations up to target version", async () => {
    const result = await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 2,
      logger,
    });

    expect(result.applied).toHaveLength(2);
    expect(result.currentVersion).toBe(2);

    // Verify posts table exists but doesn't have status column
    const columns = await client.execute<{ name: string }>("PRAGMA table_info(posts)");
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).not.toContain("status");
  });

  test("supports dry run mode", async () => {
    const result = await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      dryRun: true,
      logger,
    });

    expect(result.applied).toHaveLength(3);
    expect(logs.some((l) => l.includes("[DRY RUN]"))).toBe(true);

    // Verify no tables were created
    const users = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(users).toHaveLength(0);
  });
});

describe("rollbackMigrations", () => {
  let client: TursoClient;
  const logs: string[] = [];
  const logger = (msg: string) => logs.push(msg);

  beforeEach(async () => {
    await setupTestMigrations();
    client = await createInMemoryClient();
    logs.length = 0;

    // Apply all migrations first
    await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      logger: () => {},
    });
  });

  afterEach(async () => {
    client.close();
    await cleanupTestMigrations();
  });

  test("rolls back to target version", async () => {
    const result = await rollbackMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 1,
      logger,
    });

    expect(result.rolledBack).toHaveLength(2);
    expect(result.rolledBack[0]!.version).toBe(3); // Rolled back in reverse order
    expect(result.rolledBack[1]!.version).toBe(2);
    expect(result.currentVersion).toBe(1);

    // Verify posts table is gone
    const posts = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='posts'"
    );
    expect(posts).toHaveLength(0);

    // Users should still exist
    const users = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(users).toHaveLength(1);
  });

  test("rolls back all migrations when target is 0", async () => {
    const result = await rollbackMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 0,
      logger,
    });

    expect(result.rolledBack).toHaveLength(3);
    expect(result.currentVersion).toBe(0);

    // Verify all tables are gone
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')"
    );
    expect(tables).toHaveLength(0);
  });

  test("does nothing when already at target version", async () => {
    // First rollback to 1
    await rollbackMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 1,
      logger: () => {},
    });

    logs.length = 0;

    // Try to rollback to 1 again
    const result = await rollbackMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 1,
      logger,
    });

    expect(result.rolledBack).toHaveLength(0);
    expect(logs.some((l) => l.includes("Already at version"))).toBe(true);
  });

  test("supports dry run mode", async () => {
    const result = await rollbackMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 0,
      dryRun: true,
      logger,
    });

    expect(result.rolledBack).toHaveLength(3);
    expect(logs.some((l) => l.includes("[DRY RUN]"))).toBe(true);

    // Verify tables still exist
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')"
    );
    expect(tables).toHaveLength(2);
  });
});

describe("getMigrationStatus", () => {
  let client: TursoClient;

  beforeEach(async () => {
    await setupTestMigrations();
    client = await createInMemoryClient();
  });

  afterEach(async () => {
    client.close();
    await cleanupTestMigrations();
  });

  test("returns status with no applied migrations", async () => {
    const status = await getMigrationStatus(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
    });

    expect(status.currentVersion).toBe(0);
    expect(status.applied).toHaveLength(0);
    expect(status.pending).toHaveLength(3);
    expect(status.available).toHaveLength(3);
  });

  test("returns status after partial migration", async () => {
    await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      targetVersion: 2,
      logger: () => {},
    });

    const status = await getMigrationStatus(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
    });

    expect(status.currentVersion).toBe(2);
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0]!.version).toBe(3);
  });

  test("returns status after all migrations applied", async () => {
    await runMigrations(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
      logger: () => {},
    });

    const status = await getMigrationStatus(client, {
      migrationsDir: TEST_MIGRATIONS_DIR,
    });

    expect(status.currentVersion).toBe(3);
    expect(status.applied).toHaveLength(3);
    expect(status.pending).toHaveLength(0);
  });
});

describe("MigrationError", () => {
  test("contains migration context", () => {
    const migration = {
      version: 1,
      name: "test",
      filename: "001_test.sql",
      sql: "INVALID SQL",
    };
    const cause = new Error("syntax error");
    const error = new MigrationError("Migration failed", migration, cause);

    expect(error.name).toBe("MigrationError");
    expect(error.message).toBe("Migration failed");
    expect(error.migration).toBe(migration);
    expect(error.cause).toBe(cause);
  });
});
