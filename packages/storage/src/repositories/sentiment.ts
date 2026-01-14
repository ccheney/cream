/**
 * Sentiment Repository
 *
 * CRUD operations for the sentiment_indicators table.
 * Stores aggregated sentiment data from news, social, and analyst sources.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 * @see migrations/008_indicator_engine_v2.sql
 */

import type { Row, TursoClient } from "../turso.js";
import { type PaginatedResult, type PaginationOptions, paginate, RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

export interface SentimentIndicators {
	id: string;
	symbol: string;
	date: string;

	sentimentScore: number | null;
	sentimentStrength: number | null;
	newsVolume: number | null;
	sentimentMomentum: number | null;
	eventRiskFlag: boolean;

	newsSentiment: number | null;
	socialSentiment: number | null;
	analystSentiment: number | null;

	computedAt: string;
}

export interface CreateSentimentInput {
	id: string;
	symbol: string;
	date: string;

	sentimentScore?: number | null;
	sentimentStrength?: number | null;
	newsVolume?: number | null;
	sentimentMomentum?: number | null;
	eventRiskFlag?: boolean;

	newsSentiment?: number | null;
	socialSentiment?: number | null;
	analystSentiment?: number | null;
}

export interface UpdateSentimentInput {
	sentimentScore?: number | null;
	sentimentStrength?: number | null;
	newsVolume?: number | null;
	sentimentMomentum?: number | null;
	eventRiskFlag?: boolean;

	newsSentiment?: number | null;
	socialSentiment?: number | null;
	analystSentiment?: number | null;
}

export interface SentimentFilters {
	symbol?: string;
	date?: string;
	dateGte?: string;
	dateLte?: string;
	sentimentScoreGte?: number;
	sentimentScoreLte?: number;
	eventRiskFlag?: boolean;
}

// ============================================
// Mappers
// ============================================

function mapRow(row: Row): SentimentIndicators {
	return {
		id: row.id as string,
		symbol: row.symbol as string,
		date: row.date as string,

		sentimentScore: row.sentiment_score as number | null,
		sentimentStrength: row.sentiment_strength as number | null,
		newsVolume: row.news_volume as number | null,
		sentimentMomentum: row.sentiment_momentum as number | null,
		eventRiskFlag: Boolean(row.event_risk_flag),

		newsSentiment: row.news_sentiment as number | null,
		socialSentiment: row.social_sentiment as number | null,
		analystSentiment: row.analyst_sentiment as number | null,

		computedAt: row.computed_at as string,
	};
}

// ============================================
// Repository
// ============================================

export class SentimentRepository {
	constructor(private client: TursoClient) {}

	/**
	 * Create a new sentiment record
	 */
	async create(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const now = new Date().toISOString();

		await this.client.run(
			`INSERT INTO sentiment_indicators (
        id, symbol, date,
        sentiment_score, sentiment_strength, news_volume,
        sentiment_momentum, event_risk_flag,
        news_sentiment, social_sentiment, analyst_sentiment,
        computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				input.id,
				input.symbol,
				input.date,
				input.sentimentScore ?? null,
				input.sentimentStrength ?? null,
				input.newsVolume ?? null,
				input.sentimentMomentum ?? null,
				input.eventRiskFlag ? 1 : 0,
				input.newsSentiment ?? null,
				input.socialSentiment ?? null,
				input.analystSentiment ?? null,
				now,
			]
		);

		const created = await this.findById(input.id);
		if (!created) {
			throw new RepositoryError("Failed to retrieve created record", "QUERY_ERROR");
		}
		return created;
	}

	/**
	 * Upsert a sentiment record (insert or update on conflict)
	 */
	async upsert(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const now = new Date().toISOString();

		await this.client.run(
			`INSERT INTO sentiment_indicators (
        id, symbol, date,
        sentiment_score, sentiment_strength, news_volume,
        sentiment_momentum, event_risk_flag,
        news_sentiment, social_sentiment, analyst_sentiment,
        computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, date) DO UPDATE SET
        sentiment_score = excluded.sentiment_score,
        sentiment_strength = excluded.sentiment_strength,
        news_volume = excluded.news_volume,
        sentiment_momentum = excluded.sentiment_momentum,
        event_risk_flag = excluded.event_risk_flag,
        news_sentiment = excluded.news_sentiment,
        social_sentiment = excluded.social_sentiment,
        analyst_sentiment = excluded.analyst_sentiment,
        computed_at = excluded.computed_at`,
			[
				input.id,
				input.symbol,
				input.date,
				input.sentimentScore ?? null,
				input.sentimentStrength ?? null,
				input.newsVolume ?? null,
				input.sentimentMomentum ?? null,
				input.eventRiskFlag ? 1 : 0,
				input.newsSentiment ?? null,
				input.socialSentiment ?? null,
				input.analystSentiment ?? null,
				now,
			]
		);

		const result = await this.findBySymbolAndDate(input.symbol, input.date);
		if (!result) {
			throw new RepositoryError("Failed to retrieve upserted record", "QUERY_ERROR");
		}
		return result;
	}

	/**
	 * Bulk upsert multiple records
	 */
	async bulkUpsert(inputs: CreateSentimentInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		const now = new Date().toISOString();
		let count = 0;

		for (const input of inputs) {
			await this.client.run(
				`INSERT INTO sentiment_indicators (
          id, symbol, date,
          sentiment_score, sentiment_strength, news_volume,
          sentiment_momentum, event_risk_flag,
          news_sentiment, social_sentiment, analyst_sentiment,
          computed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, date) DO UPDATE SET
          sentiment_score = excluded.sentiment_score,
          sentiment_strength = excluded.sentiment_strength,
          news_volume = excluded.news_volume,
          sentiment_momentum = excluded.sentiment_momentum,
          event_risk_flag = excluded.event_risk_flag,
          news_sentiment = excluded.news_sentiment,
          social_sentiment = excluded.social_sentiment,
          analyst_sentiment = excluded.analyst_sentiment,
          computed_at = excluded.computed_at`,
				[
					input.id,
					input.symbol,
					input.date,
					input.sentimentScore ?? null,
					input.sentimentStrength ?? null,
					input.newsVolume ?? null,
					input.sentimentMomentum ?? null,
					input.eventRiskFlag ? 1 : 0,
					input.newsSentiment ?? null,
					input.socialSentiment ?? null,
					input.analystSentiment ?? null,
					now,
				]
			);
			count++;
		}

		return count;
	}

	/**
	 * Find by ID
	 */
	async findById(id: string): Promise<SentimentIndicators | null> {
		const row = await this.client.get<Row>("SELECT * FROM sentiment_indicators WHERE id = ?", [id]);

		if (!row) {
			return null;
		}
		return mapRow(row);
	}

	/**
	 * Find by symbol and date
	 */
	async findBySymbolAndDate(symbol: string, date: string): Promise<SentimentIndicators | null> {
		const row = await this.client.get<Row>(
			"SELECT * FROM sentiment_indicators WHERE symbol = ? AND date = ?",
			[symbol, date]
		);

		if (!row) {
			return null;
		}
		return mapRow(row);
	}

	/**
	 * Find latest by symbol
	 */
	async findLatestBySymbol(symbol: string): Promise<SentimentIndicators | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM sentiment_indicators
       WHERE symbol = ?
       ORDER BY date DESC
       LIMIT 1`,
			[symbol]
		);

		if (!row) {
			return null;
		}
		return mapRow(row);
	}

	/**
	 * Find all by symbol with optional date range
	 */
	async findBySymbol(
		symbol: string,
		options?: { startDate?: string; endDate?: string }
	): Promise<SentimentIndicators[]> {
		let sql = "SELECT * FROM sentiment_indicators WHERE symbol = ?";
		const args: unknown[] = [symbol];

		if (options?.startDate) {
			sql += " AND date >= ?";
			args.push(options.startDate);
		}

		if (options?.endDate) {
			sql += " AND date <= ?";
			args.push(options.endDate);
		}

		sql += " ORDER BY date DESC";

		const rows = await this.client.execute<Row>(sql, args);
		return rows.map(mapRow);
	}

	/**
	 * Find with filters and pagination
	 */
	async findWithFilters(
		filters: SentimentFilters,
		pagination?: PaginationOptions
	): Promise<PaginatedResult<SentimentIndicators>> {
		let sql = "SELECT * FROM sentiment_indicators WHERE 1=1";
		const args: unknown[] = [];

		if (filters.symbol) {
			sql += " AND symbol = ?";
			args.push(filters.symbol);
		}

		if (filters.date) {
			sql += " AND date = ?";
			args.push(filters.date);
		}

		if (filters.dateGte) {
			sql += " AND date >= ?";
			args.push(filters.dateGte);
		}

		if (filters.dateLte) {
			sql += " AND date <= ?";
			args.push(filters.dateLte);
		}

		if (filters.sentimentScoreGte !== undefined) {
			sql += " AND sentiment_score >= ?";
			args.push(filters.sentimentScoreGte);
		}

		if (filters.sentimentScoreLte !== undefined) {
			sql += " AND sentiment_score <= ?";
			args.push(filters.sentimentScoreLte);
		}

		if (filters.eventRiskFlag !== undefined) {
			sql += " AND event_risk_flag = ?";
			args.push(filters.eventRiskFlag ? 1 : 0);
		}

		sql += " ORDER BY date DESC";

		const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");

		const result = await paginate<Row>(this.client, sql, countSql, args, pagination);

		return {
			...result,
			data: result.data.map(mapRow),
		};
	}

	/**
	 * Find most positive sentiment stocks
	 */
	async findMostPositive(limit = 10, date?: string): Promise<SentimentIndicators[]> {
		let sql: string;
		const args: unknown[] = [];

		if (date) {
			sql = `SELECT * FROM sentiment_indicators
             WHERE date = ? AND sentiment_score IS NOT NULL
             ORDER BY sentiment_score DESC
             LIMIT ?`;
			args.push(date, limit);
		} else {
			// Get latest for each symbol
			sql = `SELECT s1.*
             FROM sentiment_indicators s1
             INNER JOIN (
               SELECT symbol, MAX(date) as max_date
               FROM sentiment_indicators
               GROUP BY symbol
             ) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
             WHERE s1.sentiment_score IS NOT NULL
             ORDER BY s1.sentiment_score DESC
             LIMIT ?`;
			args.push(limit);
		}

		const rows = await this.client.execute<Row>(sql, args);
		return rows.map(mapRow);
	}

	/**
	 * Find most negative sentiment stocks
	 */
	async findMostNegative(limit = 10, date?: string): Promise<SentimentIndicators[]> {
		let sql: string;
		const args: unknown[] = [];

		if (date) {
			sql = `SELECT * FROM sentiment_indicators
             WHERE date = ? AND sentiment_score IS NOT NULL
             ORDER BY sentiment_score ASC
             LIMIT ?`;
			args.push(date, limit);
		} else {
			sql = `SELECT s1.*
             FROM sentiment_indicators s1
             INNER JOIN (
               SELECT symbol, MAX(date) as max_date
               FROM sentiment_indicators
               GROUP BY symbol
             ) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
             WHERE s1.sentiment_score IS NOT NULL
             ORDER BY s1.sentiment_score ASC
             LIMIT ?`;
			args.push(limit);
		}

		const rows = await this.client.execute<Row>(sql, args);
		return rows.map(mapRow);
	}

	/**
	 * Find stocks with event risk flags
	 */
	async findWithEventRisk(date?: string): Promise<SentimentIndicators[]> {
		let sql: string;
		const args: unknown[] = [];

		if (date) {
			sql = `SELECT * FROM sentiment_indicators
             WHERE date = ? AND event_risk_flag = 1
             ORDER BY sentiment_score DESC`;
			args.push(date);
		} else {
			sql = `SELECT s1.*
             FROM sentiment_indicators s1
             INNER JOIN (
               SELECT symbol, MAX(date) as max_date
               FROM sentiment_indicators
               GROUP BY symbol
             ) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
             WHERE s1.event_risk_flag = 1
             ORDER BY s1.sentiment_score DESC`;
		}

		const rows = await this.client.execute<Row>(sql, args);
		return rows.map(mapRow);
	}

	/**
	 * Update a record
	 */
	async update(id: string, input: UpdateSentimentInput): Promise<SentimentIndicators | null> {
		const updates: string[] = [];
		const args: unknown[] = [];

		if (input.sentimentScore !== undefined) {
			updates.push("sentiment_score = ?");
			args.push(input.sentimentScore);
		}

		if (input.sentimentStrength !== undefined) {
			updates.push("sentiment_strength = ?");
			args.push(input.sentimentStrength);
		}

		if (input.newsVolume !== undefined) {
			updates.push("news_volume = ?");
			args.push(input.newsVolume);
		}

		if (input.sentimentMomentum !== undefined) {
			updates.push("sentiment_momentum = ?");
			args.push(input.sentimentMomentum);
		}

		if (input.eventRiskFlag !== undefined) {
			updates.push("event_risk_flag = ?");
			args.push(input.eventRiskFlag ? 1 : 0);
		}

		if (input.newsSentiment !== undefined) {
			updates.push("news_sentiment = ?");
			args.push(input.newsSentiment);
		}

		if (input.socialSentiment !== undefined) {
			updates.push("social_sentiment = ?");
			args.push(input.socialSentiment);
		}

		if (input.analystSentiment !== undefined) {
			updates.push("analyst_sentiment = ?");
			args.push(input.analystSentiment);
		}

		if (updates.length === 0) {
			return this.findById(id);
		}

		updates.push("computed_at = ?");
		args.push(new Date().toISOString());
		args.push(id);

		await this.client.run(
			`UPDATE sentiment_indicators SET ${updates.join(", ")} WHERE id = ?`,
			args
		);

		return this.findById(id);
	}

	/**
	 * Delete a record
	 */
	async delete(id: string): Promise<boolean> {
		const result = await this.client.run("DELETE FROM sentiment_indicators WHERE id = ?", [id]);

		return result.changes > 0;
	}

	/**
	 * Delete old records
	 */
	async deleteOlderThan(date: string): Promise<number> {
		const result = await this.client.run("DELETE FROM sentiment_indicators WHERE date < ?", [date]);

		return result.changes;
	}

	/**
	 * Count all records
	 */
	async count(filters?: SentimentFilters): Promise<number> {
		let sql = "SELECT COUNT(*) as count FROM sentiment_indicators WHERE 1=1";
		const args: unknown[] = [];

		if (filters?.symbol) {
			sql += " AND symbol = ?";
			args.push(filters.symbol);
		}

		if (filters?.date) {
			sql += " AND date = ?";
			args.push(filters.date);
		}

		if (filters?.eventRiskFlag !== undefined) {
			sql += " AND event_risk_flag = ?";
			args.push(filters.eventRiskFlag ? 1 : 0);
		}

		const row = await this.client.get<{ count: number }>(sql, args);
		return row?.count ?? 0;
	}
}
