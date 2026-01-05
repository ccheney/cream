/**
 * Database Context
 *
 * Provides database client and repositories for API routes.
 */

import {
  AgentOutputsRepository,
  AlertsRepository,
  BacktestsRepository,
  ConfigVersionsRepository,
  createInMemoryClient,
  createTursoClient,
  DecisionsRepository,
  OrdersRepository,
  PortfolioSnapshotsRepository,
  PositionsRepository,
  type TursoClient,
} from "@cream/storage";

// ============================================
// Database Client Singleton
// ============================================

let dbClient: TursoClient | null = null;

/**
 * Get or create the database client
 */
export async function getDbClient(): Promise<TursoClient> {
  if (!dbClient) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;

    if (tursoUrl?.startsWith("http://") || tursoUrl?.startsWith("https://")) {
      // Remote Turso server (Docker or cloud)
      dbClient = await createTursoClient({
        syncUrl: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN ?? undefined,
      });
    } else if (tursoUrl === ":memory:" || process.env.NODE_ENV === "test") {
      // In-memory for testing
      dbClient = await createInMemoryClient();
    } else {
      // Local file database
      dbClient = await createTursoClient({
        path: tursoUrl ?? "cream.db",
      });
    }
  }
  return dbClient;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (dbClient) {
    dbClient.close();
    dbClient = null;
  }
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
