/**
 * Backtests Repository
 *
 * Data access for backtests and related tables.
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
 * Backtest status
 */
export type BacktestStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Backtest entity
 */
export interface Backtest {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  initialCapital: number;
  universe: string[];
  config: Record<string, unknown>;
  status: BacktestStatus;
  progressPct: number;
  // Result metrics
  totalReturn: number | null;
  cagr: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  totalTrades: number | null;
  avgTradePnl: number | null;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
}

/**
 * Create backtest input
 */
export interface CreateBacktestInput {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  initialCapital: number;
  universe?: string[];
  config?: Record<string, unknown>;
  createdBy?: string | null;
}

/**
 * Backtest trade entity
 */
export interface BacktestTrade {
  id: number;
  backtestId: string;
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL" | "SHORT" | "COVER";
  quantity: number;
  price: number;
  commission: number;
  pnl: number | null;
  pnlPct: number | null;
  decisionRationale: string | null;
}

/**
 * Backtest equity point
 */
export interface BacktestEquityPoint {
  id: number;
  backtestId: string;
  timestamp: string;
  nav: number;
  cash: number;
  equity: number;
  drawdown: number | null;
  drawdownPct: number | null;
  dayReturnPct: number | null;
  cumulativeReturnPct: number | null;
}

// ============================================
// Row Mappers
// ============================================

function mapBacktestRow(row: Row): Backtest {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    initialCapital: row.initial_capital as number,
    universe: parseJson<string[]>(row.universe, []),
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    status: row.status as BacktestStatus,
    progressPct: (row.progress_pct as number) ?? 0,
    totalReturn: row.total_return as number | null,
    cagr: row.cagr as number | null,
    sharpeRatio: row.sharpe_ratio as number | null,
    sortinoRatio: row.sortino_ratio as number | null,
    calmarRatio: row.calmar_ratio as number | null,
    maxDrawdown: row.max_drawdown as number | null,
    winRate: row.win_rate as number | null,
    profitFactor: row.profit_factor as number | null,
    totalTrades: row.total_trades as number | null,
    avgTradePnl: row.avg_trade_pnl as number | null,
    metrics: parseJson<Record<string, unknown>>(row.metrics_json, {}),
    errorMessage: row.error_message as string | null,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    createdBy: row.created_by as string | null,
  };
}

function mapTradeRow(row: Row): BacktestTrade {
  return {
    id: row.id as number,
    backtestId: row.backtest_id as string,
    timestamp: row.timestamp as string,
    symbol: row.symbol as string,
    action: row.action as BacktestTrade["action"],
    quantity: row.qty as number,
    price: row.price as number,
    commission: (row.commission as number) ?? 0,
    pnl: row.pnl as number | null,
    pnlPct: row.pnl_pct as number | null,
    decisionRationale: row.decision_rationale as string | null,
  };
}

function mapEquityRow(row: Row): BacktestEquityPoint {
  return {
    id: row.id as number,
    backtestId: row.backtest_id as string,
    timestamp: row.timestamp as string,
    nav: row.nav as number,
    cash: row.cash as number,
    equity: row.equity as number,
    drawdown: row.drawdown as number | null,
    drawdownPct: row.drawdown_pct as number | null,
    dayReturnPct: row.day_return_pct as number | null,
    cumulativeReturnPct: row.cumulative_return_pct as number | null,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Backtests repository
 */
export class BacktestsRepository {
  constructor(private readonly client: TursoClient) {}

  // ----------------------------------------
  // Backtest CRUD
  // ----------------------------------------

  /**
   * Create a new backtest
   */
  async create(input: CreateBacktestInput): Promise<Backtest> {
    try {
      await this.client.run(
        `INSERT INTO backtests (
          id, name, description, start_date, end_date,
          initial_capital, universe, config_json, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          input.id,
          input.name,
          input.description ?? null,
          input.startDate,
          input.endDate,
          input.initialCapital,
          toJson(input.universe ?? []),
          toJson(input.config ?? {}),
          input.createdBy ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("backtests", error as Error);
    }

    return this.findById(input.id) as Promise<Backtest>;
  }

  /**
   * Find backtest by ID
   */
  async findById(id: string): Promise<Backtest | null> {
    const row = await this.client.get<Row>(`SELECT * FROM backtests WHERE id = ?`, [id]);

    return row ? mapBacktestRow(row) : null;
  }

  /**
   * Find backtest by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<Backtest> {
    const backtest = await this.findById(id);
    if (!backtest) {
      throw RepositoryError.notFound("backtests", id);
    }
    return backtest;
  }

  /**
   * Find backtests with pagination
   */
  async findMany(
    status?: BacktestStatus | BacktestStatus[],
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Backtest>> {
    const builder = query().orderBy("created_at", "DESC");

    if (status) {
      if (Array.isArray(status)) {
        builder.where("status", "IN", status);
      } else {
        builder.eq("status", status);
      }
    }

    const { sql, args } = builder.build(`SELECT * FROM backtests`);
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
      data: result.data.map(mapBacktestRow),
    };
  }

  /**
   * Find recent backtests
   */
  async findRecent(limit = 10): Promise<Backtest[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM backtests ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    return rows.map(mapBacktestRow);
  }

  /**
   * Start backtest
   */
  async start(id: string): Promise<Backtest> {
    const now = new Date().toISOString();

    const result = await this.client.run(
      `UPDATE backtests SET status = 'running', started_at = ?, progress_pct = 0 WHERE id = ?`,
      [now, id]
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound("backtests", id);
    }

    return this.findByIdOrThrow(id);
  }

  /**
   * Update backtest progress
   */
  async updateProgress(id: string, progressPct: number): Promise<void> {
    await this.client.run(`UPDATE backtests SET progress_pct = ? WHERE id = ?`, [
      Math.min(100, Math.max(0, progressPct)),
      id,
    ]);
  }

  /**
   * Complete backtest with results
   */
  async complete(
    id: string,
    metrics: {
      totalReturn?: number;
      cagr?: number;
      sharpeRatio?: number;
      sortinoRatio?: number;
      calmarRatio?: number;
      maxDrawdown?: number;
      winRate?: number;
      profitFactor?: number;
      totalTrades?: number;
      avgTradePnl?: number;
      additionalMetrics?: Record<string, unknown>;
    }
  ): Promise<Backtest> {
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE backtests SET
        status = 'completed',
        progress_pct = 100,
        completed_at = ?,
        total_return = ?,
        cagr = ?,
        sharpe_ratio = ?,
        sortino_ratio = ?,
        calmar_ratio = ?,
        max_drawdown = ?,
        win_rate = ?,
        profit_factor = ?,
        total_trades = ?,
        avg_trade_pnl = ?,
        metrics_json = ?
       WHERE id = ?`,
      [
        now,
        metrics.totalReturn ?? null,
        metrics.cagr ?? null,
        metrics.sharpeRatio ?? null,
        metrics.sortinoRatio ?? null,
        metrics.calmarRatio ?? null,
        metrics.maxDrawdown ?? null,
        metrics.winRate ?? null,
        metrics.profitFactor ?? null,
        metrics.totalTrades ?? null,
        metrics.avgTradePnl ?? null,
        toJson(metrics.additionalMetrics ?? {}),
        id,
      ]
    );

    return this.findByIdOrThrow(id);
  }

  /**
   * Fail backtest
   */
  async fail(id: string, errorMessage: string): Promise<Backtest> {
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE backtests SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?`,
      [now, errorMessage, id]
    );

    return this.findByIdOrThrow(id);
  }

  /**
   * Cancel backtest
   */
  async cancel(id: string): Promise<Backtest> {
    await this.client.run(`UPDATE backtests SET status = 'cancelled' WHERE id = ?`, [id]);

    return this.findByIdOrThrow(id);
  }

  /**
   * Delete backtest and related data
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM backtests WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  // ----------------------------------------
  // Backtest Trades
  // ----------------------------------------

  /**
   * Add trade to backtest
   */
  async addTrade(
    backtestId: string,
    trade: Omit<BacktestTrade, "id" | "backtestId">
  ): Promise<BacktestTrade> {
    const result = await this.client.run(
      `INSERT INTO backtest_trades (
        backtest_id, timestamp, symbol, action, qty, price, commission, pnl, pnl_pct, decision_rationale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        backtestId,
        trade.timestamp,
        trade.symbol,
        trade.action,
        trade.quantity,
        trade.price,
        trade.commission,
        trade.pnl ?? null,
        trade.pnlPct ?? null,
        trade.decisionRationale ?? null,
      ]
    );

    const row = await this.client.get<Row>(`SELECT * FROM backtest_trades WHERE id = ?`, [
      Number(result.lastInsertRowid),
    ]);

    return mapTradeRow(row!);
  }

  /**
   * Get trades for backtest
   */
  async getTrades(backtestId: string): Promise<BacktestTrade[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM backtest_trades WHERE backtest_id = ? ORDER BY timestamp ASC`,
      [backtestId]
    );

    return rows.map(mapTradeRow);
  }

  // ----------------------------------------
  // Backtest Equity
  // ----------------------------------------

  /**
   * Add equity point to backtest
   */
  async addEquityPoint(
    backtestId: string,
    point: Omit<BacktestEquityPoint, "id" | "backtestId">
  ): Promise<void> {
    await this.client.run(
      `INSERT INTO backtest_equity (
        backtest_id, timestamp, nav, cash, equity, drawdown, drawdown_pct, day_return_pct, cumulative_return_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        backtestId,
        point.timestamp,
        point.nav,
        point.cash,
        point.equity,
        point.drawdown ?? null,
        point.drawdownPct ?? null,
        point.dayReturnPct ?? null,
        point.cumulativeReturnPct ?? null,
      ]
    );
  }

  /**
   * Get equity curve for backtest
   */
  async getEquityCurve(backtestId: string): Promise<BacktestEquityPoint[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM backtest_equity WHERE backtest_id = ? ORDER BY timestamp ASC`,
      [backtestId]
    );

    return rows.map(mapEquityRow);
  }
}
