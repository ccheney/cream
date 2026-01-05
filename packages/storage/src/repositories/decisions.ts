/**
 * Decisions Repository
 *
 * Data access for trading decisions table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { TursoClient, Row } from "../turso.js";
import {
  RepositoryError,
  query,
  paginate,
  toBoolean,
  parseJson,
  toJson,
  type PaginatedResult,
  type PaginationOptions,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Decision status
 */
export type DecisionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "failed"
  | "cancelled";

/**
 * Decision action
 */
export type DecisionAction = "BUY" | "SELL" | "HOLD" | "CLOSE";

/**
 * Decision direction
 */
export type DecisionDirection = "LONG" | "SHORT" | "FLAT";

/**
 * Decision entity
 */
export interface Decision {
  id: string;
  cycleId: string;
  symbol: string;
  action: DecisionAction;
  direction: DecisionDirection;
  size: number;
  sizeUnit: string;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  status: DecisionStatus;
  strategyFamily: string | null;
  timeHorizon: string | null;
  rationale: string | null;
  bullishFactors: string[];
  bearishFactors: string[];
  confidenceScore: number | null;
  riskScore: number | null;
  metadata: Record<string, unknown>;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create decision input
 */
export interface CreateDecisionInput {
  id: string;
  cycleId: string;
  symbol: string;
  action: DecisionAction;
  direction: DecisionDirection;
  size: number;
  sizeUnit: string;
  entryPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  status?: DecisionStatus;
  strategyFamily?: string | null;
  timeHorizon?: string | null;
  rationale?: string | null;
  bullishFactors?: string[];
  bearishFactors?: string[];
  confidenceScore?: number | null;
  riskScore?: number | null;
  metadata?: Record<string, unknown>;
  environment: string;
}

/**
 * Decision filter options
 */
export interface DecisionFilters {
  symbol?: string;
  status?: DecisionStatus | DecisionStatus[];
  action?: DecisionAction;
  direction?: DecisionDirection;
  environment?: string;
  cycleId?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapDecisionRow(row: Row): Decision {
  return {
    id: row.id as string,
    cycleId: row.cycle_id as string,
    symbol: row.symbol as string,
    action: row.action as DecisionAction,
    direction: row.direction as DecisionDirection,
    size: row.size as number,
    sizeUnit: row.size_unit as string,
    entryPrice: row.entry_price as number | null,
    stopPrice: row.stop_price as number | null,
    targetPrice: row.target_price as number | null,
    status: row.status as DecisionStatus,
    strategyFamily: row.strategy_family as string | null,
    timeHorizon: row.time_horizon as string | null,
    rationale: row.rationale as string | null,
    bullishFactors: parseJson<string[]>(row.bullish_factors, []),
    bearishFactors: parseJson<string[]>(row.bearish_factors, []),
    confidenceScore: row.confidence_score as number | null,
    riskScore: row.risk_score as number | null,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    environment: row.environment as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Decisions repository
 */
export class DecisionsRepository {
  private readonly table = "decisions";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new decision
   */
  async create(input: CreateDecisionInput): Promise<Decision> {
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, cycle_id, symbol, action, direction,
          size, size_unit, entry_price, stop_price, target_price,
          status, strategy_family, time_horizon, rationale,
          bullish_factors, bearish_factors,
          confidence_score, risk_score, metadata,
          environment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.cycleId,
          input.symbol,
          input.action,
          input.direction,
          input.size,
          input.sizeUnit,
          input.entryPrice ?? null,
          input.stopPrice ?? null,
          input.targetPrice ?? null,
          input.status ?? "pending",
          input.strategyFamily ?? null,
          input.timeHorizon ?? null,
          input.rationale ?? null,
          toJson(input.bullishFactors ?? []),
          toJson(input.bearishFactors ?? []),
          input.confidenceScore ?? null,
          input.riskScore ?? null,
          toJson(input.metadata ?? {}),
          input.environment,
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<Decision>;
  }

  /**
   * Find decision by ID
   */
  async findById(id: string): Promise<Decision | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [id]
    );

    return row ? mapDecisionRow(row) : null;
  }

  /**
   * Find decision by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<Decision> {
    const decision = await this.findById(id);
    if (!decision) {
      throw RepositoryError.notFound(this.table, id);
    }
    return decision;
  }

  /**
   * Find decisions with filters
   */
  async findMany(
    filters: DecisionFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Decision>> {
    const builder = query().orderBy("created_at", "DESC");

    if (filters.symbol) {
      builder.eq("symbol", filters.symbol);
    }
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        builder.where("status", "IN", filters.status);
      } else {
        builder.eq("status", filters.status);
      }
    }
    if (filters.action) {
      builder.eq("action", filters.action);
    }
    if (filters.direction) {
      builder.eq("direction", filters.direction);
    }
    if (filters.environment) {
      builder.eq("environment", filters.environment);
    }
    if (filters.cycleId) {
      builder.eq("cycle_id", filters.cycleId);
    }
    if (filters.fromDate) {
      builder.where("created_at", ">=", filters.fromDate);
    }
    if (filters.toDate) {
      builder.where("created_at", "<=", filters.toDate);
    }

    const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count").split(" LIMIT ")[0];

    const result = await paginate<Row>(
      this.client,
      sql.split(" LIMIT ")[0],
      countSql,
      args.slice(0, -2), // Remove limit/offset args
      pagination
    );

    return {
      ...result,
      data: result.data.map(mapDecisionRow),
    };
  }

  /**
   * Find decisions by symbol
   */
  async findBySymbol(symbol: string, limit = 20): Promise<Decision[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE symbol = ? ORDER BY created_at DESC LIMIT ?`,
      [symbol, limit]
    );

    return rows.map(mapDecisionRow);
  }

  /**
   * Find decisions by cycle
   */
  async findByCycle(cycleId: string): Promise<Decision[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE cycle_id = ? ORDER BY created_at DESC`,
      [cycleId]
    );

    return rows.map(mapDecisionRow);
  }

  /**
   * Find recent decisions
   */
  async findRecent(environment: string, limit = 10): Promise<Decision[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
      [environment, limit]
    );

    return rows.map(mapDecisionRow);
  }

  /**
   * Update decision status
   */
  async updateStatus(id: string, status: DecisionStatus): Promise<Decision> {
    const now = new Date().toISOString();

    const result = await this.client.run(
      `UPDATE ${this.table} SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id]
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound(this.table, id);
    }

    return this.findByIdOrThrow(id);
  }

  /**
   * Update decision
   */
  async update(
    id: string,
    updates: Partial<Omit<CreateDecisionInput, "id" | "cycleId" | "environment">>
  ): Promise<Decision> {
    const now = new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const args: unknown[] = [now];

    if (updates.symbol !== undefined) {
      fields.push("symbol = ?");
      args.push(updates.symbol);
    }
    if (updates.action !== undefined) {
      fields.push("action = ?");
      args.push(updates.action);
    }
    if (updates.direction !== undefined) {
      fields.push("direction = ?");
      args.push(updates.direction);
    }
    if (updates.size !== undefined) {
      fields.push("size = ?");
      args.push(updates.size);
    }
    if (updates.sizeUnit !== undefined) {
      fields.push("size_unit = ?");
      args.push(updates.sizeUnit);
    }
    if (updates.entryPrice !== undefined) {
      fields.push("entry_price = ?");
      args.push(updates.entryPrice);
    }
    if (updates.stopPrice !== undefined) {
      fields.push("stop_price = ?");
      args.push(updates.stopPrice);
    }
    if (updates.targetPrice !== undefined) {
      fields.push("target_price = ?");
      args.push(updates.targetPrice);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      args.push(updates.status);
    }
    if (updates.rationale !== undefined) {
      fields.push("rationale = ?");
      args.push(updates.rationale);
    }
    if (updates.bullishFactors !== undefined) {
      fields.push("bullish_factors = ?");
      args.push(toJson(updates.bullishFactors));
    }
    if (updates.bearishFactors !== undefined) {
      fields.push("bearish_factors = ?");
      args.push(toJson(updates.bearishFactors));
    }
    if (updates.confidenceScore !== undefined) {
      fields.push("confidence_score = ?");
      args.push(updates.confidenceScore);
    }
    if (updates.riskScore !== undefined) {
      fields.push("risk_score = ?");
      args.push(updates.riskScore);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      args.push(toJson(updates.metadata));
    }

    args.push(id);

    const result = await this.client.run(
      `UPDATE ${this.table} SET ${fields.join(", ")} WHERE id = ?`,
      args
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound(this.table, id);
    }

    return this.findByIdOrThrow(id);
  }

  /**
   * Delete decision
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(
      `DELETE FROM ${this.table} WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  }

  /**
   * Count decisions by status
   */
  async countByStatus(environment: string): Promise<Record<DecisionStatus, number>> {
    const rows = await this.client.execute<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM ${this.table} WHERE environment = ? GROUP BY status`,
      [environment]
    );

    const result: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      executing: 0,
      executed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result as Record<DecisionStatus, number>;
  }
}
