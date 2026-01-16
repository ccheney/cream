/**
 * Features Repository (Drizzle ORM)
 *
 * Data access for computed indicator values with raw and normalized forms.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { features } from "../schema/market-data";

// ============================================
// Types
// ============================================

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export interface Feature {
	id: number;
	symbol: string;
	timestamp: string;
	timeframe: Timeframe;
	indicatorName: string;
	rawValue: number;
	normalizedValue: number | null;
	parameters: Record<string, unknown> | null;
	qualityScore: number | null;
	computedAt: string;
}

export interface FeatureInsert {
	symbol: string;
	timestamp: string;
	timeframe: Timeframe;
	indicatorName: string;
	rawValue: number;
	normalizedValue?: number | null;
	parameters?: Record<string, unknown> | null;
	qualityScore?: number | null;
}

// ============================================
// Row Mapping
// ============================================

type FeatureRow = typeof features.$inferSelect;

function mapFeatureRow(row: FeatureRow): Feature {
	return {
		id: row.id,
		symbol: row.symbol,
		timestamp: row.timestamp.toISOString(),
		timeframe: row.timeframe as Timeframe,
		indicatorName: row.indicatorName,
		rawValue: Number(row.rawValue),
		normalizedValue: row.normalizedValue ? Number(row.normalizedValue) : null,
		parameters: row.parameters as Record<string, unknown> | null,
		qualityScore: row.qualityScore ? Number(row.qualityScore) : null,
		computedAt: row.computedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class FeaturesRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async upsert(feature: FeatureInsert): Promise<void> {
		await this.db
			.insert(features)
			.values({
				symbol: feature.symbol,
				timestamp: new Date(feature.timestamp),
				timeframe: feature.timeframe as typeof features.$inferInsert.timeframe,
				indicatorName: feature.indicatorName,
				rawValue: String(feature.rawValue),
				normalizedValue: feature.normalizedValue != null ? String(feature.normalizedValue) : null,
				parameters: feature.parameters ?? null,
				qualityScore: feature.qualityScore != null ? String(feature.qualityScore) : null,
			})
			.onConflictDoUpdate({
				target: [features.symbol, features.timestamp, features.timeframe, features.indicatorName],
				set: {
					rawValue: String(feature.rawValue),
					normalizedValue: feature.normalizedValue != null ? String(feature.normalizedValue) : null,
					parameters: feature.parameters ?? null,
					qualityScore: feature.qualityScore != null ? String(feature.qualityScore) : null,
					computedAt: new Date(),
				},
			});
	}

	async bulkUpsert(featureList: FeatureInsert[]): Promise<number> {
		if (featureList.length === 0) {
			return 0;
		}

		let inserted = 0;
		for (const feature of featureList) {
			await this.upsert(feature);
			inserted++;
		}
		return inserted;
	}

	async getAtTimestamp(
		symbol: string,
		timestamp: string,
		timeframe: Timeframe
	): Promise<Feature[]> {
		const ts = new Date(timestamp);
		const rows = await this.db
			.select()
			.from(features)
			.where(
				and(
					eq(features.symbol, symbol),
					eq(features.timestamp, ts),
					eq(features.timeframe, timeframe as typeof features.$inferSelect.timeframe)
				)
			);

		return rows.map(mapFeatureRow);
	}

	async getIndicatorRange(
		symbol: string,
		indicatorName: string,
		timeframe: Timeframe,
		startTime: string,
		endTime: string
	): Promise<Feature[]> {
		const rows = await this.db
			.select()
			.from(features)
			.where(
				and(
					eq(features.symbol, symbol),
					eq(features.indicatorName, indicatorName),
					eq(features.timeframe, timeframe as typeof features.$inferSelect.timeframe),
					gte(features.timestamp, new Date(startTime)),
					lte(features.timestamp, new Date(endTime))
				)
			)
			.orderBy(features.timestamp);

		return rows.map(mapFeatureRow);
	}

	async getLatest(
		symbol: string,
		timeframe: Timeframe,
		indicatorNames?: string[]
	): Promise<Feature[]> {
		const [latest] = await this.db
			.select({ timestamp: sql<Date>`MAX(${features.timestamp})` })
			.from(features)
			.where(
				and(
					eq(features.symbol, symbol),
					eq(features.timeframe, timeframe as typeof features.$inferSelect.timeframe)
				)
			);

		if (!latest?.timestamp) {
			return [];
		}

		const conditions = [
			eq(features.symbol, symbol),
			eq(features.timeframe, timeframe as typeof features.$inferSelect.timeframe),
			eq(features.timestamp, latest.timestamp),
		];

		if (indicatorNames && indicatorNames.length > 0) {
			conditions.push(inArray(features.indicatorName, indicatorNames));
		}

		const rows = await this.db
			.select()
			.from(features)
			.where(and(...conditions));

		return rows.map(mapFeatureRow);
	}

	async listIndicators(symbol: string, timeframe: Timeframe): Promise<string[]> {
		const rows = await this.db
			.selectDistinct({ indicatorName: features.indicatorName })
			.from(features)
			.where(
				and(
					eq(features.symbol, symbol),
					eq(features.timeframe, timeframe as typeof features.$inferSelect.timeframe)
				)
			)
			.orderBy(features.indicatorName);

		return rows.map((r) => r.indicatorName);
	}

	async deleteOlderThan(beforeDate: string): Promise<number> {
		const result = await this.db
			.delete(features)
			.where(lte(features.timestamp, new Date(beforeDate)))
			.returning({ id: features.id });

		return result.length;
	}
}
