/**
 * Short Interest Repository (Drizzle ORM)
 *
 * Data access for short_interest_indicators table.
 * Stores short interest data from FINRA.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, gte, inArray, isNotNull, lte, max } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { shortInterestIndicators } from "../schema/indicators";

// ============================================
// Types
// ============================================

export interface ShortInterestIndicators {
	id: string;
	symbol: string;
	settlementDate: string;

	shortInterest: number;
	shortInterestRatio: number | null;
	daysToCover: number | null;
	shortPctFloat: number | null;
	shortInterestChange: number | null;

	source: string;
	fetchedAt: string;
}

export interface CreateShortInterestInput {
	symbol: string;
	settlementDate: string;

	shortInterest: number;
	shortInterestRatio?: number | null;
	daysToCover?: number | null;
	shortPctFloat?: number | null;
	shortInterestChange?: number | null;

	source?: string;
}

export interface UpdateShortInterestInput {
	shortInterest?: number;
	shortInterestRatio?: number | null;
	daysToCover?: number | null;
	shortPctFloat?: number | null;
	shortInterestChange?: number | null;
}

export interface ShortInterestFilters {
	symbol?: string;
	settlementDate?: string;
	settlementDateGte?: string;
	settlementDateLte?: string;
	shortPctFloatGte?: number;
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

type ShortInterestRow = typeof shortInterestIndicators.$inferSelect;

function mapShortInterestRow(row: ShortInterestRow): ShortInterestIndicators {
	return {
		id: row.id,
		symbol: row.symbol,
		settlementDate: row.settlementDate.toISOString(),

		shortInterest: Number(row.shortInterest),
		shortInterestRatio: row.shortInterestRatio ? Number(row.shortInterestRatio) : null,
		daysToCover: row.daysToCover ? Number(row.daysToCover) : null,
		shortPctFloat: row.shortPctFloat ? Number(row.shortPctFloat) : null,
		shortInterestChange: row.shortInterestChange ? Number(row.shortInterestChange) : null,

		source: row.source,
		fetchedAt: row.fetchedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class ShortInterestRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateShortInterestInput): Promise<ShortInterestIndicators> {
		const [row] = await this.db
			.insert(shortInterestIndicators)
			.values({
				symbol: input.symbol,
				settlementDate: new Date(input.settlementDate),
				shortInterest: String(input.shortInterest),
				shortInterestRatio:
					input.shortInterestRatio != null ? String(input.shortInterestRatio) : null,
				daysToCover: input.daysToCover != null ? String(input.daysToCover) : null,
				shortPctFloat: input.shortPctFloat != null ? String(input.shortPctFloat) : null,
				shortInterestChange:
					input.shortInterestChange != null ? String(input.shortInterestChange) : null,
				source: input.source ?? "FINRA",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create short interest indicators");
		}
		return mapShortInterestRow(row);
	}

	async upsert(input: CreateShortInterestInput): Promise<ShortInterestIndicators> {
		const [row] = await this.db
			.insert(shortInterestIndicators)
			.values({
				symbol: input.symbol,
				settlementDate: new Date(input.settlementDate),
				shortInterest: String(input.shortInterest),
				shortInterestRatio:
					input.shortInterestRatio != null ? String(input.shortInterestRatio) : null,
				daysToCover: input.daysToCover != null ? String(input.daysToCover) : null,
				shortPctFloat: input.shortPctFloat != null ? String(input.shortPctFloat) : null,
				shortInterestChange:
					input.shortInterestChange != null ? String(input.shortInterestChange) : null,
				source: input.source ?? "FINRA",
			})
			.onConflictDoUpdate({
				target: [shortInterestIndicators.symbol, shortInterestIndicators.settlementDate],
				set: {
					shortInterest: String(input.shortInterest),
					shortInterestRatio:
						input.shortInterestRatio != null ? String(input.shortInterestRatio) : null,
					daysToCover: input.daysToCover != null ? String(input.daysToCover) : null,
					shortPctFloat: input.shortPctFloat != null ? String(input.shortPctFloat) : null,
					shortInterestChange:
						input.shortInterestChange != null ? String(input.shortInterestChange) : null,
					fetchedAt: new Date(),
				},
			})
			.returning();

		if (!row) {
			throw new Error("Failed to upsert short interest indicators");
		}
		return mapShortInterestRow(row);
	}

	async bulkUpsert(inputs: CreateShortInterestInput[]): Promise<number> {
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

	async findById(id: string): Promise<ShortInterestIndicators | null> {
		const [row] = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(eq(shortInterestIndicators.id, id))
			.limit(1);

		return row ? mapShortInterestRow(row) : null;
	}

	async findBySymbolAndDate(
		symbol: string,
		settlementDate: string
	): Promise<ShortInterestIndicators | null> {
		const dateStart = new Date(settlementDate);
		dateStart.setHours(0, 0, 0, 0);
		const dateEnd = new Date(settlementDate);
		dateEnd.setHours(23, 59, 59, 999);

		const [row] = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(
				and(
					eq(shortInterestIndicators.symbol, symbol),
					gte(shortInterestIndicators.settlementDate, dateStart),
					lte(shortInterestIndicators.settlementDate, dateEnd)
				)
			)
			.limit(1);

		return row ? mapShortInterestRow(row) : null;
	}

	async findLatestBySymbol(symbol: string): Promise<ShortInterestIndicators | null> {
		const [row] = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(eq(shortInterestIndicators.symbol, symbol))
			.orderBy(desc(shortInterestIndicators.settlementDate))
			.limit(1);

		return row ? mapShortInterestRow(row) : null;
	}

	async findBySymbol(
		symbol: string,
		options?: { startDate?: string; endDate?: string }
	): Promise<ShortInterestIndicators[]> {
		const conditions = [eq(shortInterestIndicators.symbol, symbol)];

		if (options?.startDate) {
			conditions.push(gte(shortInterestIndicators.settlementDate, new Date(options.startDate)));
		}

		if (options?.endDate) {
			conditions.push(lte(shortInterestIndicators.settlementDate, new Date(options.endDate)));
		}

		const rows = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(and(...conditions))
			.orderBy(desc(shortInterestIndicators.settlementDate));

		return rows.map(mapShortInterestRow);
	}

	async findWithFilters(
		filters: ShortInterestFilters,
		pagination?: PaginationOptions
	): Promise<PaginatedResult<ShortInterestIndicators>> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(shortInterestIndicators.symbol, filters.symbol));
		}

		if (filters.settlementDate) {
			const dateStart = new Date(filters.settlementDate);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(filters.settlementDate);
			dateEnd.setHours(23, 59, 59, 999);
			conditions.push(gte(shortInterestIndicators.settlementDate, dateStart));
			conditions.push(lte(shortInterestIndicators.settlementDate, dateEnd));
		}

		if (filters.settlementDateGte) {
			conditions.push(
				gte(shortInterestIndicators.settlementDate, new Date(filters.settlementDateGte))
			);
		}

		if (filters.settlementDateLte) {
			conditions.push(
				lte(shortInterestIndicators.settlementDate, new Date(filters.settlementDateLte))
			);
		}

		if (filters.shortPctFloatGte !== undefined) {
			conditions.push(gte(shortInterestIndicators.shortPctFloat, String(filters.shortPctFloatGte)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(shortInterestIndicators)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(whereClause)
			.orderBy(desc(shortInterestIndicators.settlementDate))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapShortInterestRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findHighestShortInterest(
		limit = 10,
		minShortPctFloat?: number
	): Promise<ShortInterestIndicators[]> {
		const latestDates = this.db
			.select({
				symbol: shortInterestIndicators.symbol,
				maxDate: max(shortInterestIndicators.settlementDate).as("max_date"),
			})
			.from(shortInterestIndicators)
			.groupBy(shortInterestIndicators.symbol)
			.as("latest");

		const conditions = [isNotNull(shortInterestIndicators.shortPctFloat)];

		if (minShortPctFloat !== undefined) {
			conditions.push(gte(shortInterestIndicators.shortPctFloat, String(minShortPctFloat)));
		}

		const rows = await this.db
			.select()
			.from(shortInterestIndicators)
			.innerJoin(
				latestDates,
				and(
					eq(shortInterestIndicators.symbol, latestDates.symbol),
					eq(shortInterestIndicators.settlementDate, latestDates.maxDate)
				)
			)
			.where(and(...conditions))
			.orderBy(desc(shortInterestIndicators.shortPctFloat))
			.limit(limit);

		return rows.map((row) => mapShortInterestRow(row.short_interest_indicators));
	}

	async update(
		id: string,
		input: UpdateShortInterestInput
	): Promise<ShortInterestIndicators | null> {
		const updates: Record<string, unknown> = {
			fetchedAt: new Date(),
		};

		if (input.shortInterest !== undefined) {
			updates.shortInterest = String(input.shortInterest);
		}

		if (input.shortInterestRatio !== undefined) {
			updates.shortInterestRatio =
				input.shortInterestRatio != null ? String(input.shortInterestRatio) : null;
		}

		if (input.daysToCover !== undefined) {
			updates.daysToCover = input.daysToCover != null ? String(input.daysToCover) : null;
		}

		if (input.shortPctFloat !== undefined) {
			updates.shortPctFloat = input.shortPctFloat != null ? String(input.shortPctFloat) : null;
		}

		if (input.shortInterestChange !== undefined) {
			updates.shortInterestChange =
				input.shortInterestChange != null ? String(input.shortInterestChange) : null;
		}

		const [row] = await this.db
			.update(shortInterestIndicators)
			.set(updates)
			.where(eq(shortInterestIndicators.id, id))
			.returning();

		return row ? mapShortInterestRow(row) : null;
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(shortInterestIndicators)
			.where(eq(shortInterestIndicators.id, id))
			.returning({ id: shortInterestIndicators.id });

		return result.length > 0;
	}

	async deleteOlderThan(date: string): Promise<number> {
		const result = await this.db
			.delete(shortInterestIndicators)
			.where(lte(shortInterestIndicators.settlementDate, new Date(date)))
			.returning({ id: shortInterestIndicators.id });

		return result.length;
	}

	async count(filters?: ShortInterestFilters): Promise<number> {
		const conditions = [];

		if (filters?.symbol) {
			conditions.push(eq(shortInterestIndicators.symbol, filters.symbol));
		}

		if (filters?.settlementDate) {
			const dateStart = new Date(filters.settlementDate);
			dateStart.setHours(0, 0, 0, 0);
			const dateEnd = new Date(filters.settlementDate);
			dateEnd.setHours(23, 59, 59, 999);
			conditions.push(gte(shortInterestIndicators.settlementDate, dateStart));
			conditions.push(lte(shortInterestIndicators.settlementDate, dateEnd));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [result] = await this.db
			.select({ count: count() })
			.from(shortInterestIndicators)
			.where(whereClause);

		return result?.count ?? 0;
	}

	async findLatestForSymbols(symbols: string[]): Promise<ShortInterestIndicators[]> {
		if (symbols.length === 0) {
			return [];
		}

		const rows = await this.db
			.selectDistinctOn([shortInterestIndicators.symbol])
			.from(shortInterestIndicators)
			.where(inArray(shortInterestIndicators.symbol, symbols))
			.orderBy(shortInterestIndicators.symbol, desc(shortInterestIndicators.settlementDate));

		return rows.map(mapShortInterestRow);
	}

	async findByFetchedAtRange(
		startTime: string,
		endTime: string,
		limit = 100
	): Promise<ShortInterestIndicators[]> {
		const rows = await this.db
			.select()
			.from(shortInterestIndicators)
			.where(
				and(
					gte(shortInterestIndicators.fetchedAt, new Date(startTime)),
					lte(shortInterestIndicators.fetchedAt, new Date(endTime))
				)
			)
			.orderBy(shortInterestIndicators.symbol)
			.limit(limit);

		return rows.map(mapShortInterestRow);
	}
}
