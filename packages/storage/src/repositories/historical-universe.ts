/**
 * Historical Universe Repository
 *
 * Stores and retrieves point-in-time universe data for survivorship-bias-free backtesting.
 * Tracks historical index compositions, ticker changes, and universe snapshots.
 *
 * @see migrations/005_historical_universe.sql
 * @see docs/plans/12-backtest.md - Survivorship Bias Prevention
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Zod Schemas
// ============================================

export const IndexIdSchema = z.enum([
  "SP500",
  "NASDAQ100",
  "DOWJONES",
  "RUSSELL2000",
  "RUSSELL3000",
  "SP400",
  "SP600",
]);
export type IndexId = z.infer<typeof IndexIdSchema>;

export const ChangeTypeSchema = z.enum([
  "rename",
  "merger",
  "spinoff",
  "acquisition",
  "restructure",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const IndexConstituentSchema = z.object({
  id: z.number().optional(),
  indexId: IndexIdSchema,
  symbol: z.string().min(1),
  dateAdded: z.string(), // ISO8601 date
  dateRemoved: z.string().nullable().optional(),
  reasonAdded: z.string().nullable().optional(),
  reasonRemoved: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  marketCapAtAdd: z.number().nullable().optional(),
  provider: z.string().default("fmp"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type IndexConstituent = z.infer<typeof IndexConstituentSchema>;

export const TickerChangeSchema = z.object({
  id: z.number().optional(),
  oldSymbol: z.string().min(1),
  newSymbol: z.string().min(1),
  changeDate: z.string(), // ISO8601 date
  changeType: ChangeTypeSchema,
  conversionRatio: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  acquiringCompany: z.string().nullable().optional(),
  provider: z.string().default("fmp"),
  createdAt: z.string().optional(),
});
export type TickerChange = z.infer<typeof TickerChangeSchema>;

export const UniverseSnapshotSchema = z.object({
  id: z.number().optional(),
  snapshotDate: z.string(), // ISO8601 date
  indexId: IndexIdSchema,
  tickers: z.array(z.string()),
  tickerCount: z.number(),
  sourceVersion: z.string().nullable().optional(),
  computedAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type UniverseSnapshot = z.infer<typeof UniverseSnapshotSchema>;

// ============================================
// Index Constituents Repository
// ============================================

export class IndexConstituentsRepository {
  constructor(private client: TursoClient) {}

  /**
   * Add or update an index constituent record
   */
  async upsert(
    constituent: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">
  ): Promise<void> {
    try {
      await this.client.run(
        `INSERT INTO index_constituents (
          index_id, symbol, date_added, date_removed, reason_added, reason_removed,
          sector, industry, market_cap_at_add, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(index_id, symbol, date_added)
        DO UPDATE SET
          date_removed = excluded.date_removed,
          reason_removed = excluded.reason_removed,
          updated_at = datetime('now')`,
        [
          constituent.indexId,
          constituent.symbol,
          constituent.dateAdded,
          constituent.dateRemoved ?? null,
          constituent.reasonAdded ?? null,
          constituent.reasonRemoved ?? null,
          constituent.sector ?? null,
          constituent.industry ?? null,
          constituent.marketCapAtAdd ?? null,
          constituent.provider ?? "fmp",
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("index_constituents", error as Error);
    }
  }

  /**
   * Bulk insert constituents (more efficient for initial load)
   */
  async bulkInsert(
    constituents: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">[]
  ): Promise<number> {
    if (constituents.length === 0) {
      return 0;
    }

    let inserted = 0;
    for (const constituent of constituents) {
      await this.upsert(constituent);
      inserted++;
    }
    return inserted;
  }

  /**
   * Get constituents for an index as of a specific date
   */
  async getConstituentsAsOf(indexId: IndexId, asOfDate: string): Promise<string[]> {
    const rows = await this.client.execute<{ symbol: string }>(
      `SELECT DISTINCT symbol FROM index_constituents
       WHERE index_id = ?
         AND date_added <= ?
         AND (date_removed IS NULL OR date_removed > ?)
       ORDER BY symbol`,
      [indexId, asOfDate, asOfDate]
    );
    return rows.map((r) => r.symbol);
  }

  /**
   * Get current constituents (not removed)
   */
  async getCurrentConstituents(indexId: IndexId): Promise<IndexConstituent[]> {
    const rows = await this.client.execute<IndexConstituentRow>(
      `SELECT * FROM index_constituents
       WHERE index_id = ? AND date_removed IS NULL
       ORDER BY symbol`,
      [indexId]
    );
    return rows.map(mapRowToConstituent);
  }

  /**
   * Get constituent history for a symbol
   */
  async getSymbolHistory(symbol: string): Promise<IndexConstituent[]> {
    const rows = await this.client.execute<IndexConstituentRow>(
      `SELECT * FROM index_constituents
       WHERE symbol = ?
       ORDER BY index_id, date_added`,
      [symbol]
    );
    return rows.map(mapRowToConstituent);
  }

  /**
   * Check if a symbol was in an index on a specific date
   */
  async wasInIndexOnDate(indexId: IndexId, symbol: string, date: string): Promise<boolean> {
    const row = await this.client.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM index_constituents
       WHERE index_id = ? AND symbol = ?
         AND date_added <= ?
         AND (date_removed IS NULL OR date_removed > ?)`,
      [indexId, symbol, date, date]
    );
    return (row?.cnt ?? 0) > 0;
  }

  /**
   * Get all index changes within a date range
   */
  async getChangesInRange(
    indexId: IndexId,
    startDate: string,
    endDate: string
  ): Promise<{ additions: IndexConstituent[]; removals: IndexConstituent[] }> {
    const additions = await this.client.execute<IndexConstituentRow>(
      `SELECT * FROM index_constituents
       WHERE index_id = ? AND date_added >= ? AND date_added <= ?
       ORDER BY date_added`,
      [indexId, startDate, endDate]
    );

    const removals = await this.client.execute<IndexConstituentRow>(
      `SELECT * FROM index_constituents
       WHERE index_id = ? AND date_removed >= ? AND date_removed <= ?
       ORDER BY date_removed`,
      [indexId, startDate, endDate]
    );

    return {
      additions: additions.map(mapRowToConstituent),
      removals: removals.map(mapRowToConstituent),
    };
  }

  /**
   * Get the count of constituents for validation
   */
  async getConstituentCount(indexId: IndexId, asOfDate?: string): Promise<number> {
    if (asOfDate) {
      const row = await this.client.get<{ cnt: number }>(
        `SELECT COUNT(DISTINCT symbol) as cnt FROM index_constituents
         WHERE index_id = ?
           AND date_added <= ?
           AND (date_removed IS NULL OR date_removed > ?)`,
        [indexId, asOfDate, asOfDate]
      );
      return row?.cnt ?? 0;
    }

    const row = await this.client.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM index_constituents
       WHERE index_id = ? AND date_removed IS NULL`,
      [indexId]
    );
    return row?.cnt ?? 0;
  }
}

// ============================================
// Ticker Changes Repository
// ============================================

export class TickerChangesRepository {
  constructor(private client: TursoClient) {}

  /**
   * Add a ticker change record
   */
  async insert(change: Omit<TickerChange, "id" | "createdAt">): Promise<void> {
    try {
      await this.client.run(
        `INSERT INTO ticker_changes (
          old_symbol, new_symbol, change_date, change_type,
          conversion_ratio, reason, acquiring_company, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(old_symbol, new_symbol, change_date) DO NOTHING`,
        [
          change.oldSymbol,
          change.newSymbol,
          change.changeDate,
          change.changeType,
          change.conversionRatio ?? null,
          change.reason ?? null,
          change.acquiringCompany ?? null,
          change.provider ?? "fmp",
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("ticker_changes", error as Error);
    }
  }

  /**
   * Get all ticker changes for a symbol (find what it became)
   */
  async getChangesFromSymbol(oldSymbol: string): Promise<TickerChange[]> {
    const rows = await this.client.execute<TickerChangeRow>(
      `SELECT * FROM ticker_changes
       WHERE old_symbol = ?
       ORDER BY change_date`,
      [oldSymbol]
    );
    return rows.map(mapRowToTickerChange);
  }

  /**
   * Get ticker changes that resulted in a symbol (find its history)
   */
  async getChangesToSymbol(newSymbol: string): Promise<TickerChange[]> {
    const rows = await this.client.execute<TickerChangeRow>(
      `SELECT * FROM ticker_changes
       WHERE new_symbol = ?
       ORDER BY change_date`,
      [newSymbol]
    );
    return rows.map(mapRowToTickerChange);
  }

  /**
   * Resolve a historical ticker to its current symbol
   * Follows the chain of changes to find the final symbol
   */
  async resolveToCurrentSymbol(historicalSymbol: string): Promise<string> {
    let current = historicalSymbol;
    const visited = new Set<string>();

    while (!visited.has(current)) {
      visited.add(current);

      const row = await this.client.get<{ new_symbol: string }>(
        `SELECT new_symbol FROM ticker_changes
         WHERE old_symbol = ?
         ORDER BY change_date DESC
         LIMIT 1`,
        [current]
      );

      if (!row) {
        break;
      }
      current = row.new_symbol;
    }

    return current;
  }

  /**
   * Resolve a current ticker to what it was on a historical date
   */
  async resolveToHistoricalSymbol(currentSymbol: string, asOfDate: string): Promise<string> {
    let historical = currentSymbol;
    const visited = new Set<string>();

    while (!visited.has(historical)) {
      visited.add(historical);

      const row = await this.client.get<{ old_symbol: string }>(
        `SELECT old_symbol FROM ticker_changes
         WHERE new_symbol = ? AND change_date > ?
         ORDER BY change_date ASC
         LIMIT 1`,
        [historical, asOfDate]
      );

      if (!row) {
        break;
      }
      historical = row.old_symbol;
    }

    return historical;
  }

  /**
   * Get all changes in a date range
   */
  async getChangesInRange(startDate: string, endDate: string): Promise<TickerChange[]> {
    const rows = await this.client.execute<TickerChangeRow>(
      `SELECT * FROM ticker_changes
       WHERE change_date >= ? AND change_date <= ?
       ORDER BY change_date`,
      [startDate, endDate]
    );
    return rows.map(mapRowToTickerChange);
  }
}

// ============================================
// Universe Snapshots Repository
// ============================================

export class UniverseSnapshotsRepository {
  constructor(private client: TursoClient) {}

  /**
   * Save a universe snapshot
   */
  async save(snapshot: Omit<UniverseSnapshot, "id" | "computedAt">): Promise<void> {
    const tickerCount = snapshot.tickers.length;

    try {
      await this.client.run(
        `INSERT INTO universe_snapshots (
          snapshot_date, index_id, tickers, ticker_count, source_version, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(index_id, snapshot_date)
        DO UPDATE SET
          tickers = excluded.tickers,
          ticker_count = excluded.ticker_count,
          source_version = excluded.source_version,
          computed_at = datetime('now'),
          expires_at = excluded.expires_at`,
        [
          snapshot.snapshotDate,
          snapshot.indexId,
          toJson(snapshot.tickers),
          tickerCount,
          snapshot.sourceVersion ?? null,
          snapshot.expiresAt ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("universe_snapshots", error as Error);
    }
  }

  /**
   * Get universe snapshot for a specific date
   */
  async get(indexId: IndexId, snapshotDate: string): Promise<UniverseSnapshot | null> {
    const row = await this.client.get<UniverseSnapshotRow>(
      `SELECT * FROM universe_snapshots
       WHERE index_id = ? AND snapshot_date = ?`,
      [indexId, snapshotDate]
    );
    return row ? mapRowToSnapshot(row) : null;
  }

  /**
   * Get the closest snapshot on or before a date
   */
  async getClosestBefore(indexId: IndexId, date: string): Promise<UniverseSnapshot | null> {
    const row = await this.client.get<UniverseSnapshotRow>(
      `SELECT * FROM universe_snapshots
       WHERE index_id = ? AND snapshot_date <= ?
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [indexId, date]
    );
    return row ? mapRowToSnapshot(row) : null;
  }

  /**
   * List all snapshot dates for an index
   */
  async listDates(indexId: IndexId): Promise<string[]> {
    const rows = await this.client.execute<{ snapshot_date: string }>(
      `SELECT snapshot_date FROM universe_snapshots
       WHERE index_id = ?
       ORDER BY snapshot_date`,
      [indexId]
    );
    return rows.map((r) => r.snapshot_date);
  }

  /**
   * Delete expired snapshots
   */
  async purgeExpired(): Promise<number> {
    const result = await this.client.run(
      `DELETE FROM universe_snapshots
       WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
    );
    return result.changes;
  }
}

// ============================================
// Row Types and Mappers
// ============================================

interface IndexConstituentRow {
  id: number;
  index_id: string;
  symbol: string;
  date_added: string;
  date_removed: string | null;
  reason_added: string | null;
  reason_removed: string | null;
  sector: string | null;
  industry: string | null;
  market_cap_at_add: number | null;
  provider: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

function mapRowToConstituent(row: IndexConstituentRow): IndexConstituent {
  return {
    id: row.id,
    indexId: row.index_id as IndexId,
    symbol: row.symbol,
    dateAdded: row.date_added,
    dateRemoved: row.date_removed,
    reasonAdded: row.reason_added,
    reasonRemoved: row.reason_removed,
    sector: row.sector,
    industry: row.industry,
    marketCapAtAdd: row.market_cap_at_add,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface TickerChangeRow {
  id: number;
  old_symbol: string;
  new_symbol: string;
  change_date: string;
  change_type: string;
  conversion_ratio: number | null;
  reason: string | null;
  acquiring_company: string | null;
  provider: string;
  created_at: string;
  [key: string]: unknown;
}

function mapRowToTickerChange(row: TickerChangeRow): TickerChange {
  return {
    id: row.id,
    oldSymbol: row.old_symbol,
    newSymbol: row.new_symbol,
    changeDate: row.change_date,
    changeType: row.change_type as ChangeType,
    conversionRatio: row.conversion_ratio,
    reason: row.reason,
    acquiringCompany: row.acquiring_company,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

interface UniverseSnapshotRow {
  id: number;
  snapshot_date: string;
  index_id: string;
  tickers: string;
  ticker_count: number;
  source_version: string | null;
  computed_at: string;
  expires_at: string | null;
  [key: string]: unknown;
}

function mapRowToSnapshot(row: UniverseSnapshotRow): UniverseSnapshot {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    indexId: row.index_id as IndexId,
    tickers: parseJson<string[]>(row.tickers, []),
    tickerCount: row.ticker_count,
    sourceVersion: row.source_version,
    computedAt: row.computed_at,
    expiresAt: row.expires_at,
  };
}
