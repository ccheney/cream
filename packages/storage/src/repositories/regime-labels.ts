/**
 * Regime Labels Repository (Drizzle ORM)
 *
 * Data access for market regime classifications.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "../db";
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
				volatilityPercentile: label.volatilityPercentile != null ? String(label.volatilityPercentile) : null,
				correlationToMarket: label.correlationToMarket != null ? String(label.correlationToMarket) : null,
				modelName: label.modelName ?? "hmm_regime",
				modelVersion: label.modelVersion ?? null,
			})
			.onConflictDoUpdate({
				target: [regimeLabels.symbol, regimeLabels.timestamp, regimeLabels.timeframe],
				set: {
					regime: label.regime as typeof regimeLabels.$inferInsert.regime,
					confidence: String(label.confidence),
					trendStrength: label.trendStrength != null ? String(label.trendStrength) : null,
					volatilityPercentile: label.volatilityPercentile != null ? String(label.volatilityPercentile) : null,
					correlationToMarket: label.correlationToMarket != null ? String(label.correlationToMarket) : null,
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
		const rows = await this.db.execute(sql`
			SELECT DISTINCT r1.symbol
			FROM ${regimeLabels} r1
			INNER JOIN (
				SELECT symbol, MAX(timestamp) as max_ts
				FROM ${regimeLabels}
				WHERE timeframe = ${timeframe}
				GROUP BY symbol
			) r2 ON r1.symbol = r2.symbol AND r1.timestamp = r2.max_ts
			WHERE r1.regime = ${regime}
				AND r1.confidence >= ${String(minConfidence)}
				AND r1.timeframe = ${timeframe}
				AND r1.symbol != ${MARKET_SYMBOL}
		`);

		return (rows.rows as { symbol: string }[]).map((r) => r.symbol);
	}

	async getRegimeDistribution(timeframe: RegimeTimeframe): Promise<Map<RegimeType, number>> {
		const rows = await this.db.execute(sql`
			SELECT r1.regime, COUNT(*)::int as count
			FROM ${regimeLabels} r1
			INNER JOIN (
				SELECT symbol, MAX(timestamp) as max_ts
				FROM ${regimeLabels}
				WHERE timeframe = ${timeframe} AND symbol != ${MARKET_SYMBOL}
				GROUP BY symbol
			) r2 ON r1.symbol = r2.symbol AND r1.timestamp = r2.max_ts
			WHERE r1.timeframe = ${timeframe}
			GROUP BY r1.regime
		`);

		const distribution = new Map<RegimeType, number>();
		for (const row of rows.rows as { regime: string; count: number }[]) {
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
}
