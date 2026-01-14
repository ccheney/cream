/**
 * Alerts Repository
 *
 * Data access for system alerts table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { Row, TursoClient } from "../turso.js";
import {
	fromBoolean,
	type PaginatedResult,
	type PaginationOptions,
	paginate,
	parseJson,
	query,
	RepositoryError,
	toBoolean,
	toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Alert severity
 */
export type AlertSeverity = "info" | "warning" | "critical";

/**
 * Alert type
 */
export type AlertType =
	| "connection"
	| "order"
	| "position"
	| "risk"
	| "system"
	| "market"
	| "agent";

/**
 * Alert entity
 */
export interface Alert {
	id: string;
	severity: AlertSeverity;
	type: AlertType;
	title: string;
	message: string;
	metadata: Record<string, unknown>;
	acknowledged: boolean;
	acknowledgedBy: string | null;
	acknowledgedAt: string | null;
	environment: string;
	createdAt: string;
	expiresAt: string | null;
}

/**
 * Create alert input
 */
export interface CreateAlertInput {
	id: string;
	severity: AlertSeverity;
	type: AlertType;
	title: string;
	message: string;
	metadata?: Record<string, unknown>;
	environment: string;
	expiresAt?: string | null;
}

/**
 * Alert filter options
 */
export interface AlertFilters {
	severity?: AlertSeverity | AlertSeverity[];
	type?: AlertType | AlertType[];
	acknowledged?: boolean;
	environment?: string;
	fromDate?: string;
	toDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapAlertRow(row: Row): Alert {
	return {
		id: row.id as string,
		severity: row.severity as AlertSeverity,
		type: row.type as AlertType,
		title: row.title as string,
		message: row.message as string,
		metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
		acknowledged: toBoolean(row.acknowledged),
		acknowledgedBy: row.acknowledged_by as string | null,
		acknowledgedAt: row.acknowledged_at as string | null,
		environment: row.environment as string,
		createdAt: row.created_at as string,
		expiresAt: row.expires_at as string | null,
	};
}

// ============================================
// Repository
// ============================================

/**
 * Alerts repository
 */
export class AlertsRepository {
	private readonly table = "alerts";

	constructor(private readonly client: TursoClient) {}

	/**
	 * Create a new alert
	 */
	async create(input: CreateAlertInput): Promise<Alert> {
		try {
			await this.client.run(
				`INSERT INTO ${this.table} (
          id, severity, type, title, message, metadata,
          acknowledged, environment, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
				[
					input.id,
					input.severity,
					input.type,
					input.title,
					input.message,
					toJson(input.metadata ?? {}),
					input.environment,
					input.expiresAt ?? null,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(input.id) as Promise<Alert>;
	}

	/**
	 * Find alert by ID
	 */
	async findById(id: string): Promise<Alert | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

		return row ? mapAlertRow(row) : null;
	}

	/**
	 * Find alert by ID, throw if not found
	 */
	async findByIdOrThrow(id: string): Promise<Alert> {
		const alert = await this.findById(id);
		if (!alert) {
			throw RepositoryError.notFound(this.table, id);
		}
		return alert;
	}

	/**
	 * Find alerts with filters
	 */
	async findMany(
		filters: AlertFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Alert>> {
		const builder = query().orderBy("created_at", "DESC");

		if (filters.severity) {
			if (Array.isArray(filters.severity)) {
				builder.where("severity", "IN", filters.severity);
			} else {
				builder.eq("severity", filters.severity);
			}
		}
		if (filters.type) {
			if (Array.isArray(filters.type)) {
				builder.where("type", "IN", filters.type);
			} else {
				builder.eq("type", filters.type);
			}
		}
		if (filters.acknowledged !== undefined) {
			builder.eq("acknowledged", fromBoolean(filters.acknowledged));
		}
		if (filters.environment) {
			builder.eq("environment", filters.environment);
		}
		if (filters.fromDate) {
			builder.where("created_at", ">=", filters.fromDate);
		}
		if (filters.toDate) {
			builder.where("created_at", "<=", filters.toDate);
		}

		const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
		const baseSql = sql.split(" LIMIT ")[0] ?? sql;
		const countSql = baseSql.replace("SELECT *", "SELECT COUNT(*) as count");

		const result = await paginate<Row>(
			this.client,
			baseSql,
			countSql,
			args.slice(0, -2),
			pagination
		);

		return {
			...result,
			data: result.data.map(mapAlertRow),
		};
	}

	/**
	 * Find unacknowledged alerts
	 */
	async findUnacknowledged(environment: string, limit = 50): Promise<Alert[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM ${this.table}
       WHERE environment = ? AND acknowledged = 0
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT ?`,
			[environment, limit]
		);

		return rows.map(mapAlertRow);
	}

	/**
	 * Find recent alerts
	 */
	async findRecent(environment: string, limit = 20): Promise<Alert[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
			[environment, limit]
		);

		return rows.map(mapAlertRow);
	}

	/**
	 * Acknowledge an alert
	 */
	async acknowledge(id: string, acknowledgedBy: string): Promise<Alert> {
		const now = new Date().toISOString();

		const result = await this.client.run(
			`UPDATE ${this.table} SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`,
			[acknowledgedBy, now, id]
		);

		if (result.changes === 0) {
			throw RepositoryError.notFound(this.table, id);
		}

		return this.findByIdOrThrow(id);
	}

	/**
	 * Acknowledge multiple alerts
	 */
	async acknowledgeMany(ids: string[], acknowledgedBy: string): Promise<number> {
		if (ids.length === 0) {
			return 0;
		}

		const now = new Date().toISOString();
		const placeholders = ids.map(() => "?").join(", ");

		const result = await this.client.run(
			`UPDATE ${this.table} SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id IN (${placeholders})`,
			[acknowledgedBy, now, ...ids]
		);

		return result.changes;
	}

	/**
	 * Acknowledge all unacknowledged alerts
	 */
	async acknowledgeAll(environment: string, acknowledgedBy: string): Promise<number> {
		const now = new Date().toISOString();

		const result = await this.client.run(
			`UPDATE ${this.table} SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE environment = ? AND acknowledged = 0`,
			[acknowledgedBy, now, environment]
		);

		return result.changes;
	}

	/**
	 * Delete alert
	 */
	async delete(id: string): Promise<boolean> {
		const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

		return result.changes > 0;
	}

	/**
	 * Delete expired alerts
	 */
	async deleteExpired(): Promise<number> {
		const now = new Date().toISOString();

		const result = await this.client.run(
			`DELETE FROM ${this.table} WHERE expires_at IS NOT NULL AND expires_at < ?`,
			[now]
		);

		return result.changes;
	}

	/**
	 * Count alerts by severity
	 */
	async countBySeverity(
		environment: string,
		acknowledgedOnly = false
	): Promise<Record<AlertSeverity, number>> {
		const whereClause = acknowledgedOnly
			? "WHERE environment = ?"
			: "WHERE environment = ? AND acknowledged = 0";

		const rows = await this.client.execute<{ severity: string; count: number }>(
			`SELECT severity, COUNT(*) as count FROM ${this.table} ${whereClause} GROUP BY severity`,
			[environment]
		);

		const result: Record<string, number> = {
			info: 0,
			warning: 0,
			critical: 0,
		};

		for (const row of rows) {
			result[row.severity] = row.count;
		}

		return result as Record<AlertSeverity, number>;
	}
}
