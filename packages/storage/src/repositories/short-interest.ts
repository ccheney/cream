/**
 * Short Interest Repository
 *
 * CRUD operations for the short_interest_indicators table.
 * Stores short interest data from FINRA.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 * @see migrations/008_indicator_engine_v2.sql
 */

import type { Row, TursoClient } from "../turso.js";
import { type PaginatedResult, type PaginationOptions, paginate, RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

export interface ShortInterestIndicators {
  id: string;
  symbol: string;
  settlementDate: string;

  shortInterest: number;
  shortInterestRatio: number | null;
  daysToCover: number | null;
  shortPctFloat: number | null;
  shortInterestChange: number | null;

  source: string;
  fetchedAt: string;
}

export interface CreateShortInterestInput {
  id: string;
  symbol: string;
  settlementDate: string;

  shortInterest: number;
  shortInterestRatio?: number | null;
  daysToCover?: number | null;
  shortPctFloat?: number | null;
  shortInterestChange?: number | null;

  source?: string;
}

export interface UpdateShortInterestInput {
  shortInterest?: number;
  shortInterestRatio?: number | null;
  daysToCover?: number | null;
  shortPctFloat?: number | null;
  shortInterestChange?: number | null;
}

export interface ShortInterestFilters {
  symbol?: string;
  settlementDate?: string;
  settlementDateGte?: string;
  settlementDateLte?: string;
  shortPctFloatGte?: number;
}

// ============================================
// Mappers
// ============================================

function mapRow(row: Row): ShortInterestIndicators {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    settlementDate: row.settlement_date as string,

    shortInterest: row.short_interest as number,
    shortInterestRatio: row.short_interest_ratio as number | null,
    daysToCover: row.days_to_cover as number | null,
    shortPctFloat: row.short_pct_float as number | null,
    shortInterestChange: row.short_interest_change as number | null,

    source: row.source as string,
    fetchedAt: row.fetched_at as string,
  };
}

// ============================================
// Repository
// ============================================

export class ShortInterestRepository {
  constructor(private client: TursoClient) {}

  /**
   * Create a new short interest record
   */
  async create(input: CreateShortInterestInput): Promise<ShortInterestIndicators> {
    const now = new Date().toISOString();

    await this.client.run(
      `INSERT INTO short_interest_indicators (
        id, symbol, settlement_date,
        short_interest, short_interest_ratio, days_to_cover,
        short_pct_float, short_interest_change,
        source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.symbol,
        input.settlementDate,
        input.shortInterest,
        input.shortInterestRatio ?? null,
        input.daysToCover ?? null,
        input.shortPctFloat ?? null,
        input.shortInterestChange ?? null,
        input.source ?? "FINRA",
        now,
      ]
    );

    const created = await this.findById(input.id);
    if (!created) {
      throw new RepositoryError("QUERY_ERROR", "Failed to retrieve created record");
    }
    return created;
  }

  /**
   * Upsert a short interest record (insert or update on conflict)
   */
  async upsert(input: CreateShortInterestInput): Promise<ShortInterestIndicators> {
    const now = new Date().toISOString();

    await this.client.run(
      `INSERT INTO short_interest_indicators (
        id, symbol, settlement_date,
        short_interest, short_interest_ratio, days_to_cover,
        short_pct_float, short_interest_change,
        source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, settlement_date) DO UPDATE SET
        short_interest = excluded.short_interest,
        short_interest_ratio = excluded.short_interest_ratio,
        days_to_cover = excluded.days_to_cover,
        short_pct_float = excluded.short_pct_float,
        short_interest_change = excluded.short_interest_change,
        fetched_at = excluded.fetched_at`,
      [
        input.id,
        input.symbol,
        input.settlementDate,
        input.shortInterest,
        input.shortInterestRatio ?? null,
        input.daysToCover ?? null,
        input.shortPctFloat ?? null,
        input.shortInterestChange ?? null,
        input.source ?? "FINRA",
        now,
      ]
    );

    const result = await this.findBySymbolAndDate(input.symbol, input.settlementDate);
    if (!result) {
      throw new RepositoryError("QUERY_ERROR", "Failed to retrieve upserted record");
    }
    return result;
  }

  /**
   * Bulk upsert multiple records
   */
  async bulkUpsert(inputs: CreateShortInterestInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const now = new Date().toISOString();
    let count = 0;

    for (const input of inputs) {
      await this.client.run(
        `INSERT INTO short_interest_indicators (
          id, symbol, settlement_date,
          short_interest, short_interest_ratio, days_to_cover,
          short_pct_float, short_interest_change,
          source, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, settlement_date) DO UPDATE SET
          short_interest = excluded.short_interest,
          short_interest_ratio = excluded.short_interest_ratio,
          days_to_cover = excluded.days_to_cover,
          short_pct_float = excluded.short_pct_float,
          short_interest_change = excluded.short_interest_change,
          fetched_at = excluded.fetched_at`,
        [
          input.id,
          input.symbol,
          input.settlementDate,
          input.shortInterest,
          input.shortInterestRatio ?? null,
          input.daysToCover ?? null,
          input.shortPctFloat ?? null,
          input.shortInterestChange ?? null,
          input.source ?? "FINRA",
          now,
        ]
      );
      count++;
    }

    return count;
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<ShortInterestIndicators | null> {
    const row = await this.client.get<Row>("SELECT * FROM short_interest_indicators WHERE id = ?", [
      id,
    ]);

    if (!row) return null;
    return mapRow(row);
  }

  /**
   * Find by symbol and settlement date
   */
  async findBySymbolAndDate(
    symbol: string,
    settlementDate: string
  ): Promise<ShortInterestIndicators | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM short_interest_indicators WHERE symbol = ? AND settlement_date = ?",
      [symbol, settlementDate]
    );

    if (!row) return null;
    return mapRow(row);
  }

  /**
   * Find latest by symbol
   */
  async findLatestBySymbol(symbol: string): Promise<ShortInterestIndicators | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM short_interest_indicators
       WHERE symbol = ?
       ORDER BY settlement_date DESC
       LIMIT 1`,
      [symbol]
    );

    if (!row) return null;
    return mapRow(row);
  }

  /**
   * Find all by symbol with optional date range
   */
  async findBySymbol(
    symbol: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<ShortInterestIndicators[]> {
    let sql = "SELECT * FROM short_interest_indicators WHERE symbol = ?";
    const args: unknown[] = [symbol];

    if (options?.startDate) {
      sql += " AND settlement_date >= ?";
      args.push(options.startDate);
    }

    if (options?.endDate) {
      sql += " AND settlement_date <= ?";
      args.push(options.endDate);
    }

    sql += " ORDER BY settlement_date DESC";

    const rows = await this.client.execute<Row>(sql, args);
    return rows.map(mapRow);
  }

  /**
   * Find with filters and pagination
   */
  async findWithFilters(
    filters: ShortInterestFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<ShortInterestIndicators>> {
    let sql = "SELECT * FROM short_interest_indicators WHERE 1=1";
    const args: unknown[] = [];

    if (filters.symbol) {
      sql += " AND symbol = ?";
      args.push(filters.symbol);
    }

    if (filters.settlementDate) {
      sql += " AND settlement_date = ?";
      args.push(filters.settlementDate);
    }

    if (filters.settlementDateGte) {
      sql += " AND settlement_date >= ?";
      args.push(filters.settlementDateGte);
    }

    if (filters.settlementDateLte) {
      sql += " AND settlement_date <= ?";
      args.push(filters.settlementDateLte);
    }

    if (filters.shortPctFloatGte !== undefined) {
      sql += " AND short_pct_float >= ?";
      args.push(filters.shortPctFloatGte);
    }

    sql += " ORDER BY settlement_date DESC";

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");

    const result = await paginate<Row>(this.client, sql, countSql, args, pagination);

    return {
      ...result,
      data: result.data.map(mapRow),
    };
  }

  /**
   * Find highest short interest stocks
   */
  async findHighestShortInterest(
    limit = 10,
    minShortPctFloat?: number
  ): Promise<ShortInterestIndicators[]> {
    let sql = `
      SELECT si1.*
      FROM short_interest_indicators si1
      INNER JOIN (
        SELECT symbol, MAX(settlement_date) as max_date
        FROM short_interest_indicators
        GROUP BY symbol
      ) si2 ON si1.symbol = si2.symbol AND si1.settlement_date = si2.max_date
      WHERE si1.short_pct_float IS NOT NULL
    `;
    const args: unknown[] = [];

    if (minShortPctFloat !== undefined) {
      sql += " AND si1.short_pct_float >= ?";
      args.push(minShortPctFloat);
    }

    sql += " ORDER BY si1.short_pct_float DESC LIMIT ?";
    args.push(limit);

    const rows = await this.client.execute<Row>(sql, args);
    return rows.map(mapRow);
  }

  /**
   * Update a record
   */
  async update(
    id: string,
    input: UpdateShortInterestInput
  ): Promise<ShortInterestIndicators | null> {
    const updates: string[] = [];
    const args: unknown[] = [];

    if (input.shortInterest !== undefined) {
      updates.push("short_interest = ?");
      args.push(input.shortInterest);
    }

    if (input.shortInterestRatio !== undefined) {
      updates.push("short_interest_ratio = ?");
      args.push(input.shortInterestRatio);
    }

    if (input.daysToCover !== undefined) {
      updates.push("days_to_cover = ?");
      args.push(input.daysToCover);
    }

    if (input.shortPctFloat !== undefined) {
      updates.push("short_pct_float = ?");
      args.push(input.shortPctFloat);
    }

    if (input.shortInterestChange !== undefined) {
      updates.push("short_interest_change = ?");
      args.push(input.shortInterestChange);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push("fetched_at = ?");
    args.push(new Date().toISOString());
    args.push(id);

    await this.client.run(
      `UPDATE short_interest_indicators SET ${updates.join(", ")} WHERE id = ?`,
      args
    );

    return this.findById(id);
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run("DELETE FROM short_interest_indicators WHERE id = ?", [
      id,
    ]);

    return result.changes > 0;
  }

  /**
   * Delete old records
   */
  async deleteOlderThan(date: string): Promise<number> {
    const result = await this.client.run(
      "DELETE FROM short_interest_indicators WHERE settlement_date < ?",
      [date]
    );

    return result.changes;
  }

  /**
   * Count all records
   */
  async count(filters?: ShortInterestFilters): Promise<number> {
    let sql = "SELECT COUNT(*) as count FROM short_interest_indicators WHERE 1=1";
    const args: unknown[] = [];

    if (filters?.symbol) {
      sql += " AND symbol = ?";
      args.push(filters.symbol);
    }

    if (filters?.settlementDate) {
      sql += " AND settlement_date = ?";
      args.push(filters.settlementDate);
    }

    const row = await this.client.get<{ count: number }>(sql, args);
    return row?.count ?? 0;
  }
}
