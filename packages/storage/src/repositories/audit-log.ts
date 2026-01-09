/**
 * Audit Log Repository
 *
 * Data access for audit_log table. Tracks authenticated API actions
 * in LIVE environment for security compliance.
 *
 * @see apps/dashboard-api/src/auth/session.ts
 */

import type { Row, TursoClient } from "../turso.js";
import { type PaginatedResult, type PaginationOptions, paginate, query } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Audit log entry
 */
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

/**
 * Create audit log entry input
 */
export interface CreateAuditLogInput {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  environment?: string;
}

/**
 * Audit log filter options
 */
export interface AuditLogFilters {
  userId?: string;
  action?: string;
  environment?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapAuditLogRow(row: Row): AuditLogEntry {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    userId: row.user_id as string,
    userEmail: row.user_email as string,
    action: row.action as string,
    ipAddress: row.ip_address as string | null,
    userAgent: row.user_agent as string | null,
    environment: row.environment as string,
    createdAt: row.created_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Audit log repository
 */
export class AuditLogRepository {
  private readonly table = "audit_log";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new audit log entry
   */
  async create(input: CreateAuditLogInput): Promise<AuditLogEntry> {
    const now = new Date().toISOString();

    await this.client.run(
      `INSERT INTO ${this.table} (
        id, timestamp, user_id, user_email, action, ip_address, user_agent, environment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        now,
        input.userId,
        input.userEmail,
        input.action,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.environment ?? "LIVE",
        now,
      ]
    );

    const entry = await this.findById(input.id);
    if (!entry) {
      throw new Error(`Failed to create audit log entry: ${input.id}`);
    }
    return entry;
  }

  /**
   * Find audit log entry by ID
   */
  async findById(id: string): Promise<AuditLogEntry | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapAuditLogRow(row) : null;
  }

  /**
   * Find audit log entries with filters
   */
  async findMany(
    filters: AuditLogFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const builder = query().orderBy("timestamp", "DESC");

    if (filters.userId) {
      builder.eq("user_id", filters.userId);
    }
    if (filters.action) {
      builder.eq("action", filters.action);
    }
    if (filters.environment) {
      builder.eq("environment", filters.environment);
    }
    if (filters.fromDate) {
      builder.where("timestamp", ">=", filters.fromDate);
    }
    if (filters.toDate) {
      builder.where("timestamp", "<=", filters.toDate);
    }

    const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count").split(" LIMIT ")[0]!;

    const result = await paginate<Row>(
      this.client,
      sql.split(" LIMIT ")[0]!,
      countSql,
      args.slice(0, -2),
      pagination
    );

    return {
      ...result,
      data: result.data.map(mapAuditLogRow),
    };
  }

  /**
   * Find recent audit log entries for a user
   */
  async findRecentByUser(userId: string, limit = 50): Promise<AuditLogEntry[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [userId, limit]
    );

    return rows.map(mapAuditLogRow);
  }

  /**
   * Count audit log entries for a user within a time period
   * Useful for rate limiting or anomaly detection
   */
  async countByUserInPeriod(userId: string, sinceTimestamp: string): Promise<number> {
    const row = await this.client.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table} WHERE user_id = ? AND timestamp >= ?`,
      [userId, sinceTimestamp]
    );

    return row?.count ?? 0;
  }
}
