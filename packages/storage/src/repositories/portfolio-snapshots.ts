/**
 * Portfolio Snapshots Repository
 *
 * Data access for portfolio_snapshots table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  query,
  RepositoryError,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Portfolio snapshot entity
 */
export interface PortfolioSnapshot {
  id: number;
  timestamp: string;
  nav: number;
  cash: number;
  equity: number;
  marginUsed: number | null;
  buyingPower: number | null;
  grossExposure: number | null;
  netExposure: number | null;
  longExposure: number | null;
  shortExposure: number | null;
  dayPnl: number | null;
  dayPnlPct: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  environment: string;
}

/**
 * Create portfolio snapshot input
 */
export interface CreatePortfolioSnapshotInput {
  timestamp?: string;
  nav: number;
  cash: number;
  equity: number;
  marginUsed?: number | null;
  buyingPower?: number | null;
  grossExposure?: number | null;
  netExposure?: number | null;
  longExposure?: number | null;
  shortExposure?: number | null;
  dayPnl?: number | null;
  dayPnlPct?: number | null;
  totalPnl?: number | null;
  totalPnlPct?: number | null;
  environment: string;
}

/**
 * Snapshot filter options
 */
export interface PortfolioSnapshotFilters {
  environment?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapSnapshotRow(row: Row): PortfolioSnapshot {
  return {
    id: row.id as number,
    timestamp: row.timestamp as string,
    nav: row.nav as number,
    cash: row.cash as number,
    equity: row.equity as number,
    marginUsed: row.margin_used as number | null,
    buyingPower: row.buying_power as number | null,
    grossExposure: row.gross_exposure as number | null,
    netExposure: row.net_exposure as number | null,
    longExposure: row.long_exposure as number | null,
    shortExposure: row.short_exposure as number | null,
    dayPnl: row.day_pnl as number | null,
    dayPnlPct: row.day_pnl_pct as number | null,
    totalPnl: row.total_pnl as number | null,
    totalPnlPct: row.total_pnl_pct as number | null,
    environment: row.environment as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Portfolio snapshots repository
 */
export class PortfolioSnapshotsRepository {
  private readonly table = "portfolio_snapshots";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new snapshot
   */
  async create(input: CreatePortfolioSnapshotInput): Promise<PortfolioSnapshot> {
    const timestamp = input.timestamp ?? new Date().toISOString();

    try {
      const result = await this.client.run(
        `INSERT INTO ${this.table} (
          timestamp, nav, cash, equity,
          margin_used, buying_power, gross_exposure, net_exposure,
          long_exposure, short_exposure, day_pnl, day_pnl_pct,
          total_pnl, total_pnl_pct, environment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp,
          input.nav,
          input.cash,
          input.equity,
          input.marginUsed ?? null,
          input.buyingPower ?? null,
          input.grossExposure ?? null,
          input.netExposure ?? null,
          input.longExposure ?? null,
          input.shortExposure ?? null,
          input.dayPnl ?? null,
          input.dayPnlPct ?? null,
          input.totalPnl ?? null,
          input.totalPnlPct ?? null,
          input.environment,
        ]
      );

      return this.findById(Number(result.lastInsertRowid)) as Promise<PortfolioSnapshot>;
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }
  }

  /**
   * Find snapshot by ID
   */
  async findById(id: number): Promise<PortfolioSnapshot | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapSnapshotRow(row) : null;
  }

  /**
   * Find snapshots with filters
   */
  async findMany(
    filters: PortfolioSnapshotFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<PortfolioSnapshot>> {
    const builder = query().orderBy("timestamp", "DESC");

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
      data: result.data.map(mapSnapshotRow),
    };
  }

  /**
   * Get latest snapshot
   */
  async getLatest(environment: string): Promise<PortfolioSnapshot | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY timestamp DESC LIMIT 1`,
      [environment]
    );

    return row ? mapSnapshotRow(row) : null;
  }

  /**
   * Get equity curve (NAV over time)
   */
  async getEquityCurve(
    environment: string,
    fromDate?: string,
    toDate?: string,
    limit = 1000
  ): Promise<{ timestamp: string; nav: number; pnlPct: number }[]> {
    let sql = `SELECT timestamp, nav, COALESCE(total_pnl_pct, 0) as pnl_pct
               FROM ${this.table}
               WHERE environment = ?`;
    const args: unknown[] = [environment];

    if (fromDate) {
      sql += ` AND timestamp >= ?`;
      args.push(fromDate);
    }
    if (toDate) {
      sql += ` AND timestamp <= ?`;
      args.push(toDate);
    }

    sql += ` ORDER BY timestamp ASC LIMIT ?`;
    args.push(limit);

    const rows = await this.client.execute<Row>(sql, args);

    return rows.map((row) => ({
      timestamp: row.timestamp as string,
      nav: row.nav as number,
      pnlPct: row.pnl_pct as number,
    }));
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(
    environment: string,
    days = 30
  ): Promise<{
    startNav: number;
    endNav: number;
    periodReturn: number;
    periodReturnPct: number;
    maxNav: number;
    minNav: number;
    maxDrawdown: number;
    snapshotCount: number;
  }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const row = await this.client.get<Row>(
      `SELECT
        (SELECT nav FROM ${this.table} WHERE environment = ? AND timestamp >= ? ORDER BY timestamp ASC LIMIT 1) as start_nav,
        (SELECT nav FROM ${this.table} WHERE environment = ? ORDER BY timestamp DESC LIMIT 1) as end_nav,
        MAX(nav) as max_nav,
        MIN(nav) as min_nav,
        COUNT(*) as snapshot_count
       FROM ${this.table}
       WHERE environment = ? AND timestamp >= ?`,
      [environment, fromDate.toISOString(), environment, environment, fromDate.toISOString()]
    );

    const startNav = (row?.start_nav as number) ?? 0;
    const endNav = (row?.end_nav as number) ?? 0;
    const periodReturn = endNav - startNav;
    const periodReturnPct = startNav > 0 ? (periodReturn / startNav) * 100 : 0;
    const maxNav = (row?.max_nav as number) ?? 0;
    const minNav = (row?.min_nav as number) ?? 0;
    const maxDrawdown = maxNav > 0 ? ((maxNav - minNav) / maxNav) * 100 : 0;

    return {
      startNav,
      endNav,
      periodReturn,
      periodReturnPct,
      maxNav,
      minNav,
      maxDrawdown,
      snapshotCount: (row?.snapshot_count as number) ?? 0,
    };
  }

  /**
   * Delete old snapshots (cleanup)
   */
  async deleteOlderThan(cutoffDate: string): Promise<number> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE timestamp < ?`, [
      cutoffDate,
    ]);

    return result.changes;
  }

  /**
   * Find snapshot by date
   */
  async findByDate(environment: string, date: string): Promise<PortfolioSnapshot | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table}
       WHERE environment = ? AND DATE(timestamp) = DATE(?)
       ORDER BY timestamp DESC LIMIT 1`,
      [environment, date]
    );

    return row ? mapSnapshotRow(row) : null;
  }

  /**
   * Get first snapshot
   */
  async getFirst(environment: string): Promise<PortfolioSnapshot | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY timestamp ASC LIMIT 1`,
      [environment]
    );

    return row ? mapSnapshotRow(row) : null;
  }
}
