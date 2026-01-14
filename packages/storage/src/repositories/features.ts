/**
 * Features Repository
 *
 * Computed indicator values with raw and normalized forms.
 *
 * @see migrations/003_market_data_tables.sql
 */

import { z } from "zod";
import type { TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";
import { type Timeframe, TimeframeSchema } from "./candles.js";

export const FeatureSchema = z.object({
	id: z.number().optional(),
	symbol: z.string(),
	timestamp: z.string().datetime(),
	timeframe: TimeframeSchema,
	indicatorName: z.string(),
	rawValue: z.number(),
	normalizedValue: z.number().nullable().optional(),
	parameters: z.record(z.string(), z.unknown()).nullable().optional(),
	qualityScore: z.number().min(0).max(1).nullable().optional(),
	computedAt: z.string().datetime().optional(),
});

export type Feature = z.infer<typeof FeatureSchema>;

export const FeatureInsertSchema = FeatureSchema.omit({ id: true, computedAt: true });
export type FeatureInsert = z.infer<typeof FeatureInsertSchema>;

export class FeaturesRepository {
	constructor(private client: TursoClient) {}

	async upsert(feature: FeatureInsert): Promise<void> {
		try {
			await this.client.run(
				`INSERT INTO features (
          symbol, timestamp, timeframe, indicator_name,
          raw_value, normalized_value, parameters, quality_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, timestamp, timeframe, indicator_name)
        DO UPDATE SET
          raw_value = excluded.raw_value,
          normalized_value = excluded.normalized_value,
          parameters = excluded.parameters,
          quality_score = excluded.quality_score,
          computed_at = datetime('now')`,
				[
					feature.symbol,
					feature.timestamp,
					feature.timeframe,
					feature.indicatorName,
					feature.rawValue,
					feature.normalizedValue ?? null,
					feature.parameters ? toJson(feature.parameters) : null,
					feature.qualityScore ?? null,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError("features", error as Error);
		}
	}

	async bulkUpsert(features: FeatureInsert[]): Promise<number> {
		if (features.length === 0) {
			return 0;
		}

		let inserted = 0;
		for (let i = 0; i < features.length; i += 100) {
			const batch = features.slice(i, i + 100);
			await this.client.run("BEGIN TRANSACTION");
			try {
				for (const feature of batch) {
					await this.upsert(feature);
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

	async getAtTimestamp(
		symbol: string,
		timestamp: string,
		timeframe: Timeframe
	): Promise<Feature[]> {
		const rows = await this.client.execute<FeatureRow>(
			`SELECT * FROM features
       WHERE symbol = ? AND timestamp = ? AND timeframe = ?`,
			[symbol, timestamp, timeframe]
		);
		return rows.map(mapRowToFeature);
	}

	async getIndicatorRange(
		symbol: string,
		indicatorName: string,
		timeframe: Timeframe,
		startTime: string,
		endTime: string
	): Promise<Feature[]> {
		const rows = await this.client.execute<FeatureRow>(
			`SELECT * FROM features
       WHERE symbol = ? AND indicator_name = ? AND timeframe = ?
         AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
			[symbol, indicatorName, timeframe, startTime, endTime]
		);
		return rows.map(mapRowToFeature);
	}

	async getLatest(
		symbol: string,
		timeframe: Timeframe,
		indicatorNames?: string[]
	): Promise<Feature[]> {
		// Get the most recent timestamp for this symbol
		const latest = await this.client.get<{ timestamp: string }>(
			`SELECT MAX(timestamp) as timestamp FROM features
       WHERE symbol = ? AND timeframe = ?`,
			[symbol, timeframe]
		);

		if (!latest?.timestamp) {
			return [];
		}

		let query = `SELECT * FROM features
                 WHERE symbol = ? AND timeframe = ? AND timestamp = ?`;
		const args: unknown[] = [symbol, timeframe, latest.timestamp];

		if (indicatorNames && indicatorNames.length > 0) {
			const placeholders = indicatorNames.map(() => "?").join(", ");
			query += ` AND indicator_name IN (${placeholders})`;
			args.push(...indicatorNames);
		}

		const rows = await this.client.execute<FeatureRow>(query, args);
		return rows.map(mapRowToFeature);
	}

	async listIndicators(symbol: string, timeframe: Timeframe): Promise<string[]> {
		const rows = await this.client.execute<{ indicator_name: string }>(
			`SELECT DISTINCT indicator_name FROM features
       WHERE symbol = ? AND timeframe = ?
       ORDER BY indicator_name`,
			[symbol, timeframe]
		);
		return rows.map((r) => r.indicator_name);
	}

	async deleteOlderThan(beforeDate: string): Promise<number> {
		const result = await this.client.run(`DELETE FROM features WHERE timestamp < ?`, [beforeDate]);
		return result.changes;
	}
}

interface FeatureRow {
	id: number;
	symbol: string;
	timestamp: string;
	timeframe: string;
	indicator_name: string;
	raw_value: number;
	normalized_value: number | null;
	parameters: string | null;
	quality_score: number | null;
	computed_at: string;
	[key: string]: unknown;
}

function mapRowToFeature(row: FeatureRow): Feature {
	return {
		id: row.id,
		symbol: row.symbol,
		timestamp: row.timestamp,
		timeframe: row.timeframe as Timeframe,
		indicatorName: row.indicator_name,
		rawValue: row.raw_value,
		normalizedValue: row.normalized_value,
		parameters: parseJson<Record<string, unknown> | null>(row.parameters, null),
		qualityScore: row.quality_score,
		computedAt: row.computed_at,
	};
}
