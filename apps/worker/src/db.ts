/**
 * Database Context for Worker
 *
 * Provides database client, RuntimeConfigService for loading scheduler config,
 * and HelixDB client for memory persistence validation.
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createHelixClientFromEnv, type HealthCheckResult, type HelixClient } from "@cream/helix";
import {
  AgentConfigsRepository,
  createInMemoryClient,
  createTursoClient,
  runMigrations,
  TradingConfigRepository,
  type TursoClient,
  UniverseConfigsRepository,
} from "@cream/storage";
import { log } from "./logger";

/**
 * Create ExecutionContext for database initialization.
 * DB client is created at worker startup.
 */
function createDbContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
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
  const ctx = createDbContext();
  let client: TursoClient;

  if (process.env.NODE_ENV === "test") {
    // In-memory for testing
    client = await createInMemoryClient();
  } else {
    // createTursoClient reads TURSO_DATABASE_URL and handles HTTP/local automatically
    client = await createTursoClient(ctx);
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

// ============================================
// HelixDB Client
// ============================================

let helixClient: HelixClient | null = null;

/**
 * Get or create the HelixDB client singleton.
 * Returns null if client creation fails (e.g., missing helix-ts module).
 */
export function getHelixClient(): HelixClient | null {
  if (helixClient) {
    return helixClient;
  }

  try {
    helixClient = createHelixClientFromEnv();
    return helixClient;
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to create HelixDB client"
    );
    return null;
  }
}

/**
 * Close the HelixDB client connection.
 */
export function closeHelixClient(): void {
  if (helixClient) {
    helixClient.close();
    helixClient = null;
  }
}

/**
 * Perform a health check on HelixDB.
 *
 * @returns Health check result with latency and any error
 */
export async function checkHelixHealth(): Promise<HealthCheckResult> {
  const client = getHelixClient();
  if (!client) {
    return {
      healthy: false,
      latencyMs: 0,
      error: "HelixDB client could not be created",
    };
  }
  return client.healthCheck();
}

/**
 * HelixDB validation error - thrown when startup validation fails.
 */
export class HelixDBValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelixDBValidationError";
  }
}

/**
 * Validate HelixDB connectivity at startup.
 *
 * This function should be called during service initialization for PAPER and LIVE environments.
 * In BACKTEST mode, validation is optional but recommended.
 *
 * @param ctx - ExecutionContext with environment information
 * @param options - Validation options
 * @throws HelixDBValidationError if validation fails in PAPER/LIVE mode
 */
export async function validateHelixDBAtStartup(
  ctx: ExecutionContext,
  options: {
    /** Whether to fail fast (throw) on health check failure. Default: true for PAPER/LIVE */
    failFast?: boolean;
    /** Maximum allowed latency in ms. Default: 5000 */
    maxLatencyMs?: number;
  } = {}
): Promise<HealthCheckResult> {
  const isBacktestEnv = isBacktest(ctx);
  const { failFast = !isBacktestEnv, maxLatencyMs = 5000 } = options;

  log.info({ environment: ctx.environment }, "Validating HelixDB connection");

  const health = await checkHelixHealth();

  if (!health.healthy) {
    const errorMsg =
      `HelixDB health check failed: ${health.error}. ` +
      `Ensure HelixDB is running at ${process.env.HELIX_HOST ?? "localhost"}:${process.env.HELIX_PORT ?? "6969"}`;

    log.error({ error: health.error }, errorMsg);

    if (failFast) {
      throw new HelixDBValidationError(errorMsg);
    }

    log.warn({}, "Continuing despite HelixDB health check failure (failFast=false)");
  } else if (health.latencyMs > maxLatencyMs) {
    log.warn({ latencyMs: health.latencyMs, maxLatencyMs }, "HelixDB latency exceeds threshold");
  } else {
    log.info({ latencyMs: health.latencyMs }, "HelixDB health check passed");
  }

  return health;
}

/**
 * Validate HelixDB and exit if validation fails.
 *
 * Use this at the entry point of services that require HelixDB.
 *
 * @param ctx - ExecutionContext with environment information
 */
export async function validateHelixDBOrExit(ctx: ExecutionContext): Promise<void> {
  try {
    await validateHelixDBAtStartup(ctx, { failFast: !isBacktest(ctx) });
  } catch (error) {
    if (error instanceof HelixDBValidationError) {
      log.error(
        { environment: ctx.environment, error: error.message },
        "HelixDB validation failed for worker service. Please ensure HelixDB is running and restart."
      );
      process.exit(1);
    }
    throw error;
  }
}
