/**
 * Database Context
 *
 * Provides database client and repositories for API trading workflows.
 */

import {
  createInMemoryClient,
  createTursoClient,
  ExternalEventsRepository,
  OrdersRepository,
  PositionsRepository,
  runMigrations,
  ThesisStateRepository,
  type TursoClient,
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
    // biome-ignore lint/suspicious/noConsole: Migration logging is intentional
    logger: (msg) => console.log(`[API DB Migration] ${msg}`),
  });
  if (result.applied.length > 0) {
    // biome-ignore lint/suspicious/noConsole: Startup logging is intentional
    console.log(`[API DB] Applied ${result.applied.length} migration(s)`);
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
 * Get positions repository
 */
export async function getPositionsRepo(): Promise<PositionsRepository> {
  const client = await getDbClient();
  return new PositionsRepository(client);
}

/**
 * Get orders repository
 */
export async function getOrdersRepo(): Promise<OrdersRepository> {
  const client = await getDbClient();
  return new OrdersRepository(client);
}

/**
 * Get thesis state repository
 */
export async function getThesisStateRepo(): Promise<ThesisStateRepository> {
  const client = await getDbClient();
  return new ThesisStateRepository(client);
}

/**
 * Get external events repository
 */
export async function getExternalEventsRepo(): Promise<ExternalEventsRepository> {
  const client = await getDbClient();
  return new ExternalEventsRepository(client);
}
