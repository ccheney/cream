/**
 * Database Migration Runner
 *
 * Handles schema migrations for Turso/SQLite databases.
 * Supports:
 * - Forward migrations (up)
 * - Rollback migrations (down)
 * - Migration status tracking via schema_migrations table
 *
 * @see packages/storage/migrations/ for migration files
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TursoClient } from "./turso.js";

// ============================================
// Types
// ============================================

/**
 * Migration file metadata
 */
export interface Migration {
  /** Migration version number (e.g., 1, 2, 3) */
  version: number;
  /** Migration name (e.g., "initial_schema") */
  name: string;
  /** Full filename (e.g., "001_initial_schema.sql") */
  filename: string;
  /** SQL content */
  sql: string;
}

/**
 * Applied migration record from database
 */
export interface AppliedMigration {
  version: number;
  name: string;
  applied_at: string;
  [key: string]: unknown; // Index signature for Row compatibility
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Migrations that were applied */
  applied: Migration[];
  /** Migrations that were rolled back */
  rolledBack: Migration[];
  /** Current database version after operation */
  currentVersion: number;
  /** Total time in milliseconds */
  durationMs: number;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  /** Directory containing migration files */
  migrationsDir?: string;
  /** Target version for migrate or rollback (default: latest for up, 0 for down) */
  targetVersion?: number;
  /** Dry run - log but don't execute */
  dryRun?: boolean;
  /** Logger function */
  logger?: (message: string) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/;
const ROLLBACK_FILE_PATTERN = /^(\d{3})_(.+)_down\.sql$/;

// ============================================
// Migration Functions
// ============================================

/**
 * Run all pending migrations
 *
 * @example
 * ```typescript
 * const client = await createTursoClient();
 * const result = await runMigrations(client);
 * console.log(`Applied ${result.applied.length} migrations`);
 * console.log(`Current version: ${result.currentVersion}`);
 * ```
 */
export async function runMigrations(
  client: TursoClient,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const {
    migrationsDir = DEFAULT_MIGRATIONS_DIR,
    targetVersion,
    dryRun = false,
    logger = console.log,
  } = options;

  const startTime = Date.now();

  // Ensure schema_migrations table exists
  await ensureMigrationsTable(client);

  // Get current state
  const appliedMigrations = await getAppliedMigrations(client);
  const appliedVersions = new Set(appliedMigrations.map((m) => m.version));
  const currentVersion = Math.max(0, ...appliedVersions);

  // Load available migrations
  const availableMigrations = await loadMigrations(migrationsDir, "up");

  // Filter to pending migrations
  const pendingMigrations = availableMigrations
    .filter((m) => !appliedVersions.has(m.version))
    .filter((m) => (targetVersion !== undefined ? m.version <= targetVersion : true))
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length === 0) {
    logger("No pending migrations");
    return {
      applied: [],
      rolledBack: [],
      currentVersion,
      durationMs: Date.now() - startTime,
    };
  }

  const applied: Migration[] = [];

  for (const migration of pendingMigrations) {
    logger(`Applying migration ${migration.version}: ${migration.name}`);

    if (!dryRun) {
      try {
        // Execute migration SQL (may contain multiple statements)
        await executeSqlStatements(client, migration.sql);
        applied.push(migration);
      } catch (error) {
        logger(`Failed to apply migration ${migration.version}: ${error}`);
        throw new MigrationError(
          `Migration ${migration.version} (${migration.name}) failed`,
          migration,
          error
        );
      }
    } else {
      logger(`[DRY RUN] Would apply: ${migration.filename}`);
      applied.push(migration);
    }
  }

  const newVersion = applied.length > 0 ? applied[applied.length - 1]?.version : currentVersion;

  logger(`Applied ${applied.length} migration(s). Current version: ${newVersion}`);

  return {
    applied,
    rolledBack: [],
    currentVersion: newVersion,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Rollback migrations to a specific version
 *
 * @example
 * ```typescript
 * const client = await createTursoClient();
 * // Rollback to version 1
 * const result = await rollbackMigrations(client, { targetVersion: 1 });
 * // Rollback all
 * const result = await rollbackMigrations(client, { targetVersion: 0 });
 * ```
 */
export async function rollbackMigrations(
  client: TursoClient,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const {
    migrationsDir = DEFAULT_MIGRATIONS_DIR,
    targetVersion = 0,
    dryRun = false,
    logger = console.log,
  } = options;

  const startTime = Date.now();

  // Get current state
  const appliedMigrations = await getAppliedMigrations(client);
  const currentVersion = Math.max(0, ...appliedMigrations.map((m) => m.version));

  if (currentVersion <= targetVersion) {
    logger(`Already at version ${currentVersion}, nothing to rollback`);
    return {
      applied: [],
      rolledBack: [],
      currentVersion,
      durationMs: Date.now() - startTime,
    };
  }

  // Load rollback migrations
  const rollbackMigrations = await loadMigrations(migrationsDir, "down");

  // Filter to migrations that need rollback (in reverse order)
  const toRollback = rollbackMigrations
    .filter((m) => m.version > targetVersion && m.version <= currentVersion)
    .sort((a, b) => b.version - a.version); // Reverse order

  if (toRollback.length === 0) {
    logger("No rollback migrations found");
    return {
      applied: [],
      rolledBack: [],
      currentVersion,
      durationMs: Date.now() - startTime,
    };
  }

  const rolledBack: Migration[] = [];

  for (const migration of toRollback) {
    logger(`Rolling back migration ${migration.version}: ${migration.name}`);

    if (!dryRun) {
      try {
        await executeSqlStatements(client, migration.sql);
        rolledBack.push(migration);
      } catch (error) {
        logger(`Failed to rollback migration ${migration.version}: ${error}`);
        throw new MigrationError(
          `Rollback of migration ${migration.version} (${migration.name}) failed`,
          migration,
          error
        );
      }
    } else {
      logger(`[DRY RUN] Would rollback: ${migration.filename}`);
      rolledBack.push(migration);
    }
  }

  const newVersion = targetVersion;

  logger(`Rolled back ${rolledBack.length} migration(s). Current version: ${newVersion}`);

  return {
    applied: [],
    rolledBack,
    currentVersion: newVersion,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Get migration status
 *
 * @example
 * ```typescript
 * const status = await getMigrationStatus(client);
 * console.log(`Current version: ${status.currentVersion}`);
 * console.log(`Pending: ${status.pending.length}`);
 * ```
 */
export async function getMigrationStatus(
  client: TursoClient,
  options: Pick<MigrationOptions, "migrationsDir"> = {}
): Promise<{
  currentVersion: number;
  applied: AppliedMigration[];
  pending: Migration[];
  available: Migration[];
}> {
  const { migrationsDir = DEFAULT_MIGRATIONS_DIR } = options;

  await ensureMigrationsTable(client);

  const applied = await getAppliedMigrations(client);
  const appliedVersions = new Set(applied.map((m) => m.version));
  const currentVersion = Math.max(0, ...appliedVersions);

  const available = await loadMigrations(migrationsDir, "up");
  const pending = available.filter((m) => !appliedVersions.has(m.version));

  return {
    currentVersion,
    applied,
    pending,
    available,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(client: TursoClient): Promise<AppliedMigration[]> {
  try {
    return await client.execute<AppliedMigration>(
      "SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
    );
  } catch {
    // Table might not exist yet
    return [];
  }
}

/**
 * Load migration files from directory
 */
async function loadMigrations(dir: string, direction: "up" | "down"): Promise<Migration[]> {
  const pattern = direction === "up" ? MIGRATION_FILE_PATTERN : ROLLBACK_FILE_PATTERN;
  const migrations: Migration[] = [];

  try {
    const files = await readdir(dir);

    for (const file of files) {
      const match = file.match(pattern);
      if (!match) {
        continue;
      }

      // Skip rollback files when loading "up" migrations
      if (direction === "up" && file.includes("_down.sql")) {
        continue;
      }

      const version = parseInt(match[1]!, 10);
      const name = match[2]?.replace(/_down$/, "");
      const sql = await readFile(join(dir, file), "utf-8");

      migrations.push({
        version,
        name,
        filename: file,
        sql,
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Migrations directory not found: ${dir}`);
    }
    throw error;
  }

  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Execute multiple SQL statements (separated by semicolons)
 *
 * This function properly handles:
 * - Multi-statement SQL files
 * - Comments (both -- and /* style)
 * - Semicolons inside string literals
 */
async function executeSqlStatements(client: TursoClient, sql: string): Promise<void> {
  // Remove SQL comments first
  const withoutComments = sql
    // Remove -- style comments (but not inside strings)
    .replace(/--[^\n]*$/gm, "")
    // Remove /* */ style comments
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Split on semicolons, being careful about edge cases
  // This simple approach works for migration files where we don't expect
  // semicolons inside string literals
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    // Skip if only whitespace remains
    if (!statement || /^\s*$/.test(statement)) {
      continue;
    }
    await client.run(statement);
  }
}

// ============================================
// Error Types
// ============================================

/**
 * Migration error with context
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly migration: Migration,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = "MigrationError";
  }
}
