/**
 * Regime Labels Repository (Drizzle ORM)
 *
 * Data access for market regime classifications.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, gte, lte, max, ne } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { regimeLabels } from "../schema/market-data";

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

export interface RegimeLabel {
	id: number;
	symbol: string;
	timestamp: string;
	timeframe: RegimeTimeframe;
	regime: RegimeType;
	confidence: number;
	trendStrength: number | null;
	volatilityPercentile: number | null;
	correlationToMarket: number | null;
	modelName: string;
	modelVersion: string | null;
	computedAt: string;
}

export interface RegimeLabelInsert {
	symbol: string;
	timestamp: string;
	timeframe: RegimeTimeframe;
	regime: RegimeType;
	confidence: number;
	trendStrength?: number | null;
	volatilityPercentile?: number | null;
	correlationToMarket?: number | null;
	modelName?: string;
	modelVersion?: string | null;
}

// ============================================
// Constants
// ============================================

export const MARKET_SYMBOL = "_MARKET";

// ============================================
// Row Mapping
// ============================================

type RegimeLabelRow = typeof regimeLabels.$inferSelect;

function mapRegimeLabelRow(row: RegimeLabelRow): RegimeLabel {
	return {
		id: row.id,
		symbol: row.symbol,
		timestamp: row.timestamp.toISOString(),
		timeframe: row.timeframe as RegimeTimeframe,
		regime: row.regime as RegimeType,
		confidence: Number(row.confidence),
		trendStrength: row.trendStrength ? Number(row.trendStrength) : null,
		volatilityPercentile: row.volatilityPercentile ? Number(row.volatilityPercentile) : null,
		correlationToMarket: row.correlationToMarket ? Number(row.correlationToMarket) : null,
		modelName: row.modelName,
		modelVersion: row.modelVersion,
		computedAt: row.computedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class RegimeLabelsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async upsert(label: RegimeLabelInsert): Promise<void> {
		await this.db
			.insert(regimeLabels)
			.values({
				symbol: label.symbol,
				timestamp: new Date(label.timestamp),
				timeframe: label.timeframe as typeof regimeLabels.$inferInsert.timeframe,
				regime: label.regime as typeof regimeLabels.$inferInsert.regime,
				confidence: String(label.confidence),
				trendStrength: label.trendStrength != null ? String(label.trendStrength) : null,
				volatilityPercentile:
					label.volatilityPercentile != null ? String(label.volatilityPercentile) : null,
				correlationToMarket:
					label.correlationToMarket != null ? String(label.correlationToMarket) : null,
				modelName: label.modelName ?? "hmm_regime",
				modelVersion: label.modelVersion ?? null,
			})
			.onConflictDoUpdate({
				target: [regimeLabels.symbol, regimeLabels.timestamp, regimeLabels.timeframe],
				set: {
					regime: label.regime as typeof regimeLabels.$inferInsert.regime,
					confidence: String(label.confidence),
					trendStrength: label.trendStrength != null ? String(label.trendStrength) : null,
					volatilityPercentile:
						label.volatilityPercentile != null ? String(label.volatilityPercentile) : null,
					correlationToMarket:
						label.correlationToMarket != null ? String(label.correlationToMarket) : null,
					modelName: label.modelName ?? "hmm_regime",
					modelVersion: label.modelVersion ?? null,
					computedAt: new Date(),
				},
			});
	}

	async getCurrent(symbol: string, timeframe: RegimeTimeframe): Promise<RegimeLabel | null> {
		const [row] = await this.db
			.select()
			.from(regimeLabels)
			.where(
				and(
					eq(regimeLabels.symbol, symbol),
					eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe)
				)
			)
			.orderBy(desc(regimeLabels.timestamp))
			.limit(1);

		return row ? mapRegimeLabelRow(row) : null;
	}

	async getMarketRegime(timeframe: RegimeTimeframe): Promise<RegimeLabel | null> {
		return this.getCurrent(MARKET_SYMBOL, timeframe);
	}

	async getLatestForSymbol(symbol: string): Promise<RegimeLabel | null> {
		const [row] = await this.db
			.select()
			.from(regimeLabels)
			.where(eq(regimeLabels.symbol, symbol))
			.orderBy(desc(regimeLabels.timestamp))
			.limit(1);

		return row ? mapRegimeLabelRow(row) : null;
	}

	async getHistory(
		symbol: string,
		timeframe: RegimeTimeframe,
		startTime: string,
		endTime: string
	): Promise<RegimeLabel[]> {
		const rows = await this.db
			.select()
			.from(regimeLabels)
			.where(
				and(
					eq(regimeLabels.symbol, symbol),
					eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe),
					gte(regimeLabels.timestamp, new Date(startTime)),
					lte(regimeLabels.timestamp, new Date(endTime))
				)
			)
			.orderBy(regimeLabels.timestamp);

		return rows.map(mapRegimeLabelRow);
	}

	async getSymbolsInRegime(
		regime: RegimeType,
		timeframe: RegimeTimeframe,
		minConfidence = 0.5
	): Promise<string[]> {
		const latestTimestamps = this.db
			.select({
				symbol: regimeLabels.symbol,
				maxTs: max(regimeLabels.timestamp).as("max_ts"),
			})
			.from(regimeLabels)
			.where(eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe))
			.groupBy(regimeLabels.symbol)
			.as("latest");

		const rows = await this.db
			.selectDistinct({ symbol: regimeLabels.symbol })
			.from(regimeLabels)
			.innerJoin(
				latestTimestamps,
				and(
					eq(regimeLabels.symbol, latestTimestamps.symbol),
					eq(regimeLabels.timestamp, latestTimestamps.maxTs)
				)
			)
			.where(
				and(
					eq(regimeLabels.regime, regime as typeof regimeLabels.$inferSelect.regime),
					gte(regimeLabels.confidence, String(minConfidence)),
					eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe),
					ne(regimeLabels.symbol, MARKET_SYMBOL)
				)
			);

		return rows.map((r) => r.symbol);
	}

	async getRegimeDistribution(timeframe: RegimeTimeframe): Promise<Map<RegimeType, number>> {
		const latestTimestamps = this.db
			.select({
				symbol: regimeLabels.symbol,
				maxTs: max(regimeLabels.timestamp).as("max_ts"),
			})
			.from(regimeLabels)
			.where(
				and(
					eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe),
					ne(regimeLabels.symbol, MARKET_SYMBOL)
				)
			)
			.groupBy(regimeLabels.symbol)
			.as("latest");

		const rows = await this.db
			.select({
				regime: regimeLabels.regime,
				count: count(),
			})
			.from(regimeLabels)
			.innerJoin(
				latestTimestamps,
				and(
					eq(regimeLabels.symbol, latestTimestamps.symbol),
					eq(regimeLabels.timestamp, latestTimestamps.maxTs)
				)
			)
			.where(eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe))
			.groupBy(regimeLabels.regime);

		const distribution = new Map<RegimeType, number>();
		for (const row of rows) {
			distribution.set(row.regime as RegimeType, row.count);
		}
		return distribution;
	}

	async deleteOlderThan(beforeDate: string): Promise<number> {
		const result = await this.db
			.delete(regimeLabels)
			.where(lte(regimeLabels.timestamp, new Date(beforeDate)))
			.returning({ id: regimeLabels.id });

		return result.length;
	}

	async getRegimeAtDate(
		symbol: string,
		timeframe: RegimeTimeframe,
		asOfDate: string
	): Promise<RegimeLabel | null> {
		const [row] = await this.db
			.select()
			.from(regimeLabels)
			.where(
				and(
					eq(regimeLabels.symbol, symbol),
					eq(regimeLabels.timeframe, timeframe as typeof regimeLabels.$inferSelect.timeframe),
					lte(regimeLabels.timestamp, new Date(asOfDate))
				)
			)
			.orderBy(desc(regimeLabels.timestamp))
			.limit(1);

		return row ? mapRegimeLabelRow(row) : null;
	}
}
