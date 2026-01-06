/**
 * Universe Cache Repository
 *
 * Cached universe resolution results (index constituents, ETF holdings, screeners).
 *
 * @see migrations/003_market_data_tables.sql
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Zod Schemas
// ============================================

export const SourceTypeSchema = z.enum(["index", "etf", "screener", "static", "custom"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const UniverseCacheSchema = z.object({
  id: z.number().optional(),
  sourceType: SourceTypeSchema,
  sourceId: z.string(), // e.g., 'SP500', 'QQQ', 'custom-tech'
  sourceHash: z.string(), // Hash for cache invalidation
  tickers: z.array(z.string()),
  tickerCount: z.number(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  cachedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime(),
  provider: z.string().nullable().optional(),
});

export type UniverseCache = z.infer<typeof UniverseCacheSchema>;

export const UniverseCacheInsertSchema = UniverseCacheSchema.omit({
  id: true,
  cachedAt: true,
  tickerCount: true,
}).extend({
  tickerCount: z.number().optional(), // Will be computed from tickers
});
export type UniverseCacheInsert = z.infer<typeof UniverseCacheInsertSchema>;

// ============================================
// Repository
// ============================================

export class UniverseCacheRepository {
  constructor(private client: TursoClient) {}

  /**
   * Get cached universe by source type and ID
   */
  async get(sourceType: SourceType, sourceId: string): Promise<UniverseCache | null> {
    const row = await this.client.get<UniverseCacheRow>(
      `SELECT * FROM universe_cache
       WHERE source_type = ? AND source_id = ?
         AND expires_at > datetime('now')`,
      [sourceType, sourceId]
    );
    return row ? mapRowToCache(row) : null;
  }

  /**
   * Get cached universe by hash (for invalidation check)
   */
  async getByHash(sourceHash: string): Promise<UniverseCache | null> {
    const row = await this.client.get<UniverseCacheRow>(
      `SELECT * FROM universe_cache
       WHERE source_hash = ?
         AND expires_at > datetime('now')`,
      [sourceHash]
    );
    return row ? mapRowToCache(row) : null;
  }

  /**
   * Set/update cached universe
   */
  async set(cache: UniverseCacheInsert): Promise<void> {
    const tickerCount = cache.tickers.length;

    try {
      await this.client.run(
        `INSERT INTO universe_cache (
          source_type, source_id, source_hash, tickers, ticker_count,
          metadata, expires_at, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_type, source_id)
        DO UPDATE SET
          source_hash = excluded.source_hash,
          tickers = excluded.tickers,
          ticker_count = excluded.ticker_count,
          metadata = excluded.metadata,
          cached_at = datetime('now'),
          expires_at = excluded.expires_at,
          provider = excluded.provider`,
        [
          cache.sourceType,
          cache.sourceId,
          cache.sourceHash,
          toJson(cache.tickers),
          tickerCount,
          cache.metadata ? toJson(cache.metadata) : null,
          cache.expiresAt,
          cache.provider ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("universe_cache", error as Error);
    }
  }

  /**
   * Delete cached universe
   */
  async delete(sourceType: SourceType, sourceId: string): Promise<boolean> {
    const result = await this.client.run(
      `DELETE FROM universe_cache WHERE source_type = ? AND source_id = ?`,
      [sourceType, sourceId]
    );
    return result.changes > 0;
  }

  /**
   * Delete all expired cache entries
   */
  async purgeExpired(): Promise<number> {
    const result = await this.client.run(
      `DELETE FROM universe_cache WHERE expires_at <= datetime('now')`
    );
    return result.changes;
  }

  /**
   * Get all cached sources
   */
  async listSources(): Promise<{ sourceType: SourceType; sourceId: string }[]> {
    const rows = await this.client.execute<{ source_type: string; source_id: string }>(
      `SELECT source_type, source_id FROM universe_cache
       WHERE expires_at > datetime('now')
       ORDER BY source_type, source_id`
    );
    return rows.map((r) => ({
      sourceType: r.source_type as SourceType,
      sourceId: r.source_id,
    }));
  }
}

// ============================================
// Row Mapping
// ============================================

interface UniverseCacheRow {
  id: number;
  source_type: string;
  source_id: string;
  source_hash: string;
  tickers: string;
  ticker_count: number;
  metadata: string | null;
  cached_at: string;
  expires_at: string;
  provider: string | null;
  [key: string]: unknown;
}

function mapRowToCache(row: UniverseCacheRow): UniverseCache {
  return {
    id: row.id,
    sourceType: row.source_type as SourceType,
    sourceId: row.source_id,
    sourceHash: row.source_hash,
    tickers: parseJson<string[]>(row.tickers, []),
    tickerCount: row.ticker_count,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata, null),
    cachedAt: row.cached_at,
    expiresAt: row.expires_at,
    provider: row.provider,
  };
}
