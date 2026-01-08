/**
 * Database Context for Worker
 *
 * Provides database client and RuntimeConfigService for loading scheduler config.
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import { type CreamEnvironment, createContext, type ExecutionContext } from "@cream/domain";
import {
  AgentConfigsRepository,
  createInMemoryClient,
  createTursoClient,
  runMigrations,
  TradingConfigRepository,
  type TursoClient,
  UniverseConfigsRepository,
} from "@cream/storage";

/**
 * Create ExecutionContext for database initialization.
 * DB client is created at worker startup.
 */
function createDbContext(): ExecutionContext {
  const envValue = process.env.CREAM_ENV || "PAPER";
  return createContext(envValue as CreamEnvironment, "scheduled");
}

// ============================================
// Database Client Singleton
// ============================================

let dbClient: TursoClient | null = null;
let initPromise: Promise<TursoClient> | null = null;

/**
 * Get or create the database client.
 * Uses a lock to prevent race conditions during initialization.
 */
export async function getDbClient(): Promise<TursoClient> {
  // Fast path: already initialized
  if (dbClient) {
    return dbClient;
  }

  // Initialization in progress: wait for it
  if (initPromise) {
    return initPromise;
  }

  // First caller: start initialization
  initPromise = initializeDb();

  try {
    dbClient = await initPromise;
    return dbClient;
  } catch (error) {
    // Reset on failure so next call can retry
    initPromise = null;
    throw error;
  }
}

/**
 * Initialize database client and run migrations.
 */
async function initializeDb(): Promise<TursoClient> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const ctx = createDbContext();
  let client: TursoClient;

  if (tursoUrl?.startsWith("http://") || tursoUrl?.startsWith("https://")) {
    // Remote Turso server (Docker or cloud)
    client = await createTursoClient(ctx, {
      syncUrl: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN ?? undefined,
    });
  } else if (tursoUrl === ":memory:" || process.env.NODE_ENV === "test") {
    // In-memory for testing
    client = await createInMemoryClient();
  } else {
    // Local file database
    client = await createTursoClient(ctx, {
      path: tursoUrl ?? "cream.db",
    });
  }

  // Run migrations on first connection
  await runMigrations(client, {
    logger: (_msg) => {},
  });

  return client;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (dbClient) {
    dbClient.close();
    dbClient = null;
  }
  initPromise = null;
}

// ============================================
// Runtime Config Service
// ============================================

let runtimeConfigService: RuntimeConfigService | null = null;

/**
 * Get the runtime configuration service
 */
export async function getRuntimeConfigService(): Promise<RuntimeConfigService> {
  if (runtimeConfigService) {
    return runtimeConfigService;
  }

  const client = await getDbClient();
  const tradingRepo = new TradingConfigRepository(client);
  const agentRepo = new AgentConfigsRepository(client);
  const universeRepo = new UniverseConfigsRepository(client);

  runtimeConfigService = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
  return runtimeConfigService;
}

/**
 * Reset the runtime config service to force reload on next access
 */
export function resetRuntimeConfigService(): void {
  runtimeConfigService = null;
}
