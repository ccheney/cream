/**
 * Repository Base Utilities
 *
 * Common patterns, error handling, and transaction support for repositories.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { TursoClient, Row } from "../turso.js";

// ============================================
// Error Handling
// ============================================

/**
 * Error codes for repository operations
 */
export type RepositoryErrorCode =
  | "NOT_FOUND"
  | "CONSTRAINT_VIOLATION"
  | "DUPLICATE_KEY"
  | "INVALID_DATA"
  | "CONNECTION_ERROR"
  | "QUERY_ERROR"
  | "TRANSACTION_ERROR";

/**
 * Repository error with context
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: RepositoryErrorCode,
    public readonly table?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "RepositoryError";
  }

  static notFound(table: string, id: string): RepositoryError {
    return new RepositoryError(
      `${table} with id '${id}' not found`,
      "NOT_FOUND",
      table
    );
  }

  static duplicateKey(table: string, key: string, value: string): RepositoryError {
    return new RepositoryError(
      `${table} with ${key} '${value}' already exists`,
      "DUPLICATE_KEY",
      table
    );
  }

  static constraintViolation(table: string, message: string, cause?: Error): RepositoryError {
    return new RepositoryError(
      `Constraint violation in ${table}: ${message}`,
      "CONSTRAINT_VIOLATION",
      table,
      cause
    );
  }

  static fromSqliteError(table: string, error: Error): RepositoryError {
    const message = error.message.toLowerCase();

    if (message.includes("unique constraint")) {
      return new RepositoryError(
        error.message,
        "DUPLICATE_KEY",
        table,
        error
      );
    }

    if (message.includes("foreign key") || message.includes("constraint")) {
      return new RepositoryError(
        error.message,
        "CONSTRAINT_VIOLATION",
        table,
        error
      );
    }

    return new RepositoryError(
      `Query error in ${table}: ${error.message}`,
      "QUERY_ERROR",
      table,
      error
    );
  }
}

// ============================================
// Transaction Support
// ============================================

/**
 * Execute operations within a transaction
 *
 * @example
 * ```typescript
 * await withTransaction(client, async (tx) => {
 *   await decisionsRepo.create(tx, decision);
 *   await ordersRepo.create(tx, order);
 * });
 * ```
 */
export async function withTransaction<T>(
  client: TursoClient,
  callback: (tx: TursoClient) => Promise<T>
): Promise<T> {
  await client.run("BEGIN TRANSACTION");
  try {
    const result = await callback(client);
    await client.run("COMMIT");
    return result;
  } catch (error) {
    await client.run("ROLLBACK");
    if (error instanceof RepositoryError) {
      throw error;
    }
    throw new RepositoryError(
      `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      "TRANSACTION_ERROR",
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

// ============================================
// Query Builder
// ============================================

/**
 * Filter operator types
 */
export type FilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN" | "IS NULL" | "IS NOT NULL";

/**
 * Filter definition
 */
export interface Filter {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

/**
 * Order direction
 */
export type OrderDirection = "ASC" | "DESC";

/**
 * Order definition
 */
export interface Order {
  field: string;
  direction: OrderDirection;
}

/**
 * Query builder for type-safe SQL construction
 */
export class QueryBuilder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitValue: number = 100;
  private offsetValue: number = 0;

  /**
   * Add a WHERE clause
   */
  where(field: string, operator: FilterOperator, value?: unknown): this {
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Add equality filter (shorthand)
   */
  eq(field: string, value: unknown): this {
    return this.where(field, "=", value);
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(field: string, direction: OrderDirection = "ASC"): this {
    this.orders.push({ field, direction });
    return this;
  }

  /**
   * Set LIMIT
   */
  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set OFFSET
   */
  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Build the query
   */
  build(baseQuery: string): { sql: string; args: unknown[] } {
    const args: unknown[] = [];
    let sql = baseQuery;

    // WHERE clause
    if (this.filters.length > 0) {
      const whereClauses: string[] = [];
      for (const filter of this.filters) {
        if (filter.operator === "IS NULL" || filter.operator === "IS NOT NULL") {
          whereClauses.push(`${filter.field} ${filter.operator}`);
        } else if (filter.operator === "IN" && Array.isArray(filter.value)) {
          const placeholders = filter.value.map(() => "?").join(", ");
          whereClauses.push(`${filter.field} IN (${placeholders})`);
          args.push(...filter.value);
        } else {
          whereClauses.push(`${filter.field} ${filter.operator} ?`);
          args.push(filter.value);
        }
      }
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    // ORDER BY clause
    if (this.orders.length > 0) {
      const orderClauses = this.orders.map((o) => `${o.field} ${o.direction}`);
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    // LIMIT and OFFSET
    sql += ` LIMIT ? OFFSET ?`;
    args.push(this.limitValue, this.offsetValue);

    return { sql, args };
  }

  /**
   * Reset the builder for reuse
   */
  reset(): this {
    this.filters = [];
    this.orders = [];
    this.limitValue = 100;
    this.offsetValue = 0;
    return this;
  }
}

/**
 * Create a new query builder
 */
export function query(): QueryBuilder {
  return new QueryBuilder();
}

// ============================================
// Pagination
// ============================================

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Execute a paginated query
 */
export async function paginate<T extends Row>(
  client: TursoClient,
  baseQuery: string,
  countQuery: string,
  args: unknown[],
  options: PaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  // Get total count
  const countResult = await client.get<{ count: number }>(countQuery, args);
  const total = countResult?.count ?? 0;

  // Get page data
  const sql = `${baseQuery} LIMIT ? OFFSET ?`;
  const data = await client.execute<T>(sql, [...args, pageSize, offset]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ============================================
// Type Utilities
// ============================================

/**
 * Convert database row to domain type with validation
 */
export function mapRow<T>(
  row: Row,
  mapper: (row: Row) => T
): T {
  return mapper(row);
}

/**
 * Convert multiple rows to domain types
 */
export function mapRows<T>(
  rows: Row[],
  mapper: (row: Row) => T
): T[] {
  return rows.map(mapper);
}

/**
 * Convert boolean-like SQLite values (0/1) to boolean
 */
export function toBoolean(value: unknown): boolean {
  return value === 1 || value === true || value === "1" || value === "true";
}

/**
 * Convert boolean to SQLite integer (0/1)
 */
export function fromBoolean(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Parse JSON column safely
 */
export function parseJson<T>(value: unknown, defaultValue: T): T {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
  return value as T;
}

/**
 * Stringify value for JSON column
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value);
}
