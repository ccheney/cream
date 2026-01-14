/**
 * Candles Repository
 *
 * CRUD operations for OHLCV candle data.
 * Primary storage for price data used in indicator computation.
 *
 * @see migrations/003_market_data_tables.sql
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Zod Schemas
// ============================================

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const CandleSchema = z.object({
	id: z.number().optional(),
	symbol: z.string(),
	timeframe: TimeframeSchema,
	timestamp: z.string().datetime(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number().default(0),
	vwap: z.number().nullable().optional(),
	tradeCount: z.number().nullable().optional(),
	adjusted: z.boolean().default(false),
	splitAdjusted: z.boolean().default(false),
	dividendAdjusted: z.boolean().default(false),
	qualityFlags: z.array(z.string()).nullable().optional(),
	provider: z.string().default("alpaca"),
	createdAt: z.string().datetime().optional(),
});

export type Candle = z.infer<typeof CandleSchema>;

export const CandleInsertSchema = CandleSchema.omit({ id: true, createdAt: true });
export type CandleInsert = z.infer<typeof CandleInsertSchema>;

// ============================================
// Repository
// ============================================

export class CandlesRepository {
	constructor(private client: TursoClient) {}

	/**
	 * Insert a single candle (upsert on symbol+timeframe+timestamp)
	 */
	async upsert(candle: CandleInsert): Promise<void> {
		try {
			await this.client.run(
				`INSERT INTO candles (
          symbol, timeframe, timestamp, open, high, low, close, volume,
          vwap, trade_count, adjusted, split_adjusted, dividend_adjusted,
          quality_flags, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, timeframe, timestamp)
        DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          vwap = excluded.vwap,
          trade_count = excluded.trade_count,
          adjusted = excluded.adjusted,
          split_adjusted = excluded.split_adjusted,
          dividend_adjusted = excluded.dividend_adjusted,
          quality_flags = excluded.quality_flags`,
				[
					candle.symbol,
					candle.timeframe,
					candle.timestamp,
					candle.open,
					candle.high,
					candle.low,
					candle.close,
					candle.volume,
					candle.vwap ?? null,
					candle.tradeCount ?? null,
					candle.adjusted ? 1 : 0,
					candle.splitAdjusted ? 1 : 0,
					candle.dividendAdjusted ? 1 : 0,
					candle.qualityFlags ? toJson(candle.qualityFlags) : null,
					candle.provider,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError("candles", error as Error);
		}
	}

	/**
	 * Bulk insert candles
	 */
	async bulkUpsert(candles: CandleInsert[]): Promise<number> {
		if (candles.length === 0) {
			return 0;
		}

		let inserted = 0;
		// Process in batches of 100
		for (let i = 0; i < candles.length; i += 100) {
			const batch = candles.slice(i, i + 100);
			await this.client.run("BEGIN TRANSACTION");
			try {
				for (const candle of batch) {
					await this.upsert(candle);
					inserted++;
				}
				await this.client.run("COMMIT");
			} catch (error) {
				await this.client.run("ROLLBACK");
				throw error;
			}
		}
		return inserted;
	}

	/**
	 * Get candles for a symbol within a date range
	 */
	async getRange(
		symbol: string,
		timeframe: Timeframe,
		startTime: string,
		endTime: string
	): Promise<Candle[]> {
		const rows = await this.client.execute<CandleRow>(
			`SELECT * FROM candles
       WHERE symbol = ? AND timeframe = ?
         AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
			[symbol, timeframe, startTime, endTime]
		);
		return rows.map(mapRowToCandle);
	}

	/**
	 * Get the latest N candles for a symbol
	 */
	async getLatest(symbol: string, timeframe: Timeframe, limit = 100): Promise<Candle[]> {
		const rows = await this.client.execute<CandleRow>(
			`SELECT * FROM candles
       WHERE symbol = ? AND timeframe = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
			[symbol, timeframe, limit]
		);
		// Return in ascending order
		return rows.map(mapRowToCandle).toReversed();
	}

	/**
	 * Get the most recent candle for a symbol
	 */
	async getLastCandle(symbol: string, timeframe: Timeframe): Promise<Candle | null> {
		const row = await this.client.get<CandleRow>(
			`SELECT * FROM candles
       WHERE symbol = ? AND timeframe = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
			[symbol, timeframe]
		);
		return row ? mapRowToCandle(row) : null;
	}

	/**
	 * Get candle count for a symbol
	 */
	async count(symbol: string, timeframe: Timeframe): Promise<number> {
		const result = await this.client.get<{ count: number }>(
			`SELECT COUNT(*) as count FROM candles WHERE symbol = ? AND timeframe = ?`,
			[symbol, timeframe]
		);
		return result?.count ?? 0;
	}

	/**
	 * Delete candles older than a date
	 */
	async deleteOlderThan(symbol: string, timeframe: Timeframe, beforeDate: string): Promise<number> {
		const result = await this.client.run(
			`DELETE FROM candles WHERE symbol = ? AND timeframe = ? AND timestamp < ?`,
			[symbol, timeframe, beforeDate]
		);
		return result.changes;
	}

	/**
	 * Get all symbols with candle data
	 */
	async getSymbols(timeframe?: Timeframe): Promise<string[]> {
		const query = timeframe
			? `SELECT DISTINCT symbol FROM candles WHERE timeframe = ? ORDER BY symbol`
			: `SELECT DISTINCT symbol FROM candles ORDER BY symbol`;
		const args = timeframe ? [timeframe] : [];
		const rows = await this.client.execute<{ symbol: string }>(query, args);
		return rows.map((r) => r.symbol);
	}
}

// ============================================
// Row Mapping
// ============================================

interface CandleRow {
	id: number;
	symbol: string;
	timeframe: string;
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	vwap: number | null;
	trade_count: number | null;
	adjusted: number;
	split_adjusted: number;
	dividend_adjusted: number;
	quality_flags: string | null;
	provider: string;
	created_at: string;
	[key: string]: unknown;
}

function mapRowToCandle(row: CandleRow): Candle {
	return {
		id: row.id,
		symbol: row.symbol,
		timeframe: row.timeframe as Timeframe,
		timestamp: row.timestamp,
		open: row.open,
		high: row.high,
		low: row.low,
		close: row.close,
		volume: row.volume,
		vwap: row.vwap,
		tradeCount: row.trade_count,
		adjusted: row.adjusted === 1,
		splitAdjusted: row.split_adjusted === 1,
		dividendAdjusted: row.dividend_adjusted === 1,
		qualityFlags: parseJson<string[] | null>(row.quality_flags, null),
		provider: row.provider,
		createdAt: row.created_at,
	};
}
