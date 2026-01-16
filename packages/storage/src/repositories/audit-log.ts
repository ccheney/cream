/**
 * Audit Log Repository (Drizzle ORM)
 *
 * Data access for audit_log table. Tracks authenticated API actions
 * in LIVE environment for security compliance.
 *
 * @see apps/dashboard-api/src/auth/session.ts
 */
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { auditLog } from "../schema/audit";

// ============================================
// Types
// ============================================

export interface AuditLogEntry {
	id: string;
	timestamp: string;
	userId: string;
	userEmail: string;
	action: string;
	ipAddress: string | null;
	userAgent: string | null;
	environment: string;
	createdAt: string;
}

export interface CreateAuditLogInput {
	id?: string;
	userId: string;
	userEmail: string;
	action: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	environment?: string;
}

export interface AuditLogFilters {
	userId?: string;
	action?: string;
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

type AuditLogRow = typeof auditLog.$inferSelect;

function mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
	return {
		id: row.id,
		timestamp: row.timestamp.toISOString(),
		userId: row.userId,
		userEmail: row.userEmail,
		action: row.action,
		ipAddress: row.ipAddress,
		userAgent: row.userAgent,
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class AuditLogRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateAuditLogInput): Promise<AuditLogEntry> {
		const [row] = await this.db
			.insert(auditLog)
			.values({
				userId: input.userId,
				userEmail: input.userEmail,
				action: input.action,
				ipAddress: input.ipAddress ?? null,
				userAgent: input.userAgent ?? null,
				environment: (input.environment ?? "LIVE") as typeof auditLog.$inferInsert.environment,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create audit log entry");
		}
		return mapAuditLogRow(row);
	}

	async findById(id: string): Promise<AuditLogEntry | null> {
		const [row] = await this.db.select().from(auditLog).where(eq(auditLog.id, id)).limit(1);

		return row ? mapAuditLogRow(row) : null;
	}

	async findMany(
		filters: AuditLogFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<AuditLogEntry>> {
		const conditions = [];

		if (filters.userId) {
			conditions.push(eq(auditLog.userId, filters.userId));
		}
		if (filters.action) {
			conditions.push(eq(auditLog.action, filters.action));
		}
		if (filters.environment) {
			conditions.push(
				eq(auditLog.environment, filters.environment as typeof auditLog.$inferSelect.environment)
			);
		}
		if (filters.fromDate) {
			conditions.push(gte(auditLog.timestamp, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(auditLog.timestamp, new Date(filters.toDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(auditLog)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(auditLog)
			.where(whereClause)
			.orderBy(desc(auditLog.timestamp))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapAuditLogRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findRecentByUser(userId: string, limit = 50): Promise<AuditLogEntry[]> {
		const rows = await this.db
			.select()
			.from(auditLog)
			.where(eq(auditLog.userId, userId))
			.orderBy(desc(auditLog.timestamp))
			.limit(limit);

		return rows.map(mapAuditLogRow);
	}

	async countByUserInPeriod(userId: string, sinceTimestamp: string): Promise<number> {
		const [result] = await this.db
			.select({ count: count() })
			.from(auditLog)
			.where(and(eq(auditLog.userId, userId), gte(auditLog.timestamp, new Date(sinceTimestamp))));

		return result?.count ?? 0;
	}
}
