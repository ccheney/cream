/**
 * Turso Database Client
 *
 * Wrapper for @tursodatabase/database providing:
 * - Environment-aware connection (local vs sync)
 * - Type-safe query methods
 * - Automatic connection management
 *
 * @see https://github.com/tursodatabase/turso
 */

import { connect, type Database } from "@tursodatabase/database";
import { connect as connectSync, type Database as SyncDatabase } from "@tursodatabase/sync";
import { env, isBacktest, getEnvDatabaseSuffix } from "@cream/domain";

// ============================================
// Types
// ============================================

/**
 * Turso client configuration
 */
export interface TursoConfig {
  /** Database file path (for local mode) */
  path?: string;
  /** Remote sync URL (for sync mode) */
  syncUrl?: string;
  /** Authentication token for remote sync */
  authToken?: string;
  /** Sync interval in milliseconds */
  syncInterval?: number;
}

/**
 * Query result row
 */
export type Row = Record<string, unknown>;

/**
 * Batch statement
 */
export interface BatchStatement {
  sql: string;
  args?: unknown[];
}

/**
 * Turso client wrapper
 */
export interface TursoClient {
  /** Execute a SQL query */
  execute<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T[]>;
  /** Execute a single query and return first row */
  get<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T | undefined>;
  /** Execute a batch of statements */
  batch(statements: BatchStatement[]): Promise<void>;
  /** Run a statement (no return value) */
  run(sql: string, args?: unknown[]): Promise<{ changes: number; lastInsertRowid: bigint }>;
  /** Close the connection */
  close(): void;
  /** Sync with remote (only for sync mode) */
  sync?(): Promise<void>;
}

// ============================================
// Implementation
// ============================================

/**
 * Create a Turso client
 *
 * Automatically selects the appropriate connection mode:
 * - BACKTEST: Local in-memory or file database
 * - PAPER/LIVE: Sync with remote Turso server
 *
 * @example
 * ```typescript
 * // Auto-configured based on environment
 * const client = await createTursoClient();
 *
 * // Execute queries
 * const users = await client.execute<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE active = ?",
 *   [true]
 * );
 *
 * // Single row
 * const user = await client.get<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1]
 * );
 *
 * // Batch operations
 * await client.batch([
 *   { sql: "INSERT INTO users (name) VALUES (?)", args: ["Alice"] },
 *   { sql: "INSERT INTO users (name) VALUES (?)", args: ["Bob"] },
 * ]);
 *
 * // Close when done
 * client.close();
 * ```
 */
export async function createTursoClient(config: TursoConfig = {}): Promise<TursoClient> {
  const suffix = getEnvDatabaseSuffix();
  const defaultPath = `cream${suffix}.db`;

  // Determine connection mode based on environment
  if (isBacktest() || !config.syncUrl) {
    // Local mode: use embedded database
    return createLocalClient(config.path ?? defaultPath);
  }

  // Sync mode: connect with remote sync
  return createSyncClient({
    path: config.path ?? defaultPath,
    syncUrl: config.syncUrl,
    authToken: config.authToken ?? env.TURSO_AUTH_TOKEN,
    syncInterval: config.syncInterval,
  });
}

/**
 * Create a local (embedded) Turso client
 */
async function createLocalClient(path: string): Promise<TursoClient> {
  const db = await connect(path);

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.all(...args) as T[];
      }
      return stmt.all() as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.get(...args) as T | undefined;
      }
      return stmt.get() as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          stmt.run(...args);
        } else {
          stmt.run();
        }
      }
    },

    async run(sql: string, args: unknown[] = []): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      const result = args.length > 0 ? stmt.run(...args) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid ?? 0),
      };
    },

    close(): void {
      db.close();
    },
  };
}

/**
 * Create a sync-enabled Turso client
 */
async function createSyncClient(config: {
  path: string;
  syncUrl: string;
  authToken?: string;
  syncInterval?: number;
}): Promise<TursoClient> {
  const db = await connectSync(config.path, {
    url: config.syncUrl,
    authToken: config.authToken,
    syncInterval: config.syncInterval ?? 60000, // Default: sync every minute
  });

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.all(...args) as T[];
      }
      return stmt.all() as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.get(...args) as T | undefined;
      }
      return stmt.get() as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          stmt.run(...args);
        } else {
          stmt.run();
        }
      }
    },

    async run(sql: string, args: unknown[] = []): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      const result = args.length > 0 ? stmt.run(...args) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid ?? 0),
      };
    },

    close(): void {
      db.close();
    },

    async sync(): Promise<void> {
      await db.sync();
    },
  };
}

/**
 * Create an in-memory client for testing
 *
 * Uses Bun's native SQLite for better compatibility with in-memory databases.
 *
 * @example
 * ```typescript
 * const client = await createInMemoryClient();
 * await client.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
 * await client.run("INSERT INTO users (name) VALUES (?)", ["Test"]);
 * const users = await client.execute("SELECT * FROM users");
 * client.close();
 * ```
 */
export async function createInMemoryClient(): Promise<TursoClient> {
  // Use Bun's native SQLite for in-memory databases
  // The @tursodatabase/database library has issues with in-memory sequential schema changes
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.all(...args) as T[];
      }
      return stmt.all() as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return stmt.get(...args) as T | undefined;
      }
      return stmt.get() as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          stmt.run(...args);
        } else {
          stmt.run();
        }
      }
    },

    async run(sql: string, args: unknown[] = []): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      const result = args.length > 0 ? stmt.run(...args) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid ?? 0),
      };
    },

    close(): void {
      db.close();
    },
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the default database path based on environment
 */
export function getDefaultDatabasePath(): string {
  const suffix = getEnvDatabaseSuffix();
  return `cream${suffix}.db`;
}
