/**
 * @cream/storage - Database storage layer
 *
 * This package provides:
 * - Drizzle ORM database client
 * - PostgreSQL connection management
 * - Type-safe repositories
 *
 * Uses PostgreSQL via Drizzle ORM:
 * @see https://orm.drizzle.team/docs/overview
 */

export const PACKAGE_NAME = "@cream/storage";
export const VERSION = "0.0.1";

// Drizzle ORM utilities (re-exported for convenience)
export { sql } from "drizzle-orm";
// Database client (Drizzle + PostgreSQL)
export { closeDb, type Database, getDb } from "./db.js";

// Connection pooling (generic pool implementation)
export {
	type ConnectionPool,
	createPool,
	type PoolConfig,
	type PooledConnection,
	type PoolStats,
} from "./pool.js";
// Repository base utilities
export {
	type Filter,
	type FilterOperator,
	fromBoolean,
	mapRow,
	mapRows,
	type Order,
	type OrderDirection,
	type PaginatedResult,
	type PaginationOptions,
	parseJson,
	QueryBuilder,
	query,
	RepositoryError,
	type RepositoryErrorCode,
	toBoolean,
	toJson,
} from "./repositories/base.js";
// Repositories
export * from "./repositories/index.js";
