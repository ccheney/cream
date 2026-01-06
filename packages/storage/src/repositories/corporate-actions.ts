/**
 * Corporate Actions Repository
 *
 * CRUD operations for stock splits, dividends, and other corporate actions.
 *
 * @see migrations/003_market_data_tables.sql
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Zod Schemas
// ============================================

export const ActionTypeSchema = z.enum([
  "split",
  "reverse_split",
  "dividend",
  "special_dividend",
  "spinoff",
  "merger",
  "acquisition",
  "delisting",
  "name_change",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const CorporateActionSchema = z.object({
  id: z.number().optional(),
  symbol: z.string(),
  actionType: ActionTypeSchema,
  exDate: z.string(), // YYYY-MM-DD
  recordDate: z.string().nullable().optional(),
  payDate: z.string().nullable().optional(),
  ratio: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  provider: z.string().default("polygon"),
  createdAt: z.string().datetime().optional(),
});

export type CorporateAction = z.infer<typeof CorporateActionSchema>;

export const CorporateActionInsertSchema = CorporateActionSchema.omit({
  id: true,
  createdAt: true,
});
export type CorporateActionInsert = z.infer<typeof CorporateActionInsertSchema>;

// ============================================
// Repository
// ============================================

export class CorporateActionsRepository {
  constructor(private client: TursoClient) {}

  /**
   * Insert a corporate action (upsert on symbol+type+ex_date)
   */
  async upsert(action: CorporateActionInsert): Promise<void> {
    try {
      await this.client.run(
        `INSERT INTO corporate_actions (
          symbol, action_type, ex_date, record_date, pay_date,
          ratio, amount, details, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, action_type, ex_date)
        DO UPDATE SET
          record_date = excluded.record_date,
          pay_date = excluded.pay_date,
          ratio = excluded.ratio,
          amount = excluded.amount,
          details = excluded.details`,
        [
          action.symbol,
          action.actionType,
          action.exDate,
          action.recordDate ?? null,
          action.payDate ?? null,
          action.ratio ?? null,
          action.amount ?? null,
          action.details ? toJson(action.details) : null,
          action.provider,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("corporate_actions", error as Error);
    }
  }

  /**
   * Get corporate actions for a symbol within a date range
   */
  async getForSymbol(
    symbol: string,
    startDate?: string,
    endDate?: string
  ): Promise<CorporateAction[]> {
    let query = `SELECT * FROM corporate_actions WHERE symbol = ?`;
    const args: unknown[] = [symbol];

    if (startDate) {
      query += ` AND ex_date >= ?`;
      args.push(startDate);
    }
    if (endDate) {
      query += ` AND ex_date <= ?`;
      args.push(endDate);
    }
    query += ` ORDER BY ex_date DESC`;

    const rows = await this.client.execute<CorporateActionRow>(query, args);
    return rows.map(mapRowToAction);
  }

  /**
   * Get splits and reverse splits for price adjustment
   */
  async getSplits(symbol: string, afterDate?: string): Promise<CorporateAction[]> {
    let query = `SELECT * FROM corporate_actions
                 WHERE symbol = ? AND action_type IN ('split', 'reverse_split')`;
    const args: unknown[] = [symbol];

    if (afterDate) {
      query += ` AND ex_date > ?`;
      args.push(afterDate);
    }
    query += ` ORDER BY ex_date ASC`;

    const rows = await this.client.execute<CorporateActionRow>(query, args);
    return rows.map(mapRowToAction);
  }

  /**
   * Get dividends for a symbol
   */
  async getDividends(symbol: string, afterDate?: string): Promise<CorporateAction[]> {
    let query = `SELECT * FROM corporate_actions
                 WHERE symbol = ? AND action_type IN ('dividend', 'special_dividend')`;
    const args: unknown[] = [symbol];

    if (afterDate) {
      query += ` AND ex_date > ?`;
      args.push(afterDate);
    }
    query += ` ORDER BY ex_date DESC`;

    const rows = await this.client.execute<CorporateActionRow>(query, args);
    return rows.map(mapRowToAction);
  }

  /**
   * Get all actions on a specific date (for daily processing)
   */
  async getByExDate(exDate: string): Promise<CorporateAction[]> {
    const rows = await this.client.execute<CorporateActionRow>(
      `SELECT * FROM corporate_actions WHERE ex_date = ? ORDER BY symbol`,
      [exDate]
    );
    return rows.map(mapRowToAction);
  }
}

// ============================================
// Row Mapping
// ============================================

interface CorporateActionRow {
  id: number;
  symbol: string;
  action_type: string;
  ex_date: string;
  record_date: string | null;
  pay_date: string | null;
  ratio: number | null;
  amount: number | null;
  details: string | null;
  provider: string;
  created_at: string;
  [key: string]: unknown;
}

function mapRowToAction(row: CorporateActionRow): CorporateAction {
  return {
    id: row.id,
    symbol: row.symbol,
    actionType: row.action_type as ActionType,
    exDate: row.ex_date,
    recordDate: row.record_date,
    payDate: row.pay_date,
    ratio: row.ratio,
    amount: row.amount,
    details: parseJson<Record<string, unknown> | null>(row.details, null),
    provider: row.provider,
    createdAt: row.created_at,
  };
}
