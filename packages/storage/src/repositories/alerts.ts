/**
 * Alerts Repository (Drizzle ORM)
 *
 * Data access for system alerts table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { alerts } from "../schema/dashboard";

// ============================================
// Types
// ============================================

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertType =
	| "connection"
	| "order"
	| "position"
	| "risk"
	| "system"
	| "market"
	| "agent";

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

export interface CreateAlertInput {
	id?: string;
	severity: AlertSeverity;
	type: AlertType;
	title: string;
	message: string;
	metadata?: Record<string, unknown>;
	environment: string;
	expiresAt?: string | null;
}

export interface AlertFilters {
	severity?: AlertSeverity | AlertSeverity[];
	type?: AlertType | AlertType[];
	acknowledged?: boolean;
	environment?: string;
	fromDate?: string;
	toDate?: string;
}

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
}

// ============================================
// Row Mapping
// ============================================

type AlertRow = typeof alerts.$inferSelect;

function mapAlertRow(row: AlertRow): Alert {
	return {
		id: row.id,
		severity: row.severity as AlertSeverity,
		type: row.type as AlertType,
		title: row.title,
		message: row.message,
		metadata: (row.metadata as Record<string, unknown>) ?? {},
		acknowledged: row.acknowledged,
		acknowledgedBy: row.acknowledgedBy,
		acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
		expiresAt: row.expiresAt?.toISOString() ?? null,
	};
}

// ============================================
// Repository
// ============================================

export class AlertsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateAlertInput): Promise<Alert> {
		const [row] = await this.db
			.insert(alerts)
			.values({
				severity: input.severity as typeof alerts.$inferInsert.severity,
				type: input.type,
				title: input.title,
				message: input.message,
				metadata: input.metadata ?? {},
				acknowledged: false,
				environment: input.environment as typeof alerts.$inferInsert.environment,
				expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create alert");
		}
		return mapAlertRow(row);
	}

	async findById(id: string): Promise<Alert | null> {
		const [row] = await this.db.select().from(alerts).where(eq(alerts.id, id)).limit(1);

		return row ? mapAlertRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Alert> {
		const alert = await this.findById(id);
		if (!alert) {
			throw new Error(`Alert not found: ${id}`);
		}
		return alert;
	}

	async findMany(
		filters: AlertFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Alert>> {
		const conditions = [];

		if (filters.severity) {
			if (Array.isArray(filters.severity)) {
				conditions.push(
					inArray(alerts.severity, filters.severity as (typeof alerts.$inferSelect.severity)[])
				);
			} else {
				conditions.push(
					eq(alerts.severity, filters.severity as typeof alerts.$inferSelect.severity)
				);
			}
		}
		if (filters.type) {
			if (Array.isArray(filters.type)) {
				conditions.push(inArray(alerts.type, filters.type));
			} else {
				conditions.push(eq(alerts.type, filters.type));
			}
		}
		if (filters.acknowledged !== undefined) {
			conditions.push(eq(alerts.acknowledged, filters.acknowledged));
		}
		if (filters.environment) {
			conditions.push(
				eq(alerts.environment, filters.environment as typeof alerts.$inferSelect.environment)
			);
		}
		if (filters.fromDate) {
			conditions.push(gte(alerts.createdAt, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(alerts.createdAt, new Date(filters.toDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db.select({ count: count() }).from(alerts).where(whereClause);

		const rows = await this.db
			.select()
			.from(alerts)
			.where(whereClause)
			.orderBy(desc(alerts.createdAt))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapAlertRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findUnacknowledged(environment: string, limit = 50): Promise<Alert[]> {
		const rows = await this.db
			.select()
			.from(alerts)
			.where(
				and(
					eq(alerts.environment, environment as typeof alerts.$inferSelect.environment),
					eq(alerts.acknowledged, false)
				)
			)
			.orderBy(
				sql`CASE ${alerts.severity} WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
				desc(alerts.createdAt)
			)
			.limit(limit);

		return rows.map(mapAlertRow);
	}

	async findRecent(environment: string, limit = 20): Promise<Alert[]> {
		const rows = await this.db
			.select()
			.from(alerts)
			.where(eq(alerts.environment, environment as typeof alerts.$inferSelect.environment))
			.orderBy(desc(alerts.createdAt))
			.limit(limit);

		return rows.map(mapAlertRow);
	}

	async acknowledge(id: string, acknowledgedBy: string): Promise<Alert> {
		const [row] = await this.db
			.update(alerts)
			.set({
				acknowledged: true,
				acknowledgedBy,
				acknowledgedAt: new Date(),
			})
			.where(eq(alerts.id, id))
			.returning();

		if (!row) {
			throw new Error(`Alert not found: ${id}`);
		}

		return mapAlertRow(row);
	}

	async acknowledgeMany(ids: string[], acknowledgedBy: string): Promise<number> {
		if (ids.length === 0) {
			return 0;
		}

		const result = await this.db
			.update(alerts)
			.set({
				acknowledged: true,
				acknowledgedBy,
				acknowledgedAt: new Date(),
			})
			.where(inArray(alerts.id, ids))
			.returning({ id: alerts.id });

		return result.length;
	}

	async acknowledgeAll(environment: string, acknowledgedBy: string): Promise<number> {
		const result = await this.db
			.update(alerts)
			.set({
				acknowledged: true,
				acknowledgedBy,
				acknowledgedAt: new Date(),
			})
			.where(
				and(
					eq(alerts.environment, environment as typeof alerts.$inferSelect.environment),
					eq(alerts.acknowledged, false)
				)
			)
			.returning({ id: alerts.id });

		return result.length;
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(alerts)
			.where(eq(alerts.id, id))
			.returning({ id: alerts.id });

		return result.length > 0;
	}

	async deleteExpired(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.delete(alerts)
			.where(and(sql`${alerts.expiresAt} IS NOT NULL`, lte(alerts.expiresAt, now)))
			.returning({ id: alerts.id });

		return result.length;
	}

	async countBySeverity(
		environment: string,
		acknowledgedOnly = false
	): Promise<Record<AlertSeverity, number>> {
		const conditions = [
			eq(alerts.environment, environment as typeof alerts.$inferSelect.environment),
		];

		if (!acknowledgedOnly) {
			conditions.push(eq(alerts.acknowledged, false));
		}

		const rows = await this.db
			.select({
				severity: alerts.severity,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(alerts)
			.where(and(...conditions))
			.groupBy(alerts.severity);

		const result: Record<AlertSeverity, number> = {
			info: 0,
			warning: 0,
			critical: 0,
		};

		for (const row of rows) {
			result[row.severity as AlertSeverity] = row.count;
		}

		return result;
	}
}
