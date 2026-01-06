/**
 * Prediction Markets Repository
 *
 * Data access for prediction market snapshots, signals, and arbitrage alerts.
 *
 * @see docs/plans/18-prediction-markets.md
 */

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Prediction market platform
 */
export type PredictionPlatform = "KALSHI" | "POLYMARKET";

/**
 * Prediction market type
 */
export type PredictionMarketType =
  | "FED_RATE"
  | "ECONOMIC_DATA"
  | "RECESSION"
  | "GEOPOLITICAL"
  | "REGULATORY"
  | "ELECTION"
  | "OTHER";

/**
 * Signal type for computed predictions
 */
export type SignalType =
  | "fed_cut_probability"
  | "fed_hike_probability"
  | "recession_12m"
  | "macro_uncertainty"
  | "policy_event_risk"
  | "cpi_surprise"
  | "gdp_surprise"
  | "shutdown_probability"
  | "tariff_escalation";

/**
 * Market snapshot entity
 */
export interface MarketSnapshot {
  id: string;
  platform: PredictionPlatform;
  marketTicker: string;
  marketType: PredictionMarketType;
  marketQuestion: string | null;
  snapshotTime: string;
  data: MarketSnapshotData;
  createdAt: string;
}

/**
 * Market snapshot data payload
 */
export interface MarketSnapshotData {
  outcomes: Array<{
    outcome: string;
    probability: number;
    price: number;
    volume24h?: number;
  }>;
  liquidityScore?: number;
  volume24h?: number;
  openInterest?: number;
}

/**
 * Create snapshot input
 */
export interface CreateSnapshotInput {
  id: string;
  platform: PredictionPlatform;
  marketTicker: string;
  marketType: PredictionMarketType;
  marketQuestion?: string | null;
  snapshotTime: string;
  data: MarketSnapshotData;
}

/**
 * Computed signal entity
 */
export interface ComputedSignal {
  id: string;
  signalType: SignalType;
  signalValue: number;
  confidence: number | null;
  computedAt: string;
  inputs: SignalInputs;
  createdAt: string;
}

/**
 * Signal input data
 */
export interface SignalInputs {
  sources: Array<{
    platform: PredictionPlatform;
    ticker: string;
    price: number;
    weight: number;
  }>;
  method: string;
}

/**
 * Create signal input
 */
export interface CreateSignalInput {
  id: string;
  signalType: SignalType;
  signalValue: number;
  confidence?: number | null;
  computedAt: string;
  inputs: SignalInputs;
}

/**
 * Arbitrage alert entity
 */
export interface ArbitrageAlert {
  id: string;
  kalshiTicker: string;
  polymarketToken: string;
  kalshiPrice: number;
  polymarketPrice: number;
  divergencePct: number;
  marketType: PredictionMarketType;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionPrice: number | null;
  createdAt: string;
}

/**
 * Create arbitrage alert input
 */
export interface CreateArbitrageInput {
  id: string;
  kalshiTicker: string;
  polymarketToken: string;
  kalshiPrice: number;
  polymarketPrice: number;
  divergencePct: number;
  marketType: PredictionMarketType;
  detectedAt: string;
}

/**
 * Snapshot filter options
 */
export interface SnapshotFilters {
  platform?: PredictionPlatform;
  marketType?: PredictionMarketType;
  marketTicker?: string;
  fromTime?: string;
  toTime?: string;
}

/**
 * Signal filter options
 */
export interface SignalFilters {
  signalType?: SignalType;
  fromTime?: string;
  toTime?: string;
  minValue?: number;
  maxValue?: number;
}

// ============================================
// Row Mappers
// ============================================

function mapSnapshotRow(row: Row): MarketSnapshot {
  return {
    id: row.id as string,
    platform: row.platform as PredictionPlatform,
    marketTicker: row.market_ticker as string,
    marketType: row.market_type as PredictionMarketType,
    marketQuestion: row.market_question as string | null,
    snapshotTime: row.snapshot_time as string,
    data: parseJson<MarketSnapshotData>(row.data, { outcomes: [] }),
    createdAt: row.created_at as string,
  };
}

function mapSignalRow(row: Row): ComputedSignal {
  return {
    id: row.id as string,
    signalType: row.signal_type as SignalType,
    signalValue: row.signal_value as number,
    confidence: row.confidence as number | null,
    computedAt: row.computed_at as string,
    inputs: parseJson<SignalInputs>(row.inputs, { sources: [], method: "" }),
    createdAt: row.created_at as string,
  };
}

function mapArbitrageRow(row: Row): ArbitrageAlert {
  return {
    id: row.id as string,
    kalshiTicker: row.kalshi_ticker as string,
    polymarketToken: row.polymarket_token as string,
    kalshiPrice: row.kalshi_price as number,
    polymarketPrice: row.polymarket_price as number,
    divergencePct: row.divergence_pct as number,
    marketType: row.market_type as PredictionMarketType,
    detectedAt: row.detected_at as string,
    resolvedAt: row.resolved_at as string | null,
    resolutionPrice: row.resolution_price as number | null,
    createdAt: row.created_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Prediction markets repository
 */
export class PredictionMarketsRepository {
  constructor(private readonly client: TursoClient) {}

  // ============================================
  // Snapshot Operations
  // ============================================

  /**
   * Save a market snapshot
   */
  async saveSnapshot(input: CreateSnapshotInput): Promise<MarketSnapshot> {
    try {
      await this.client.run(
        `INSERT INTO prediction_market_snapshots (
          id, platform, market_ticker, market_type, market_question,
          snapshot_time, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.platform,
          input.marketTicker,
          input.marketType,
          input.marketQuestion ?? null,
          input.snapshotTime,
          toJson(input.data),
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("prediction_market_snapshots", error as Error);
    }

    return this.findSnapshotById(input.id) as Promise<MarketSnapshot>;
  }

  /**
   * Find snapshot by ID
   */
  async findSnapshotById(id: string): Promise<MarketSnapshot | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM prediction_market_snapshots WHERE id = ?",
      [id]
    );
    return row ? mapSnapshotRow(row) : null;
  }

  /**
   * Get snapshots for a ticker in time range
   */
  async getSnapshots(
    ticker: string,
    startTime: string,
    endTime: string
  ): Promise<MarketSnapshot[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_snapshots
       WHERE market_ticker = ?
         AND snapshot_time >= ?
         AND snapshot_time <= ?
       ORDER BY snapshot_time DESC`,
      [ticker, startTime, endTime]
    );
    return rows.map(mapSnapshotRow);
  }

  /**
   * Find snapshots with filters
   */
  async findSnapshots(filters: SnapshotFilters = {}, limit = 100): Promise<MarketSnapshot[]> {
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (filters.platform) {
      conditions.push("platform = ?");
      args.push(filters.platform);
    }
    if (filters.marketType) {
      conditions.push("market_type = ?");
      args.push(filters.marketType);
    }
    if (filters.marketTicker) {
      conditions.push("market_ticker = ?");
      args.push(filters.marketTicker);
    }
    if (filters.fromTime) {
      conditions.push("snapshot_time >= ?");
      args.push(filters.fromTime);
    }
    if (filters.toTime) {
      conditions.push("snapshot_time <= ?");
      args.push(filters.toTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_snapshots ${whereClause}
       ORDER BY snapshot_time DESC
       LIMIT ?`,
      [...args, limit]
    );

    return rows.map(mapSnapshotRow);
  }

  /**
   * Get latest snapshot for each unique ticker
   */
  async getLatestSnapshots(platform?: PredictionPlatform): Promise<MarketSnapshot[]> {
    const whereClause = platform ? "WHERE platform = ?" : "";
    const args = platform ? [platform] : [];

    const rows = await this.client.execute<Row>(
      `SELECT s.*
       FROM prediction_market_snapshots s
       INNER JOIN (
         SELECT market_ticker, MAX(snapshot_time) as max_time
         FROM prediction_market_snapshots
         ${whereClause}
         GROUP BY market_ticker
       ) latest ON s.market_ticker = latest.market_ticker
         AND s.snapshot_time = latest.max_time`,
      args
    );

    return rows.map(mapSnapshotRow);
  }

  // ============================================
  // Signal Operations
  // ============================================

  /**
   * Save a computed signal
   */
  async saveSignal(input: CreateSignalInput): Promise<ComputedSignal> {
    try {
      await this.client.run(
        `INSERT INTO prediction_market_signals (
          id, signal_type, signal_value, confidence, computed_at, inputs
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.signalType,
          input.signalValue,
          input.confidence ?? null,
          input.computedAt,
          toJson(input.inputs),
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("prediction_market_signals", error as Error);
    }

    return this.findSignalById(input.id) as Promise<ComputedSignal>;
  }

  /**
   * Find signal by ID
   */
  async findSignalById(id: string): Promise<ComputedSignal | null> {
    const row = await this.client.get<Row>("SELECT * FROM prediction_market_signals WHERE id = ?", [
      id,
    ]);
    return row ? mapSignalRow(row) : null;
  }

  /**
   * Get signal history for a type
   */
  async getSignalHistory(signalType: SignalType, limit = 100): Promise<ComputedSignal[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_signals
       WHERE signal_type = ?
       ORDER BY computed_at DESC
       LIMIT ?`,
      [signalType, limit]
    );
    return rows.map(mapSignalRow);
  }

  /**
   * Find signals with filters
   */
  async findSignals(filters: SignalFilters = {}, limit = 100): Promise<ComputedSignal[]> {
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (filters.signalType) {
      conditions.push("signal_type = ?");
      args.push(filters.signalType);
    }
    if (filters.fromTime) {
      conditions.push("computed_at >= ?");
      args.push(filters.fromTime);
    }
    if (filters.toTime) {
      conditions.push("computed_at <= ?");
      args.push(filters.toTime);
    }
    if (filters.minValue !== undefined) {
      conditions.push("signal_value >= ?");
      args.push(filters.minValue);
    }
    if (filters.maxValue !== undefined) {
      conditions.push("signal_value <= ?");
      args.push(filters.maxValue);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_signals ${whereClause}
       ORDER BY computed_at DESC
       LIMIT ?`,
      [...args, limit]
    );

    return rows.map(mapSignalRow);
  }

  /**
   * Get the latest signal for each type
   */
  async getLatestSignals(): Promise<ComputedSignal[]> {
    const rows = await this.client.execute<Row>(
      `SELECT s.*
       FROM prediction_market_signals s
       INNER JOIN (
         SELECT signal_type, MAX(computed_at) as max_time
         FROM prediction_market_signals
         GROUP BY signal_type
       ) latest ON s.signal_type = latest.signal_type
         AND s.computed_at = latest.max_time`
    );

    return rows.map(mapSignalRow);
  }

  // ============================================
  // Arbitrage Operations
  // ============================================

  /**
   * Save an arbitrage alert
   */
  async saveArbitrageAlert(input: CreateArbitrageInput): Promise<ArbitrageAlert> {
    try {
      await this.client.run(
        `INSERT INTO prediction_market_arbitrage (
          id, kalshi_ticker, polymarket_token, kalshi_price, polymarket_price,
          divergence_pct, market_type, detected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.kalshiTicker,
          input.polymarketToken,
          input.kalshiPrice,
          input.polymarketPrice,
          input.divergencePct,
          input.marketType,
          input.detectedAt,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError("prediction_market_arbitrage", error as Error);
    }

    return this.findArbitrageById(input.id) as Promise<ArbitrageAlert>;
  }

  /**
   * Find arbitrage alert by ID
   */
  async findArbitrageById(id: string): Promise<ArbitrageAlert | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM prediction_market_arbitrage WHERE id = ?",
      [id]
    );
    return row ? mapArbitrageRow(row) : null;
  }

  /**
   * Get unresolved arbitrage alerts
   */
  async getUnresolvedArbitrageAlerts(): Promise<ArbitrageAlert[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_arbitrage
       WHERE resolved_at IS NULL
       ORDER BY divergence_pct DESC`
    );
    return rows.map(mapArbitrageRow);
  }

  /**
   * Resolve an arbitrage alert
   */
  async resolveArbitrageAlert(id: string, resolutionPrice: number): Promise<ArbitrageAlert> {
    const now = new Date().toISOString();

    const result = await this.client.run(
      `UPDATE prediction_market_arbitrage
       SET resolved_at = ?, resolution_price = ?
       WHERE id = ?`,
      [now, resolutionPrice, id]
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound("prediction_market_arbitrage", id);
    }

    return this.findArbitrageById(id) as Promise<ArbitrageAlert>;
  }

  /**
   * Find arbitrage alerts with filters
   */
  async findArbitrageAlerts(
    options: {
      minDivergence?: number;
      resolved?: boolean;
      fromTime?: string;
      toTime?: string;
    } = {},
    limit = 100
  ): Promise<ArbitrageAlert[]> {
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (options.minDivergence !== undefined) {
      conditions.push("divergence_pct >= ?");
      args.push(options.minDivergence);
    }
    if (options.resolved !== undefined) {
      conditions.push(options.resolved ? "resolved_at IS NOT NULL" : "resolved_at IS NULL");
    }
    if (options.fromTime) {
      conditions.push("detected_at >= ?");
      args.push(options.fromTime);
    }
    if (options.toTime) {
      conditions.push("detected_at <= ?");
      args.push(options.toTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await this.client.execute<Row>(
      `SELECT * FROM prediction_market_arbitrage ${whereClause}
       ORDER BY detected_at DESC
       LIMIT ?`,
      [...args, limit]
    );

    return rows.map(mapArbitrageRow);
  }

  // ============================================
  // Data Retention
  // ============================================

  /**
   * Prune old data based on retention policy
   *
   * @param retentionDays - Number of days to retain
   * @returns Object with counts of deleted records
   */
  async pruneOldData(retentionDays: number): Promise<{
    snapshots: number;
    signals: number;
    arbitrage: number;
  }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString();

    const snapshotsResult = await this.client.run(
      "DELETE FROM prediction_market_snapshots WHERE created_at < ?",
      [cutoffStr]
    );

    const signalsResult = await this.client.run(
      "DELETE FROM prediction_market_signals WHERE created_at < ?",
      [cutoffStr]
    );

    const arbitrageResult = await this.client.run(
      "DELETE FROM prediction_market_arbitrage WHERE created_at < ? AND resolved_at IS NOT NULL",
      [cutoffStr]
    );

    return {
      snapshots: snapshotsResult.changes,
      signals: signalsResult.changes,
      arbitrage: arbitrageResult.changes,
    };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    snapshotCount: number;
    signalCount: number;
    arbitrageCount: number;
    unresolvedArbitrageCount: number;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  }> {
    const snapshotCount = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM prediction_market_snapshots"
    );
    const signalCount = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM prediction_market_signals"
    );
    const arbitrageCount = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM prediction_market_arbitrage"
    );
    const unresolvedCount = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM prediction_market_arbitrage WHERE resolved_at IS NULL"
    );
    const oldest = await this.client.get<{ snapshot_time: string }>(
      "SELECT MIN(snapshot_time) as snapshot_time FROM prediction_market_snapshots"
    );
    const newest = await this.client.get<{ snapshot_time: string }>(
      "SELECT MAX(snapshot_time) as snapshot_time FROM prediction_market_snapshots"
    );

    return {
      snapshotCount: snapshotCount?.count ?? 0,
      signalCount: signalCount?.count ?? 0,
      arbitrageCount: arbitrageCount?.count ?? 0,
      unresolvedArbitrageCount: unresolvedCount?.count ?? 0,
      oldestSnapshot: oldest?.snapshot_time ?? null,
      newestSnapshot: newest?.snapshot_time ?? null,
    };
  }
}
