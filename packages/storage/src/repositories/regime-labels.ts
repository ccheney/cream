/**
 * Regime Labels Repository
 *
 * Market regime classification results.
 *
 * @see migrations/003_market_data_tables.sql
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";

// ============================================
// Zod Schemas
// ============================================

export const RegimeTimeframeSchema = z.enum(["1h", "4h", "1d", "1w"]);
export type RegimeTimeframe = z.infer<typeof RegimeTimeframeSchema>;

export const RegimeTypeSchema = z.enum([
  "bull_trend",
  "bear_trend",
  "range_bound",
  "high_volatility",
  "low_volatility",
  "crisis",
]);
export type RegimeType = z.infer<typeof RegimeTypeSchema>;

export const RegimeLabelSchema = z.object({
  id: z.number().optional(),
  symbol: z.string(), // '_MARKET' for market-wide regime
  timestamp: z.string().datetime(),
  timeframe: RegimeTimeframeSchema,
  regime: RegimeTypeSchema,
  confidence: z.number().min(0).max(1),
  trendStrength: z.number().nullable().optional(),
  volatilityPercentile: z.number().nullable().optional(),
  correlationToMarket: z.number().nullable().optional(),
  modelName: z.string().default("hmm_regime"),
  modelVersion: z.string().nullable().optional(),
  computedAt: z.string().datetime().optional(),
});

export type RegimeLabel = z.infer<typeof RegimeLabelSchema>;

export const RegimeLabelInsertSchema = RegimeLabelSchema.omit({ id: true, computedAt: true });
export type RegimeLabelInsert = z.infer<typeof RegimeLabelInsertSchema>;

// ============================================
// Constants
// ============================================

/** Special symbol for market-wide regime */
export const MARKET_SYMBOL = "_MARKET";

// ============================================
// Repository
// ============================================

export class RegimeLabelsRepository {
  constructor(private client: TursoClient) {}

  /**
   * Upsert a regime label
   */
  async upsert(label: RegimeLabelInsert): Promise<void> {
    try {
      await this.client.run(
        `INSERT INTO regime_labels (
          symbol, timestamp, timeframe, regime, confidence,
          trend_strength, volatility_percentile, correlation_to_market,
          model_name, model_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, timestamp, timeframe)
        DO UPDATE SET
          regime = excluded.regime,
          confidence = excluded.confidence,
          trend_strength = excluded.trend_strength,
          volatility_percentile = excluded.volatility_percentile,
          correlation_to_market = excluded.correlation_to_market,
          model_name = excluded.model_name,
          model_version = excluded.model_version,
          computed_at = datetime('now')`,
        [
          label.symbol,
          label.timestamp,
          label.timeframe,
          label.regime,
          label.confidence,
          label.trendStrength ?? null,
          label.volatilityPercentile ?? null,
          label.correlationToMarket ?? null,
          label.modelName,
          label.modelVersion ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("regime_labels", error as Error);
    }
  }

  /**
   * Get the current regime for a symbol
   */
  async getCurrent(symbol: string, timeframe: RegimeTimeframe): Promise<RegimeLabel | null> {
    const row = await this.client.get<RegimeLabelRow>(
      `SELECT * FROM regime_labels
       WHERE symbol = ? AND timeframe = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [symbol, timeframe]
    );
    return row ? mapRowToLabel(row) : null;
  }

  /**
   * Get the current market-wide regime
   */
  async getMarketRegime(timeframe: RegimeTimeframe): Promise<RegimeLabel | null> {
    return this.getCurrent(MARKET_SYMBOL, timeframe);
  }

  /**
   * Get regime history for a symbol
   */
  async getHistory(
    symbol: string,
    timeframe: RegimeTimeframe,
    startTime: string,
    endTime: string
  ): Promise<RegimeLabel[]> {
    const rows = await this.client.execute<RegimeLabelRow>(
      `SELECT * FROM regime_labels
       WHERE symbol = ? AND timeframe = ?
         AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [symbol, timeframe, startTime, endTime]
    );
    return rows.map(mapRowToLabel);
  }

  /**
   * Get symbols currently in a specific regime
   */
  async getSymbolsInRegime(
    regime: RegimeType,
    timeframe: RegimeTimeframe,
    minConfidence = 0.5
  ): Promise<string[]> {
    // Get most recent regime for each symbol
    const rows = await this.client.execute<{ symbol: string }>(
      `SELECT DISTINCT r1.symbol
       FROM regime_labels r1
       INNER JOIN (
         SELECT symbol, MAX(timestamp) as max_ts
         FROM regime_labels
         WHERE timeframe = ?
         GROUP BY symbol
       ) r2 ON r1.symbol = r2.symbol AND r1.timestamp = r2.max_ts
       WHERE r1.regime = ? AND r1.confidence >= ? AND r1.timeframe = ?
         AND r1.symbol != ?`,
      [timeframe, regime, minConfidence, timeframe, MARKET_SYMBOL]
    );
    return rows.map((r) => r.symbol);
  }

  /**
   * Get regime distribution (count of symbols in each regime)
   */
  async getRegimeDistribution(timeframe: RegimeTimeframe): Promise<Map<RegimeType, number>> {
    const rows = await this.client.execute<{ regime: string; count: number }>(
      `SELECT r1.regime, COUNT(*) as count
       FROM regime_labels r1
       INNER JOIN (
         SELECT symbol, MAX(timestamp) as max_ts
         FROM regime_labels
         WHERE timeframe = ? AND symbol != ?
         GROUP BY symbol
       ) r2 ON r1.symbol = r2.symbol AND r1.timestamp = r2.max_ts
       WHERE r1.timeframe = ?
       GROUP BY r1.regime`,
      [timeframe, MARKET_SYMBOL, timeframe]
    );

    const distribution = new Map<RegimeType, number>();
    for (const row of rows) {
      distribution.set(row.regime as RegimeType, row.count);
    }
    return distribution;
  }

  /**
   * Delete regime labels older than a date
   */
  async deleteOlderThan(beforeDate: string): Promise<number> {
    const result = await this.client.run(`DELETE FROM regime_labels WHERE timestamp < ?`, [
      beforeDate,
    ]);
    return result.changes;
  }
}

// ============================================
// Row Mapping
// ============================================

interface RegimeLabelRow {
  id: number;
  symbol: string;
  timestamp: string;
  timeframe: string;
  regime: string;
  confidence: number;
  trend_strength: number | null;
  volatility_percentile: number | null;
  correlation_to_market: number | null;
  model_name: string;
  model_version: string | null;
  computed_at: string;
  [key: string]: unknown;
}

function mapRowToLabel(row: RegimeLabelRow): RegimeLabel {
  return {
    id: row.id,
    symbol: row.symbol,
    timestamp: row.timestamp,
    timeframe: row.timeframe as RegimeTimeframe,
    regime: row.regime as RegimeType,
    confidence: row.confidence,
    trendStrength: row.trend_strength,
    volatilityPercentile: row.volatility_percentile,
    correlationToMarket: row.correlation_to_market,
    modelName: row.model_name,
    modelVersion: row.model_version,
    computedAt: row.computed_at,
  };
}
