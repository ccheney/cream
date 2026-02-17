/**
 * Repository Base Utilities
 *
 * Common patterns, error handling, and query building for repositories.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

export type Row = Record<string, unknown>;

export type RepositoryErrorCode =
	| "NOT_FOUND"
	| "CONSTRAINT_VIOLATION"
	| "DUPLICATE_KEY"
	| "INVALID_DATA"
	| "CONNECTION_ERROR"
	| "QUERY_ERROR"
	| "TRANSACTION_ERROR";

export class RepositoryError extends Error {
	constructor(
		message: string,
		public readonly code: RepositoryErrorCode,
		public readonly table?: string,
		public override readonly cause?: Error,
	) {
		super(message);
		this.name = "RepositoryError";
	}

	static notFound(table: string, id: string): RepositoryError {
		return new RepositoryError(`${table} with id '${id}' not found`, "NOT_FOUND", table);
	}

	static duplicateKey(table: string, key: string, value: string): RepositoryError {
		return new RepositoryError(
			`${table} with ${key} '${value}' already exists`,
			"DUPLICATE_KEY",
			table,
		);
	}

	static constraintViolation(table: string, message: string, cause?: Error): RepositoryError {
		return new RepositoryError(
			`Constraint violation in ${table}: ${message}`,
			"CONSTRAINT_VIOLATION",
			table,
			cause,
		);
	}

	static fromSqliteError(table: string, error: Error): RepositoryError {
		const message = error.message.toLowerCase();

		if (message.includes("unique constraint")) {
			return new RepositoryError(error.message, "DUPLICATE_KEY", table, error);
		}

		if (message.includes("foreign key") || message.includes("constraint")) {
			return new RepositoryError(error.message, "CONSTRAINT_VIOLATION", table, error);
		}

		return new RepositoryError(
			`Query error in ${table}: ${error.message}`,
			"QUERY_ERROR",
			table,
			error,
		);
	}
}

export type { Filter, FilterOperator, Order, OrderDirection } from "./base-query-builder";
export { QueryBuilder, query } from "./base-query-builder";

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}

export function mapRow<T>(row: Row, mapper: (row: Row) => T): T {
	return mapper(row);
}

export function mapRows<T>(rows: Row[], mapper: (row: Row) => T): T[] {
	return rows.map(mapper);
}

export function toBoolean(value: unknown): boolean {
	return value === 1 || value === true || value === "1" || value === "true";
}

export function fromBoolean(value: boolean): number {
	return value ? 1 : 0;
}

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

export function toJson(value: unknown): string {
	return JSON.stringify(value);
}
