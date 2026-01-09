import { type ExecutionContext, env, getEnvDatabaseSuffix, isBacktest } from "@cream/domain";
import { connect } from "@tursodatabase/database";
import { connect as connectSync } from "@tursodatabase/sync";

export interface TursoConfig {
  path?: string;
  syncUrl?: string;
  authToken?: string;
  syncInterval?: number;
}

export type Row = Record<string, unknown>;

export interface BatchStatement {
  sql: string;
  args?: unknown[];
}

export interface TursoClient {
  execute<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T[]>;
  get<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T | undefined>;
  batch(statements: BatchStatement[]): Promise<void>;
  run(sql: string, args?: unknown[]): Promise<{ changes: number; lastInsertRowid: bigint }>;
  close(): void | Promise<void>;
  sync?(): Promise<void>;
}

function getParentDir(dir: string): string {
  const lastSlash = dir.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : dir.slice(0, lastSlash);
}

async function findProjectRoot(): Promise<string> {
  let dir = process.cwd();

  while (dir !== "/" && dir !== getParentDir(dir)) {
    const pkgPath = `${dir}/package.json`;
    const file = Bun.file(pkgPath);
    if (await file.exists()) {
      try {
        const pkg = await file.json();
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // Ignore parse errors
      }
    }
    dir = getParentDir(dir);
  }

  return process.cwd();
}

export async function createTursoClient(
  ctx: ExecutionContext,
  config: TursoConfig = {}
): Promise<TursoClient> {
  const suffix = getEnvDatabaseSuffix(ctx);
  const dbName = `cream${suffix}.db`;
  const projectRoot = await findProjectRoot();
  const defaultPath = `${projectRoot}/${dbName}`;

  if (isBacktest(ctx) || !config.syncUrl) {
    return createLocalClient(config.path ?? defaultPath);
  }

  return createSyncClient({
    path: config.path ?? defaultPath,
    syncUrl: config.syncUrl,
    authToken: config.authToken ?? env.TURSO_AUTH_TOKEN,
    syncInterval: config.syncInterval,
  });
}

async function createLocalClient(path: string): Promise<TursoClient> {
  const db = await connect(path);

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return (await stmt.all(...args)) as T[];
      }
      return (await stmt.all()) as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return (await stmt.get(...args)) as T | undefined;
      }
      return (await stmt.get()) as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          await stmt.run(...args);
        } else {
          await stmt.run();
        }
      }
    },

    async run(
      sql: string,
      args: unknown[] = []
    ): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      const result = args.length > 0 ? await stmt.run(...args) : await stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid ?? 0),
      };
    },

    close(): Promise<void> {
      return db.close();
    },
  };
}

async function createSyncClient(config: {
  path: string;
  syncUrl: string;
  authToken?: string;
  syncInterval?: number;
}): Promise<TursoClient> {
  const db = await connectSync({
    path: config.path,
    url: config.syncUrl,
    authToken: config.authToken,
    // Note: syncInterval is not part of DatabaseOpts in @tursodatabase/sync
    // Sync must be triggered manually via db.pull() and db.push()
  });

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return (await stmt.all(...args)) as T[];
      }
      return (await stmt.all()) as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        return (await stmt.get(...args)) as T | undefined;
      }
      return (await stmt.get()) as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          await stmt.run(...args);
        } else {
          await stmt.run();
        }
      }
    },

    async run(
      sql: string,
      args: unknown[] = []
    ): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      const result = args.length > 0 ? await stmt.run(...args) : await stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: BigInt(result.lastInsertRowid ?? 0),
      };
    },

    close(): Promise<void> {
      return db.close();
    },

    async sync(): Promise<void> {
      await db.pull();
      await db.push();
    },
  };
}

export async function createInMemoryClient(): Promise<TursoClient> {
  // Bun's native SQLite handles in-memory sequential schema changes better than @tursodatabase/database
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");

  return {
    async execute<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        // @ts-expect-error - Bun SQLite type signature is strict but accepts unknown[]
        return stmt.all(...args) as T[];
      }
      return stmt.all() as T[];
    },

    async get<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      if (args.length > 0) {
        // @ts-expect-error - Bun SQLite type signature is strict but accepts unknown[]
        return stmt.get(...args) as T | undefined;
      }
      return stmt.get() as T | undefined;
    },

    async batch(statements: BatchStatement[]): Promise<void> {
      for (const { sql, args } of statements) {
        const stmt = db.prepare(sql);
        if (args && args.length > 0) {
          // @ts-expect-error - Bun SQLite type signature is strict but accepts unknown[]
          stmt.run(...args);
        } else {
          stmt.run();
        }
      }
    },

    async run(
      sql: string,
      args: unknown[] = []
    ): Promise<{ changes: number; lastInsertRowid: bigint }> {
      const stmt = db.prepare(sql);
      // @ts-expect-error - Bun SQLite type signature is strict but accepts unknown[]
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

export async function getDefaultDatabasePath(ctx: ExecutionContext): Promise<string> {
  const suffix = getEnvDatabaseSuffix(ctx);
  const dbName = `cream${suffix}.db`;
  const projectRoot = await findProjectRoot();
  return `${projectRoot}/${dbName}`;
}
