/**
 * Sentiment Repository (Drizzle ORM)
 *
 * Data access for sentiment_indicators table.
 * Stores aggregated sentiment data from news, social, and analyst sources.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { sentimentIndicators } from "../schema/indicators";

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

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

// ============================================
// Row Mapping
// ============================================

type SentimentRow = typeof sentimentIndicators.$inferSelect;

function mapSentimentRow(row: SentimentRow): SentimentIndicators {
	return {
		id: row.id,
		symbol: row.symbol,
		date: row.date.toISOString(),

		sentimentScore: row.sentimentScore ? Number(row.sentimentScore) : null,
		sentimentStrength: row.sentimentStrength ? Number(row.sentimentStrength) : null,
		newsVolume: row.newsVolume,
		sentimentMomentum: row.sentimentMomentum ? Number(row.sentimentMomentum) : null,
		eventRiskFlag: row.eventRiskFlag ?? false,

		newsSentiment: row.newsSentiment ? Number(row.newsSentiment) : null,
		socialSentiment: row.socialSentiment ? Number(row.socialSentiment) : null,
		analystSentiment: row.analystSentiment ? Number(row.analystSentiment) : null,

		computedAt: row.computedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class SentimentRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const [row] = await this.db
			.insert(sentimentIndicators)
			.values({
				symbol: input.symbol,
				date: new Date(input.date),
				sentimentScore: input.sentimentScore != null ? String(input.sentimentScore) : null,
				sentimentStrength: input.sentimentStrength != null ? String(input.sentimentStrength) : null,
				newsVolume: input.newsVolume ?? null,
				sentimentMomentum: input.sentimentMomentum != null ? String(input.sentimentMomentum) : null,
				eventRiskFlag: input.eventRiskFlag ?? false,
				newsSentiment: input.newsSentiment != null ? String(input.newsSentiment) : null,
				socialSentiment: input.socialSentiment != null ? String(input.socialSentiment) : null,
				analystSentiment: input.analystSentiment != null ? String(input.analystSentiment) : null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create sentiment indicators");
		}
		return mapSentimentRow(row);
	}

	async upsert(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const [row] = await this.db
			.insert(sentimentIndicators)
			.values({
				symbol: input.symbol,
				date: new Date(input.date),
				sentimentScore: input.sentimentScore != null ? String(input.sentimentScore) : null,
				sentimentStrength: input.sentimentStrength != null ? String(input.sentimentStrength) : null,
				newsVolume: input.newsVolume ?? null,
				sentimentMomentum: input.sentimentMomentum != null ? String(input.sentimentMomentum) : null,
				eventRiskFlag: input.eventRiskFlag ?? false,
				newsSentiment: input.newsSentiment != null ? String(input.newsSentiment) : null,
				socialSentiment: input.socialSentiment != null ? String(input.socialSentiment) : null,
				analystSentiment: input.analystSentiment != null ? String(input.analystSentiment) : null,
			})
			.onConflictDoUpdate({
				target: [sentimentIndicators.symbol, sentimentIndicators.date],
				set: {
					sentimentScore: input.sentimentScore != null ? String(input.sentimentScore) : null,
					sentimentStrength:
						input.sentimentStrength != null ? String(input.sentimentStrength) : null,
					newsVolume: input.newsVolume ?? null,
					sentimentMomentum:
						input.sentimentMomentum != null ? String(input.sentimentMomentum) : null,
					eventRiskFlag: input.eventRiskFlag ?? false,
					newsSentiment: input.newsSentiment != null ? String(input.newsSentiment) : null,
					socialSentiment: input.socialSentiment != null ? String(input.socialSentiment) : null,
					analystSentiment: input.analystSentiment != null ? String(input.analystSentiment) : null,
					computedAt: new Date(),
				},
			})
			.returning();

		if (!row) {
			throw new Error("Failed to upsert sentiment indicators");
		}
		return mapSentimentRow(row);
	}

	async bulkUpsert(inputs: CreateSentimentInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		let count = 0;
		for (const input of inputs) {
			await this.upsert(input);
			count++;
		}

		return count;
	}

	async findById(id: string): Promise<SentimentIndicators | null> {
		const [row] = await this.db
			.select()
			.from(sentimentIndicators)
			.where(eq(sentimentIndicators.id, id))
			.limit(1);

		return row ? mapSentimentRow(row) : null;
	}

	async findBySymbolAndDate(symbol: string, date: string): Promise<SentimentIndicators | null> {
		const dateStart = new Date(date);
		dateStart.setHours(0, 0, 0, 0);
		const dateEnd = new Date(date);
		dateEnd.setHours(23, 59, 59, 999);

		const [row] = await this.db
			.select()
			.from(sentimentIndicators)
			.where(
				and(
					eq(sentimentIndicators.symbol, symbol),
					gte(sentimentIndicators.date, dateStart),
					lte(sentimentIndicators.date, dateEnd)
				)
			)
			.limit(1);

		return row ? mapSentimentRow(row) : null;
	}

	async findLatestBySymbol(symbol: string): Promise<SentimentIndicators | null> {
		const [row] = await this.db
			.select()
			.from(sentimentIndicators)
			.where(eq(sentimentIndicators.symbol, symbol))
			.orderBy(desc(sentimentIndicators.date))
			.limit(1);

		return row ? mapSentimentRow(row) : null;
	}

	async findBySymbol(
		symbol: string,
		options?: { startDate?: string; endDate?: string }
	): Promise<SentimentIndicators[]> {
		const conditions = [eq(sentimentIndicators.symbol, symbol)];

		if (options?.startDate) {
			conditions.push(gte(sentimentIndicators.date, new Date(options.startDate)));
		}

		if (options?.endDate) {
			conditions.push(lte(sentimentIndicators.date, new Date(options.endDate)));
		}

		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.where(and(...conditions))
			.orderBy(desc(sentimentIndicators.date));

		return rows.map(mapSentimentRow);
	}

	async findWithFilters(
		filters: SentimentFilters,
		pagination?: PaginationOptions
	): Promise<PaginatedResult<SentimentIndicators>> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(sentimentIndicators.symbol, filters.symbol));
		}

		if (filters.date) {
			const dateStart = new Date(filters.date);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(filters.date);
			dateEnd.setHours(23, 59, 59, 999);
			conditions.push(gte(sentimentIndicators.date, dateStart));
			conditions.push(lte(sentimentIndicators.date, dateEnd));
		}

		if (filters.dateGte) {
			conditions.push(gte(sentimentIndicators.date, new Date(filters.dateGte)));
		}

		if (filters.dateLte) {
			conditions.push(lte(sentimentIndicators.date, new Date(filters.dateLte)));
		}

		if (filters.sentimentScoreGte !== undefined) {
			conditions.push(gte(sentimentIndicators.sentimentScore, String(filters.sentimentScoreGte)));
		}

		if (filters.sentimentScoreLte !== undefined) {
			conditions.push(lte(sentimentIndicators.sentimentScore, String(filters.sentimentScoreLte)));
		}

		if (filters.eventRiskFlag !== undefined) {
			conditions.push(eq(sentimentIndicators.eventRiskFlag, filters.eventRiskFlag));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(sentimentIndicators)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.where(whereClause)
			.orderBy(desc(sentimentIndicators.date))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapSentimentRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findMostPositive(limit = 10, date?: string): Promise<SentimentIndicators[]> {
		if (date) {
			const dateStart = new Date(date);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(date);
			dateEnd.setHours(23, 59, 59, 999);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, dateStart),
						lte(sentimentIndicators.date, dateEnd),
						isNotNull(sentimentIndicators.sentimentScore)
					)
				)
				.orderBy(desc(sentimentIndicators.sentimentScore))
				.limit(limit);

			return rows.map(mapSentimentRow);
		}

		const rows = await this.db.execute(sql`
			SELECT s1.*
			FROM ${sentimentIndicators} s1
			INNER JOIN (
				SELECT symbol, MAX(date) as max_date
				FROM ${sentimentIndicators}
				GROUP BY symbol
			) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
			WHERE s1.sentiment_score IS NOT NULL
			ORDER BY s1.sentiment_score DESC
			LIMIT ${limit}
		`);

		return (rows.rows as SentimentRow[]).map(mapSentimentRow);
	}

	async findMostNegative(limit = 10, date?: string): Promise<SentimentIndicators[]> {
		if (date) {
			const dateStart = new Date(date);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(date);
			dateEnd.setHours(23, 59, 59, 999);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, dateStart),
						lte(sentimentIndicators.date, dateEnd),
						isNotNull(sentimentIndicators.sentimentScore)
					)
				)
				.orderBy(sentimentIndicators.sentimentScore)
				.limit(limit);

			return rows.map(mapSentimentRow);
		}

		const rows = await this.db.execute(sql`
			SELECT s1.*
			FROM ${sentimentIndicators} s1
			INNER JOIN (
				SELECT symbol, MAX(date) as max_date
				FROM ${sentimentIndicators}
				GROUP BY symbol
			) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
			WHERE s1.sentiment_score IS NOT NULL
			ORDER BY s1.sentiment_score ASC
			LIMIT ${limit}
		`);

		return (rows.rows as SentimentRow[]).map(mapSentimentRow);
	}

	async findWithEventRisk(date?: string): Promise<SentimentIndicators[]> {
		if (date) {
			const dateStart = new Date(date);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(date);
			dateEnd.setHours(23, 59, 59, 999);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, dateStart),
						lte(sentimentIndicators.date, dateEnd),
						eq(sentimentIndicators.eventRiskFlag, true)
					)
				)
				.orderBy(desc(sentimentIndicators.sentimentScore));

			return rows.map(mapSentimentRow);
		}

		const rows = await this.db.execute(sql`
			SELECT s1.*
			FROM ${sentimentIndicators} s1
			INNER JOIN (
				SELECT symbol, MAX(date) as max_date
				FROM ${sentimentIndicators}
				GROUP BY symbol
			) s2 ON s1.symbol = s2.symbol AND s1.date = s2.max_date
			WHERE s1.event_risk_flag = true
			ORDER BY s1.sentiment_score DESC
		`);

		return (rows.rows as SentimentRow[]).map(mapSentimentRow);
	}

	async update(id: string, input: UpdateSentimentInput): Promise<SentimentIndicators | null> {
		const updates: Record<string, unknown> = {
			computedAt: new Date(),
		};

		if (input.sentimentScore !== undefined) {
			updates.sentimentScore = input.sentimentScore != null ? String(input.sentimentScore) : null;
		}

		if (input.sentimentStrength !== undefined) {
			updates.sentimentStrength =
				input.sentimentStrength != null ? String(input.sentimentStrength) : null;
		}

		if (input.newsVolume !== undefined) {
			updates.newsVolume = input.newsVolume;
		}

		if (input.sentimentMomentum !== undefined) {
			updates.sentimentMomentum =
				input.sentimentMomentum != null ? String(input.sentimentMomentum) : null;
		}

		if (input.eventRiskFlag !== undefined) {
			updates.eventRiskFlag = input.eventRiskFlag;
		}

		if (input.newsSentiment !== undefined) {
			updates.newsSentiment = input.newsSentiment != null ? String(input.newsSentiment) : null;
		}

		if (input.socialSentiment !== undefined) {
			updates.socialSentiment =
				input.socialSentiment != null ? String(input.socialSentiment) : null;
		}

		if (input.analystSentiment !== undefined) {
			updates.analystSentiment =
				input.analystSentiment != null ? String(input.analystSentiment) : null;
		}

		const [row] = await this.db
			.update(sentimentIndicators)
			.set(updates)
			.where(eq(sentimentIndicators.id, id))
			.returning();

		return row ? mapSentimentRow(row) : null;
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(sentimentIndicators)
			.where(eq(sentimentIndicators.id, id))
			.returning({ id: sentimentIndicators.id });

		return result.length > 0;
	}

	async deleteOlderThan(date: string): Promise<number> {
		const result = await this.db
			.delete(sentimentIndicators)
			.where(lte(sentimentIndicators.date, new Date(date)))
			.returning({ id: sentimentIndicators.id });

		return result.length;
	}

	async count(filters?: SentimentFilters): Promise<number> {
		const conditions = [];

		if (filters?.symbol) {
			conditions.push(eq(sentimentIndicators.symbol, filters.symbol));
		}

		if (filters?.date) {
			const dateStart = new Date(filters.date);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(filters.date);
			dateEnd.setHours(23, 59, 59, 999);
			conditions.push(gte(sentimentIndicators.date, dateStart));
			conditions.push(lte(sentimentIndicators.date, dateEnd));
		}

		if (filters?.eventRiskFlag !== undefined) {
			conditions.push(eq(sentimentIndicators.eventRiskFlag, filters.eventRiskFlag));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [result] = await this.db
			.select({ count: count() })
			.from(sentimentIndicators)
			.where(whereClause);

		return result?.count ?? 0;
	}

	async findLatestForSymbols(symbols: string[]): Promise<SentimentIndicators[]> {
		if (symbols.length === 0) {
			return [];
		}

		const rows = await this.db.execute(sql`
			SELECT DISTINCT ON (symbol) *
			FROM ${sentimentIndicators}
			WHERE symbol = ANY(${symbols})
			ORDER BY symbol, date DESC
		`);

		return (rows.rows as SentimentRow[]).map(mapSentimentRow);
	}

	async findByComputedAtRange(
		startTime: string,
		endTime: string,
		limit = 100
	): Promise<SentimentIndicators[]> {
		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.where(
				and(
					gte(sentimentIndicators.computedAt, new Date(startTime)),
					lte(sentimentIndicators.computedAt, new Date(endTime))
				)
			)
			.orderBy(sentimentIndicators.symbol)
			.limit(limit);

		return rows.map(mapSentimentRow);
	}
}
