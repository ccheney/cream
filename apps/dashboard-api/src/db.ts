/**
 * Database Context
 *
 * Provides database client and repositories for API routes.
 * Schema version: 2 - Added status, decision_id, metadata, unrealized_pnl_pct to positions
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import {
  AgentConfigsRepository,
  AgentOutputsRepository,
  AlertsRepository,
  BacktestsRepository,
  ConfigVersionsRepository,
  createInMemoryClient,
  createTursoClient,
  DecisionsRepository,
  FactorZooRepository,
  OrdersRepository,
  PortfolioSnapshotsRepository,
  PositionsRepository,
  RegimeLabelsRepository,
  runMigrations,
  ThesisStateRepository,
  TradingConfigRepository,
  type TursoClient,
  UniverseConfigsRepository,
} from "@cream/storage";

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
  let client: TursoClient;

  if (tursoUrl?.startsWith("http://") || tursoUrl?.startsWith("https://")) {
    // Remote Turso server (Docker or cloud)
    client = await createTursoClient({
      syncUrl: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN ?? undefined,
    });
  } else if (tursoUrl === ":memory:" || process.env.NODE_ENV === "test") {
    // In-memory for testing
    client = await createInMemoryClient();
  } else {
    // Local file database
    client = await createTursoClient({
      path: tursoUrl ?? "cream.db",
    });
  }

  // Run migrations on first connection
  const result = await runMigrations(client, {
    logger: (_msg) => {},
  });
  if (result.applied.length > 0) {
  }

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
// Repository Factories
// ============================================

/**
 * Get decisions repository
 */
export async function getDecisionsRepo(): Promise<DecisionsRepository> {
  const client = await getDbClient();
  return new DecisionsRepository(client);
}

/**
 * Get alerts repository
 */
export async function getAlertsRepo(): Promise<AlertsRepository> {
  const client = await getDbClient();
  return new AlertsRepository(client);
}

/**
 * Get orders repository
 */
export async function getOrdersRepo(): Promise<OrdersRepository> {
  const client = await getDbClient();
  return new OrdersRepository(client);
}

/**
 * Get positions repository
 */
export async function getPositionsRepo(): Promise<PositionsRepository> {
  const client = await getDbClient();
  return new PositionsRepository(client);
}

/**
 * Get agent outputs repository
 */
export async function getAgentOutputsRepo(): Promise<AgentOutputsRepository> {
  const client = await getDbClient();
  return new AgentOutputsRepository(client);
}

/**
 * Get portfolio snapshots repository
 */
export async function getPortfolioSnapshotsRepo(): Promise<PortfolioSnapshotsRepository> {
  const client = await getDbClient();
  return new PortfolioSnapshotsRepository(client);
}

/**
 * Get backtests repository
 */
export async function getBacktestsRepo(): Promise<BacktestsRepository> {
  const client = await getDbClient();
  return new BacktestsRepository(client);
}

/**
 * Get config versions repository
 */
export async function getConfigVersionsRepo(): Promise<ConfigVersionsRepository> {
  const client = await getDbClient();
  return new ConfigVersionsRepository(client);
}

/**
 * Get thesis state repository
 */
export async function getThesesRepo(): Promise<ThesisStateRepository> {
  const client = await getDbClient();
  return new ThesisStateRepository(client);
}

/**
 * Get factor zoo repository
 */
export async function getFactorZooRepo(): Promise<FactorZooRepository> {
  const client = await getDbClient();
  return new FactorZooRepository(client);
}

/**
 * Get regime labels repository
 */
export async function getRegimeLabelsRepo(): Promise<RegimeLabelsRepository> {
  const client = await getDbClient();
  return new RegimeLabelsRepository(client);
}

/**
 * Get trading config repository
 */
export async function getTradingConfigRepo(): Promise<TradingConfigRepository> {
  const client = await getDbClient();
  return new TradingConfigRepository(client);
}

/**
 * Get agent configs repository
 */
export async function getAgentConfigsRepo(): Promise<AgentConfigsRepository> {
  const client = await getDbClient();
  return new AgentConfigsRepository(client);
}

/**
 * Get universe configs repository
 */
export async function getUniverseConfigsRepo(): Promise<UniverseConfigsRepository> {
  const client = await getDbClient();
  return new UniverseConfigsRepository(client);
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

  const tradingRepo = await getTradingConfigRepo();
  const agentRepo = await getAgentConfigsRepo();
  const universeRepo = await getUniverseConfigsRepo();

  runtimeConfigService = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
  return runtimeConfigService;
}
