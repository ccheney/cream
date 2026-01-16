/**
 * Drizzle PostgreSQL Database Client
 *
 * Provides environment-aware database connections using the pg driver.
 * Connection strings are selected based on CREAM_ENV environment variable.
 *
 * @example
 * import { db } from "@cream/storage";
 * const users = await db.select().from(schema.user);
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Environment-to-database mapping
const DATABASE_URLS: Record<string, string | undefined> = {
	BACKTEST: Bun.env.DATABASE_URL_BACKTEST ?? Bun.env.DATABASE_URL,
	PAPER: Bun.env.DATABASE_URL_PAPER ?? Bun.env.DATABASE_URL,
	LIVE: Bun.env.DATABASE_URL,
};

// Test database URL
const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;

/**
 * Get the database URL for the current environment
 */
function getDatabaseUrl(): string {
	// Use test database when running tests
	if (Bun.env.NODE_ENV === "test" && TEST_DATABASE_URL) {
		return TEST_DATABASE_URL;
	}

	const env = Bun.env.CREAM_ENV ?? "BACKTEST";
	const url = DATABASE_URLS[env];

	if (!url) {
		throw new Error(
			`DATABASE_URL not configured for environment: ${env}. ` +
				`Set DATABASE_URL_${env} or DATABASE_URL environment variable.`
		);
	}

	return url;
}

// Singleton pool and database instances
let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

/**
 * Get the PostgreSQL connection pool
 * Creates a new pool on first call
 */
export function getPool(): Pool {
	if (!_pool) {
		const url = getDatabaseUrl();
		_pool = new Pool({
			connectionString: url,
			max: 10, // Maximum connections in pool
			idleTimeoutMillis: 20000, // Close idle connections after 20 seconds
			connectionTimeoutMillis: 10000, // Connection timeout
		});
	}
	return _pool;
}

/**
 * Get the Drizzle database instance
 * Creates a new instance on first call using the connection pool
 */
export function getDb(): NodePgDatabase<typeof schema> {
	if (!_db) {
		_db = drizzle(getPool(), { schema });
	}
	return _db;
}

/**
 * Primary export for database access
 * Use this for all database operations
 *
 * @example
 * import { db } from "@cream/storage";
 *
 * // Select
 * const users = await db.select().from(schema.user);
 *
 * // Insert
 * await db.insert(schema.user).values({ name: "John", email: "john@example.com" });
 *
 * // With relations
 * const usersWithPosts = await db.query.user.findMany({
 *   with: { sessions: true }
 * });
 */
export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
	get(_, prop) {
		return getDb()[prop as keyof NodePgDatabase<typeof schema>];
	},
});

/**
 * Close the database connection pool
 * Should be called on graceful shutdown
 */
export async function closeDb(): Promise<void> {
	if (_pool) {
		await _pool.end();
		_pool = null;
		_db = null;
	}
}

/**
 * Execute a function within a transaction
 * Automatically rolls back on error
 *
 * @example
 * await withTransaction(async (tx) => {
 *   await tx.insert(schema.orders).values(order);
 *   await tx.update(schema.positions).set({ qty: newQty }).where(eq(positions.id, positionId));
 * });
 */
export async function withTransaction<T>(
	fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>
): Promise<T> {
	const database = getDb();
	return database.transaction(fn);
}

/**
 * Check if the database connection is healthy
 */
export async function healthCheck(): Promise<boolean> {
	try {
		const pool = getPool();
		const client = await pool.connect();
		try {
			await client.query("SELECT 1");
			return true;
		} finally {
			client.release();
		}
	} catch {
		return false;
	}
}

/**
 * Get connection pool statistics
 */
export function getPoolStats(): {
	totalCount: number;
	idleCount: number;
	waitingCount: number;
} {
	const pool = getPool();
	return {
		totalCount: pool.totalCount,
		idleCount: pool.idleCount,
		waitingCount: pool.waitingCount,
	};
}

// Re-export schema for convenience
export { schema };

// Export types
export type { NodePgDatabase };
export type Database = NodePgDatabase<typeof schema>;
