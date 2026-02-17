/**
 * Sentiment Repository (Drizzle ORM)
 *
 * Data access for sentiment_indicators table.
 * Stores aggregated sentiment data from news, social, and analyst sources.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, max } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { sentimentIndicators } from "../schema/indicators";
import type {
	CreateSentimentInput,
	PaginatedResult,
	PaginationOptions,
	SentimentFilters,
	SentimentIndicators,
	UpdateSentimentInput,
} from "./sentiment.types";
import {
	buildSentimentCountConditions,
	buildSentimentCreateValues,
	buildSentimentFilterConditions,
	buildSentimentUpdateData,
	buildSentimentUpsertSet,
	getDateRange,
	mapSentimentRow,
	resolvePagination,
} from "./sentiment.types";

export type {
	CreateSentimentInput,
	PaginatedResult,
	PaginationOptions,
	SentimentFilters,
	SentimentIndicators,
	UpdateSentimentInput,
} from "./sentiment.types";

export class SentimentRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const [row] = await this.db
			.insert(sentimentIndicators)
			.values(buildSentimentCreateValues(input))
			.returning();

		if (!row) {
			throw new Error("Failed to create sentiment indicators");
		}
		return mapSentimentRow(row);
	}

	async upsert(input: CreateSentimentInput): Promise<SentimentIndicators> {
		const [row] = await this.db
			.insert(sentimentIndicators)
			.values(buildSentimentCreateValues(input))
			.onConflictDoUpdate({
				target: [sentimentIndicators.symbol, sentimentIndicators.date],
				set: buildSentimentUpsertSet(input),
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
		const { start, end } = getDateRange(date);

		const [row] = await this.db
			.select()
			.from(sentimentIndicators)
			.where(
				and(
					eq(sentimentIndicators.symbol, symbol),
					gte(sentimentIndicators.date, start),
					lte(sentimentIndicators.date, end),
				),
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
		options?: { startDate?: string; endDate?: string },
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
		pagination?: PaginationOptions,
	): Promise<PaginatedResult<SentimentIndicators>> {
		const conditions = buildSentimentFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const { page, pageSize, offset } = resolvePagination(pagination);

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
			const { start, end } = getDateRange(date);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, start),
						lte(sentimentIndicators.date, end),
						isNotNull(sentimentIndicators.sentimentScore),
					),
				)
				.orderBy(desc(sentimentIndicators.sentimentScore))
				.limit(limit);

			return rows.map(mapSentimentRow);
		}

		const latestDates = this.db
			.select({
				symbol: sentimentIndicators.symbol,
				maxDate: max(sentimentIndicators.date).as("max_date"),
			})
			.from(sentimentIndicators)
			.groupBy(sentimentIndicators.symbol)
			.as("latest");

		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.innerJoin(
				latestDates,
				and(
					eq(sentimentIndicators.symbol, latestDates.symbol),
					eq(sentimentIndicators.date, latestDates.maxDate),
				),
			)
			.where(isNotNull(sentimentIndicators.sentimentScore))
			.orderBy(desc(sentimentIndicators.sentimentScore))
			.limit(limit);

		return rows.map((row) => mapSentimentRow(row.sentiment_indicators));
	}

	async findMostNegative(limit = 10, date?: string): Promise<SentimentIndicators[]> {
		if (date) {
			const { start, end } = getDateRange(date);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, start),
						lte(sentimentIndicators.date, end),
						isNotNull(sentimentIndicators.sentimentScore),
					),
				)
				.orderBy(sentimentIndicators.sentimentScore)
				.limit(limit);

			return rows.map(mapSentimentRow);
		}

		const latestDates = this.db
			.select({
				symbol: sentimentIndicators.symbol,
				maxDate: max(sentimentIndicators.date).as("max_date"),
			})
			.from(sentimentIndicators)
			.groupBy(sentimentIndicators.symbol)
			.as("latest");

		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.innerJoin(
				latestDates,
				and(
					eq(sentimentIndicators.symbol, latestDates.symbol),
					eq(sentimentIndicators.date, latestDates.maxDate),
				),
			)
			.where(isNotNull(sentimentIndicators.sentimentScore))
			.orderBy(asc(sentimentIndicators.sentimentScore))
			.limit(limit);

		return rows.map((row) => mapSentimentRow(row.sentiment_indicators));
	}

	async findWithEventRisk(date?: string): Promise<SentimentIndicators[]> {
		if (date) {
			const { start, end } = getDateRange(date);

			const rows = await this.db
				.select()
				.from(sentimentIndicators)
				.where(
					and(
						gte(sentimentIndicators.date, start),
						lte(sentimentIndicators.date, end),
						eq(sentimentIndicators.eventRiskFlag, true),
					),
				)
				.orderBy(desc(sentimentIndicators.sentimentScore));

			return rows.map(mapSentimentRow);
		}

		const latestDates = this.db
			.select({
				symbol: sentimentIndicators.symbol,
				maxDate: max(sentimentIndicators.date).as("max_date"),
			})
			.from(sentimentIndicators)
			.groupBy(sentimentIndicators.symbol)
			.as("latest");

		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.innerJoin(
				latestDates,
				and(
					eq(sentimentIndicators.symbol, latestDates.symbol),
					eq(sentimentIndicators.date, latestDates.maxDate),
				),
			)
			.where(eq(sentimentIndicators.eventRiskFlag, true))
			.orderBy(desc(sentimentIndicators.sentimentScore));

		return rows.map((row) => mapSentimentRow(row.sentiment_indicators));
	}

	async update(id: string, input: UpdateSentimentInput): Promise<SentimentIndicators | null> {
		const [row] = await this.db
			.update(sentimentIndicators)
			.set(buildSentimentUpdateData(input))
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
		const conditions = buildSentimentCountConditions(filters);
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

		const rows = await this.db
			.selectDistinctOn([sentimentIndicators.symbol])
			.from(sentimentIndicators)
			.where(inArray(sentimentIndicators.symbol, symbols))
			.orderBy(sentimentIndicators.symbol, desc(sentimentIndicators.date));

		return rows.map(mapSentimentRow);
	}

	async findByComputedAtRange(
		startTime: string,
		endTime: string,
		limit = 100,
	): Promise<SentimentIndicators[]> {
		const rows = await this.db
			.select()
			.from(sentimentIndicators)
			.where(
				and(
					gte(sentimentIndicators.computedAt, new Date(startTime)),
					lte(sentimentIndicators.computedAt, new Date(endTime)),
				),
			)
			.orderBy(sentimentIndicators.symbol)
			.limit(limit);

		return rows.map(mapSentimentRow);
	}
}
