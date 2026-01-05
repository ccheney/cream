/**
 * @cream/storage - Database storage layer
 *
 * This package provides:
 * - Turso database client wrapper
 * - Environment-aware database connections
 * - Type-safe query methods
 *
 * Uses Turso Database (Rust rewrite of SQLite):
 * @see https://github.com/tursodatabase/turso
 */

export const PACKAGE_NAME = "@cream/storage";
export const VERSION = "0.0.1";

// Turso client
export {
  type BatchStatement,
  createInMemoryClient,
  createTursoClient,
  getDefaultDatabasePath,
  type Row,
  type TursoClient,
  type TursoConfig,
} from "./turso.js";

// Migrations
export {
  type AppliedMigration,
  getMigrationStatus,
  type Migration,
  MigrationError,
  type MigrationOptions,
  type MigrationResult,
  rollbackMigrations,
  runMigrations,
} from "./migrations.js";
