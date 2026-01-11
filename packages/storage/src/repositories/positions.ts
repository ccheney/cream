/**
 * Positions Repository
 *
 * Data access for positions table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  query,
  RepositoryError,
  toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Position side
 */
export type PositionSide = "LONG" | "SHORT";

/**
 * Position status
 */
export type PositionStatus = "open" | "closed" | "pending";

/**
 * Position entity
 */
export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number | null;
  marketValue: number | null;
  costBasis: number;
  thesisId: string | null;
  decisionId: string | null;
  status: PositionStatus;
  metadata: Record<string, unknown>;
  environment: string;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

/**
 * Create position input
 */
export interface CreatePositionInput {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  avgEntryPrice: number;
  currentPrice?: number | null;
  thesisId?: string | null;
  decisionId?: string | null;
  metadata?: Record<string, unknown>;
  environment: string;
}

/**
 * Position filter options
 */
export interface PositionFilters {
  symbol?: string;
  side?: PositionSide;
  status?: PositionStatus;
  environment?: string;
  thesisId?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapPositionRow(row: Row): Position {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    side: row.side as PositionSide,
    quantity: row.qty as number,
    avgEntryPrice: row.avg_entry as number,
    currentPrice: row.current_price as number | null,
    unrealizedPnl: row.unrealized_pnl as number | null,
    unrealizedPnlPct: row.unrealized_pnl_pct as number | null,
    realizedPnl: row.realized_pnl as number | null,
    marketValue: row.market_value as number | null,
    costBasis: row.cost_basis as number,
    thesisId: row.thesis_id as string | null,
    decisionId: row.decision_id as string | null,
    status: row.status as PositionStatus,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    environment: row.environment as string,
    openedAt: row.opened_at as string,
    closedAt: row.closed_at as string | null,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Positions repository
 */
export class PositionsRepository {
  private readonly table = "positions";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new position
   */
  async create(input: CreatePositionInput): Promise<Position> {
    const now = new Date().toISOString();
    const costBasis = input.quantity * input.avgEntryPrice;

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, symbol, side, qty, avg_entry,
          current_price, cost_basis, thesis_id, decision_id,
          status, metadata, environment, opened_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        [
          input.id,
          input.symbol,
          input.side,
          input.quantity,
          input.avgEntryPrice,
          input.currentPrice ?? input.avgEntryPrice,
          costBasis,
          input.thesisId ?? null,
          input.decisionId ?? null,
          toJson(input.metadata ?? {}),
          input.environment,
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<Position>;
  }

  /**
   * Find position by ID
   */
  async findById(id: string): Promise<Position | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapPositionRow(row) : null;
  }

  /**
   * Find position by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<Position> {
    const position = await this.findById(id);
    if (!position) {
      throw RepositoryError.notFound(this.table, id);
    }
    return position;
  }

  /**
   * Find positions with filters
   */
  async findMany(
    filters: PositionFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Position>> {
    const builder = query().orderBy("opened_at", "DESC");

    if (filters.symbol) {
      builder.eq("symbol", filters.symbol);
    }
    if (filters.side) {
      builder.eq("side", filters.side);
    }
    if (filters.status) {
      builder.eq("status", filters.status);
    }
    if (filters.environment) {
      builder.eq("environment", filters.environment);
    }
    if (filters.thesisId) {
      builder.eq("thesis_id", filters.thesisId);
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
      data: result.data.map(mapPositionRow),
    };
  }

  /**
   * Find open positions
   */
  async findOpen(environment: string): Promise<Position[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND status = 'open' ORDER BY opened_at DESC`,
      [environment]
    );

    return rows.map(mapPositionRow);
  }

  /**
   * Find position by symbol
   */
  async findBySymbol(symbol: string, environment: string): Promise<Position | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE symbol = ? AND environment = ? AND status = 'open'`,
      [symbol, environment]
    );

    return row ? mapPositionRow(row) : null;
  }

  /**
   * Update position price
   */
  async updatePrice(id: string, currentPrice: number): Promise<Position> {
    const position = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    const marketValue = position.quantity * currentPrice;
    const unrealizedPnl =
      position.side === "LONG"
        ? marketValue - position.costBasis
        : position.costBasis - marketValue;
    const unrealizedPnlPct = (unrealizedPnl / position.costBasis) * 100;

    await this.client.run(
      `UPDATE ${this.table} SET
        current_price = ?,
        market_value = ?,
        unrealized_pnl = ?,
        unrealized_pnl_pct = ?,
        updated_at = ?
       WHERE id = ?`,
      [currentPrice, marketValue, unrealizedPnl, unrealizedPnlPct, now, id]
    );

    return this.findByIdOrThrow(id);
  }

  /**
   * Update position quantity (partial close or add)
   */
  async updateQuantity(id: string, newQuantity: number, avgPrice: number): Promise<Position> {
    const position = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    // Calculate new average entry price
    const oldValue = position.quantity * position.avgEntryPrice;
    const changeValue = (newQuantity - position.quantity) * avgPrice;
    const newAvgEntry = (oldValue + changeValue) / newQuantity;
    const newCostBasis = newQuantity * newAvgEntry;

    await this.client.run(
      `UPDATE ${this.table} SET
        qty = ?,
        avg_entry = ?,
        cost_basis = ?,
        updated_at = ?
       WHERE id = ?`,
      [newQuantity, newAvgEntry, newCostBasis, now, id]
    );

    return this.findByIdOrThrow(id);
  }

  /**
   * Close position
   */
  async close(id: string, exitPrice: number): Promise<Position> {
    const position = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    const realizedPnl =
      position.side === "LONG"
        ? (exitPrice - position.avgEntryPrice) * position.quantity
        : (position.avgEntryPrice - exitPrice) * position.quantity;

    await this.client.run(
      `UPDATE ${this.table} SET
        status = 'closed',
        current_price = ?,
        realized_pnl = ?,
        unrealized_pnl = 0,
        unrealized_pnl_pct = 0,
        closed_at = ?,
        updated_at = ?
       WHERE id = ?`,
      [exitPrice, realizedPnl, now, now, id]
    );

    return this.findByIdOrThrow(id);
  }

  /**
   * Delete position
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(environment: string): Promise<{
    totalPositions: number;
    longPositions: number;
    shortPositions: number;
    totalMarketValue: number;
    totalUnrealizedPnl: number;
    totalCostBasis: number;
  }> {
    const row = await this.client.get<Row>(
      `SELECT
        COUNT(*) as total_positions,
        SUM(CASE WHEN side = 'LONG' THEN 1 ELSE 0 END) as long_positions,
        SUM(CASE WHEN side = 'SHORT' THEN 1 ELSE 0 END) as short_positions,
        COALESCE(SUM(market_value), 0) as total_market_value,
        COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
        COALESCE(SUM(cost_basis), 0) as total_cost_basis
       FROM ${this.table}
       WHERE environment = ? AND status = 'open'`,
      [environment]
    );

    return {
      totalPositions: (row?.total_positions as number) ?? 0,
      longPositions: (row?.long_positions as number) ?? 0,
      shortPositions: (row?.short_positions as number) ?? 0,
      totalMarketValue: (row?.total_market_value as number) ?? 0,
      totalUnrealizedPnl: (row?.total_unrealized_pnl as number) ?? 0,
      totalCostBasis: (row?.total_cost_basis as number) ?? 0,
    };
  }
}
