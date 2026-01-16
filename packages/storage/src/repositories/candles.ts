/**
 * Candles Repository (Drizzle ORM)
 *
 * CRUD operations for OHLCV candle data.
 * Primary storage for price data used in indicator computation.
 */
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { candles } from "../schema/market-data";

// ============================================
// Zod Schemas
// ============================================

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "1d"]);
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

export const CandleInsertSchema = CandleSchema.omit({
	id: true,
	createdAt: true,
});
export type CandleInsert = z.infer<typeof CandleInsertSchema>;

// ============================================
// Repository
// ============================================

export class CandlesRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	/**
	 * Insert a single candle (upsert on symbol+timeframe+timestamp)
	 */
	async upsert(candle: CandleInsert): Promise<void> {
		await this.db
			.insert(candles)
			.values({
				symbol: candle.symbol,
				timeframe: candle.timeframe,
				timestamp: new Date(candle.timestamp),
				open: String(candle.open),
				high: String(candle.high),
				low: String(candle.low),
				close: String(candle.close),
				volume: String(candle.volume),
				vwap: candle.vwap != null ? String(candle.vwap) : null,
				tradeCount: candle.tradeCount ?? null,
				adjusted: candle.adjusted,
				splitAdjusted: candle.splitAdjusted,
				dividendAdjusted: candle.dividendAdjusted,
				qualityFlags: candle.qualityFlags ?? [],
				provider: candle.provider,
			})
			.onConflictDoUpdate({
				target: [candles.symbol, candles.timeframe, candles.timestamp],
				set: {
					open: String(candle.open),
					high: String(candle.high),
					low: String(candle.low),
					close: String(candle.close),
					volume: String(candle.volume),
					vwap: candle.vwap != null ? String(candle.vwap) : null,
					tradeCount: candle.tradeCount ?? null,
					adjusted: candle.adjusted,
					splitAdjusted: candle.splitAdjusted,
					dividendAdjusted: candle.dividendAdjusted,
					qualityFlags: candle.qualityFlags ?? [],
				},
			});
	}

	/**
	 * Bulk insert candles
	 */
	async bulkUpsert(candlesList: CandleInsert[]): Promise<number> {
		if (candlesList.length === 0) {
			return 0;
		}

		let inserted = 0;
		// Process in batches of 100
		for (let i = 0; i < candlesList.length; i += 100) {
			const batch = candlesList.slice(i, i + 100);

			const values = batch.map((candle) => ({
				symbol: candle.symbol,
				timeframe: candle.timeframe,
				timestamp: new Date(candle.timestamp),
				open: String(candle.open),
				high: String(candle.high),
				low: String(candle.low),
				close: String(candle.close),
				volume: String(candle.volume),
				vwap: candle.vwap != null ? String(candle.vwap) : null,
				tradeCount: candle.tradeCount ?? null,
				adjusted: candle.adjusted,
				splitAdjusted: candle.splitAdjusted,
				dividendAdjusted: candle.dividendAdjusted,
				qualityFlags: candle.qualityFlags ?? [],
				provider: candle.provider,
			}));

			await this.db
				.insert(candles)
				.values(values)
				.onConflictDoUpdate({
					target: [candles.symbol, candles.timeframe, candles.timestamp],
					set: {
						open: sql`excluded.open`,
						high: sql`excluded.high`,
						low: sql`excluded.low`,
						close: sql`excluded.close`,
						volume: sql`excluded.volume`,
						vwap: sql`excluded.vwap`,
						tradeCount: sql`excluded.trade_count`,
						adjusted: sql`excluded.adjusted`,
						splitAdjusted: sql`excluded.split_adjusted`,
						dividendAdjusted: sql`excluded.dividend_adjusted`,
						qualityFlags: sql`excluded.quality_flags`,
					},
				});

			inserted += batch.length;
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
		const rows = await this.db
			.select()
			.from(candles)
			.where(
				and(
					eq(candles.symbol, symbol),
					eq(candles.timeframe, timeframe),
					gte(candles.timestamp, new Date(startTime)),
					lte(candles.timestamp, new Date(endTime))
				)
			)
			.orderBy(asc(candles.timestamp));

		return rows.map(mapRowToCandle);
	}

	/**
	 * Get the latest N candles for a symbol
	 */
	async getLatest(symbol: string, timeframe: Timeframe, limit = 100): Promise<Candle[]> {
		const rows = await this.db
			.select()
			.from(candles)
			.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, timeframe)))
			.orderBy(desc(candles.timestamp))
			.limit(limit);

		// Return in ascending order
		return rows.map(mapRowToCandle).toReversed();
	}

	/**
	 * Get the most recent candle for a symbol
	 */
	async getLastCandle(symbol: string, timeframe: Timeframe): Promise<Candle | null> {
		const rows = await this.db
			.select()
			.from(candles)
			.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, timeframe)))
			.orderBy(desc(candles.timestamp))
			.limit(1);

		return rows[0] ? mapRowToCandle(rows[0]) : null;
	}

	/**
	 * Get candle count for a symbol
	 */
	async count(symbol: string, timeframe: Timeframe): Promise<number> {
		const result = await this.db
			.select({ count: count() })
			.from(candles)
			.where(and(eq(candles.symbol, symbol), eq(candles.timeframe, timeframe)));

		return result[0]?.count ?? 0;
	}

	/**
	 * Delete candles older than a date
	 */
	async deleteOlderThan(symbol: string, timeframe: Timeframe, beforeDate: string): Promise<number> {
		const result = await this.db
			.delete(candles)
			.where(
				and(
					eq(candles.symbol, symbol),
					eq(candles.timeframe, timeframe),
					lte(candles.timestamp, new Date(beforeDate))
				)
			)
			.returning({ id: candles.id });

		return result.length;
	}

	/**
	 * Get all symbols with candle data
	 */
	async getSymbols(timeframe?: Timeframe): Promise<string[]> {
		const query = timeframe
			? this.db
					.selectDistinct({ symbol: candles.symbol })
					.from(candles)
					.where(eq(candles.timeframe, timeframe))
					.orderBy(asc(candles.symbol))
			: this.db
					.selectDistinct({ symbol: candles.symbol })
					.from(candles)
					.orderBy(asc(candles.symbol));

		const rows = await query;
		return rows.map((r) => r.symbol);
	}
}

// ============================================
// Row Mapping
// ============================================

type CandleRow = typeof candles.$inferSelect;

function mapRowToCandle(row: CandleRow): Candle {
	return {
		id: row.id,
		symbol: row.symbol,
		timeframe: row.timeframe as Timeframe,
		timestamp: row.timestamp.toISOString(),
		open: Number(row.open),
		high: Number(row.high),
		low: Number(row.low),
		close: Number(row.close),
		volume: Number(row.volume),
		vwap: row.vwap ? Number(row.vwap) : null,
		tradeCount: row.tradeCount,
		adjusted: row.adjusted,
		splitAdjusted: row.splitAdjusted,
		dividendAdjusted: row.dividendAdjusted,
		qualityFlags: row.qualityFlags as string[] | null,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
	};
}
