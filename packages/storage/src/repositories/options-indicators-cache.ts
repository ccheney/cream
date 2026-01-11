/**
 * Options Indicators Cache Repository
 *
 * CRUD operations for the options_indicators_cache table.
 * Stores cached options-derived indicators with TTL-based expiration.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 * @see migrations/008_indicator_engine_v2.sql
 */

import type { Row, TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

export interface OptionsIndicatorsCache {
  id: string;
  symbol: string;
  timestamp: string;

  impliedVolatility: number | null;
  ivPercentile30d: number | null;
  ivSkew: number | null;
  putCallRatio: number | null;
  vrp: number | null;
  termStructureSlope: number | null;

  netDelta: number | null;
  netGamma: number | null;
  netTheta: number | null;
  netVega: number | null;

  expiresAt: string;
}

export interface CreateOptionsIndicatorsCacheInput {
  id: string;
  symbol: string;

  impliedVolatility?: number | null;
  ivPercentile30d?: number | null;
  ivSkew?: number | null;
  putCallRatio?: number | null;
  vrp?: number | null;
  termStructureSlope?: number | null;

  netDelta?: number | null;
  netGamma?: number | null;
  netTheta?: number | null;
  netVega?: number | null;

  ttlMinutes?: number; // Default 60 minutes
}

export interface UpdateOptionsIndicatorsCacheInput {
  impliedVolatility?: number | null;
  ivPercentile30d?: number | null;
  ivSkew?: number | null;
  putCallRatio?: number | null;
  vrp?: number | null;
  termStructureSlope?: number | null;

  netDelta?: number | null;
  netGamma?: number | null;
  netTheta?: number | null;
  netVega?: number | null;

  ttlMinutes?: number;
}

// ============================================
// Mappers
// ============================================

function mapRow(row: Row): OptionsIndicatorsCache {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    timestamp: row.timestamp as string,

    impliedVolatility: row.implied_volatility as number | null,
    ivPercentile30d: row.iv_percentile_30d as number | null,
    ivSkew: row.iv_skew as number | null,
    putCallRatio: row.put_call_ratio as number | null,
    vrp: row.vrp as number | null,
    termStructureSlope: row.term_structure_slope as number | null,

    netDelta: row.net_delta as number | null,
    netGamma: row.net_gamma as number | null,
    netTheta: row.net_theta as number | null,
    netVega: row.net_vega as number | null,

    expiresAt: row.expires_at as string,
  };
}

// ============================================
// Repository
// ============================================

export class OptionsIndicatorsCacheRepository {
  constructor(private client: TursoClient) {}

  private calculateExpiresAt(ttlMinutes = 60): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + ttlMinutes);
    return now.toISOString();
  }

  /**
   * Create or update a cache entry
   */
  async set(input: CreateOptionsIndicatorsCacheInput): Promise<OptionsIndicatorsCache> {
    const now = new Date().toISOString();
    const expiresAt = this.calculateExpiresAt(input.ttlMinutes);

    await this.client.run(
      `INSERT INTO options_indicators_cache (
        id, symbol, timestamp,
        implied_volatility, iv_percentile_30d, iv_skew,
        put_call_ratio, vrp, term_structure_slope,
        net_delta, net_gamma, net_theta, net_vega,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        timestamp = excluded.timestamp,
        implied_volatility = excluded.implied_volatility,
        iv_percentile_30d = excluded.iv_percentile_30d,
        iv_skew = excluded.iv_skew,
        put_call_ratio = excluded.put_call_ratio,
        vrp = excluded.vrp,
        term_structure_slope = excluded.term_structure_slope,
        net_delta = excluded.net_delta,
        net_gamma = excluded.net_gamma,
        net_theta = excluded.net_theta,
        net_vega = excluded.net_vega,
        expires_at = excluded.expires_at`,
      [
        input.id,
        input.symbol,
        now,
        input.impliedVolatility ?? null,
        input.ivPercentile30d ?? null,
        input.ivSkew ?? null,
        input.putCallRatio ?? null,
        input.vrp ?? null,
        input.termStructureSlope ?? null,
        input.netDelta ?? null,
        input.netGamma ?? null,
        input.netTheta ?? null,
        input.netVega ?? null,
        expiresAt,
      ]
    );

    // Return the entry regardless of expiration (for immediate use)
    const result = await this.getIncludingExpired(input.symbol);
    if (!result) {
      throw new RepositoryError("QUERY_ERROR", "Failed to retrieve cached record");
    }
    return result;
  }

  /**
   * Bulk set multiple cache entries
   */
  async bulkSet(inputs: CreateOptionsIndicatorsCacheInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const now = new Date().toISOString();
    let count = 0;

    for (const input of inputs) {
      const expiresAt = this.calculateExpiresAt(input.ttlMinutes);

      await this.client.run(
        `INSERT INTO options_indicators_cache (
          id, symbol, timestamp,
          implied_volatility, iv_percentile_30d, iv_skew,
          put_call_ratio, vrp, term_structure_slope,
          net_delta, net_gamma, net_theta, net_vega,
          expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          timestamp = excluded.timestamp,
          implied_volatility = excluded.implied_volatility,
          iv_percentile_30d = excluded.iv_percentile_30d,
          iv_skew = excluded.iv_skew,
          put_call_ratio = excluded.put_call_ratio,
          vrp = excluded.vrp,
          term_structure_slope = excluded.term_structure_slope,
          net_delta = excluded.net_delta,
          net_gamma = excluded.net_gamma,
          net_theta = excluded.net_theta,
          net_vega = excluded.net_vega,
          expires_at = excluded.expires_at`,
        [
          input.id,
          input.symbol,
          now,
          input.impliedVolatility ?? null,
          input.ivPercentile30d ?? null,
          input.ivSkew ?? null,
          input.putCallRatio ?? null,
          input.vrp ?? null,
          input.termStructureSlope ?? null,
          input.netDelta ?? null,
          input.netGamma ?? null,
          input.netTheta ?? null,
          input.netVega ?? null,
          expiresAt,
        ]
      );
      count++;
    }

    return count;
  }

  /**
   * Get a cache entry by symbol (returns null if expired or not found)
   */
  async get(symbol: string): Promise<OptionsIndicatorsCache | null> {
    const now = new Date().toISOString();

    const row = await this.client.get<Row>(
      `SELECT * FROM options_indicators_cache
       WHERE symbol = ? AND expires_at > ?`,
      [symbol, now]
    );

    if (!row) return null;
    return mapRow(row);
  }

  /**
   * Get a cache entry even if expired (for debugging/analytics)
   */
  async getIncludingExpired(symbol: string): Promise<OptionsIndicatorsCache | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM options_indicators_cache WHERE symbol = ?",
      [symbol]
    );

    if (!row) return null;
    return mapRow(row);
  }

  /**
   * Get multiple cache entries by symbols
   */
  async getMany(symbols: string[]): Promise<Map<string, OptionsIndicatorsCache>> {
    if (symbols.length === 0) return new Map();

    const now = new Date().toISOString();
    const placeholders = symbols.map(() => "?").join(", ");

    const rows = await this.client.execute<Row>(
      `SELECT * FROM options_indicators_cache
       WHERE symbol IN (${placeholders}) AND expires_at > ?`,
      [...symbols, now]
    );

    const result = new Map<string, OptionsIndicatorsCache>();
    for (const row of rows) {
      const entry = mapRow(row);
      result.set(entry.symbol, entry);
    }
    return result;
  }

  /**
   * Check if a cache entry exists and is valid
   */
  async has(symbol: string): Promise<boolean> {
    const now = new Date().toISOString();

    const row = await this.client.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM options_indicators_cache
       WHERE symbol = ? AND expires_at > ?`,
      [symbol, now]
    );

    return (row?.count ?? 0) > 0;
  }

  /**
   * Get all valid cache entries
   */
  async getAll(): Promise<OptionsIndicatorsCache[]> {
    const now = new Date().toISOString();

    const rows = await this.client.execute<Row>(
      `SELECT * FROM options_indicators_cache
       WHERE expires_at > ?
       ORDER BY symbol`,
      [now]
    );

    return rows.map(mapRow);
  }

  /**
   * Get symbols that need refresh (expired or missing)
   */
  async getExpiredSymbols(): Promise<string[]> {
    const now = new Date().toISOString();

    const rows = await this.client.execute<{ symbol: string }>(
      `SELECT symbol FROM options_indicators_cache
       WHERE expires_at <= ?`,
      [now]
    );

    return rows.map((r) => r.symbol);
  }

  /**
   * Update TTL for a symbol
   */
  async refresh(symbol: string, ttlMinutes = 60): Promise<boolean> {
    const expiresAt = this.calculateExpiresAt(ttlMinutes);

    const result = await this.client.run(
      `UPDATE options_indicators_cache
       SET expires_at = ?, timestamp = ?
       WHERE symbol = ?`,
      [expiresAt, new Date().toISOString(), symbol]
    );

    return result.changes > 0;
  }

  /**
   * Update a cache entry
   */
  async update(
    symbol: string,
    input: UpdateOptionsIndicatorsCacheInput
  ): Promise<OptionsIndicatorsCache | null> {
    const updates: string[] = [];
    const args: unknown[] = [];

    if (input.impliedVolatility !== undefined) {
      updates.push("implied_volatility = ?");
      args.push(input.impliedVolatility);
    }

    if (input.ivPercentile30d !== undefined) {
      updates.push("iv_percentile_30d = ?");
      args.push(input.ivPercentile30d);
    }

    if (input.ivSkew !== undefined) {
      updates.push("iv_skew = ?");
      args.push(input.ivSkew);
    }

    if (input.putCallRatio !== undefined) {
      updates.push("put_call_ratio = ?");
      args.push(input.putCallRatio);
    }

    if (input.vrp !== undefined) {
      updates.push("vrp = ?");
      args.push(input.vrp);
    }

    if (input.termStructureSlope !== undefined) {
      updates.push("term_structure_slope = ?");
      args.push(input.termStructureSlope);
    }

    if (input.netDelta !== undefined) {
      updates.push("net_delta = ?");
      args.push(input.netDelta);
    }

    if (input.netGamma !== undefined) {
      updates.push("net_gamma = ?");
      args.push(input.netGamma);
    }

    if (input.netTheta !== undefined) {
      updates.push("net_theta = ?");
      args.push(input.netTheta);
    }

    if (input.netVega !== undefined) {
      updates.push("net_vega = ?");
      args.push(input.netVega);
    }

    if (updates.length === 0 && input.ttlMinutes === undefined) {
      return this.getIncludingExpired(symbol);
    }

    updates.push("timestamp = ?");
    args.push(new Date().toISOString());

    if (input.ttlMinutes !== undefined) {
      updates.push("expires_at = ?");
      args.push(this.calculateExpiresAt(input.ttlMinutes));
    }

    args.push(symbol);

    await this.client.run(
      `UPDATE options_indicators_cache SET ${updates.join(", ")} WHERE symbol = ?`,
      args
    );

    return this.getIncludingExpired(symbol);
  }

  /**
   * Delete a cache entry
   */
  async delete(symbol: string): Promise<boolean> {
    const result = await this.client.run("DELETE FROM options_indicators_cache WHERE symbol = ?", [
      symbol,
    ]);

    return result.changes > 0;
  }

  /**
   * Clear all expired entries
   */
  async clearExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.client.run(
      "DELETE FROM options_indicators_cache WHERE expires_at <= ?",
      [now]
    );

    return result.changes;
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<number> {
    const result = await this.client.run("DELETE FROM options_indicators_cache");

    return result.changes;
  }

  /**
   * Count cache entries
   */
  async count(includeExpired = false): Promise<number> {
    if (includeExpired) {
      const row = await this.client.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM options_indicators_cache"
      );
      return row?.count ?? 0;
    }

    const now = new Date().toISOString();
    const row = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM options_indicators_cache WHERE expires_at > ?",
      [now]
    );
    return row?.count ?? 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    total: number;
    valid: number;
    expired: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  }> {
    const now = new Date().toISOString();

    const [totalRow, validRow, statsRow] = await Promise.all([
      this.client.get<{ count: number }>("SELECT COUNT(*) as count FROM options_indicators_cache"),
      this.client.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM options_indicators_cache WHERE expires_at > ?",
        [now]
      ),
      this.client.get<{ oldest: string | null; newest: string | null }>(
        `SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest
         FROM options_indicators_cache`
      ),
    ]);

    const total = totalRow?.count ?? 0;
    const valid = validRow?.count ?? 0;

    return {
      total,
      valid,
      expired: total - valid,
      oldestTimestamp: statsRow?.oldest ?? null,
      newestTimestamp: statsRow?.newest ?? null,
    };
  }
}
