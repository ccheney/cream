/**
 * Fundamentals Repository (Drizzle ORM)
 *
 * CRUD operations for the fundamental_indicators table.
 * Stores fundamental data (P/E, P/B, ROE, ROA, etc.).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { fundamentalIndicators } from "../schema/indicators";
import { RepositoryError } from "./base";
import type {
	CreateFundamentalIndicatorsInput,
	FundamentalFilters,
	FundamentalIndicators,
	PaginatedResult,
	PaginationOptions,
	UpdateFundamentalIndicatorsInput,
} from "./fundamentals.types";
import {
	buildFundamentalCreateValues,
	buildFundamentalFilterConditions,
	buildFundamentalUpdateData,
	buildFundamentalUpsertSet,
	buildFundamentalUpsertValues,
	buildSymbolDateConditions,
	mapFundamentalRow,
} from "./fundamentals.types";

export type {
	CreateFundamentalIndicatorsInput,
	FundamentalFilters,
	FundamentalIndicators,
	PaginatedResult,
	PaginationOptions,
	UpdateFundamentalIndicatorsInput,
} from "./fundamentals.types";

export class FundamentalsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
		const [row] = await this.db
			.insert(fundamentalIndicators)
			.values(buildFundamentalCreateValues(input))
			.returning();

		if (!row) {
			throw new Error("Failed to create fundamental indicators");
		}
		return mapFundamentalRow(row);
	}

	async upsert(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
		const values = buildFundamentalUpsertValues(input);

		const [row] = await this.db
			.insert(fundamentalIndicators)
			.values(values)
			.onConflictDoUpdate({
				target: [fundamentalIndicators.symbol, fundamentalIndicators.date],
				set: buildFundamentalUpsertSet(values),
			})
			.returning();

		if (!row) {
			throw new Error("Failed to upsert fundamental indicators");
		}
		return mapFundamentalRow(row);
	}

	async bulkUpsert(inputs: CreateFundamentalIndicatorsInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		let upserted = 0;
		for (const input of inputs) {
			await this.upsert(input);
			upserted++;
		}

		return upserted;
	}

	async findById(id: string): Promise<FundamentalIndicators | null> {
		const [row] = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(eq(fundamentalIndicators.id, id))
			.limit(1);

		return row ? mapFundamentalRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<FundamentalIndicators> {
		const result = await this.findById(id);
		if (!result) {
			throw RepositoryError.notFound("fundamental_indicators", id);
		}
		return result;
	}

	async findBySymbolAndDate(symbol: string, date: string): Promise<FundamentalIndicators | null> {
		const [row] = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(
				and(
					eq(fundamentalIndicators.symbol, symbol),
					eq(fundamentalIndicators.date, new Date(date)),
				),
			)
			.limit(1);

		return row ? mapFundamentalRow(row) : null;
	}

	async findLatestBySymbol(symbol: string): Promise<FundamentalIndicators | null> {
		const [row] = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(eq(fundamentalIndicators.symbol, symbol))
			.orderBy(desc(fundamentalIndicators.date))
			.limit(1);

		return row ? mapFundamentalRow(row) : null;
	}

	async findLatestBySymbols(symbols: string[]): Promise<FundamentalIndicators[]> {
		if (symbols.length === 0) {
			return [];
		}

		const rows = await this.db
			.selectDistinctOn([fundamentalIndicators.symbol])
			.from(fundamentalIndicators)
			.where(inArray(fundamentalIndicators.symbol, symbols))
			.orderBy(fundamentalIndicators.symbol, desc(fundamentalIndicators.date));

		return rows.map(mapFundamentalRow);
	}

	async findBySymbol(
		symbol: string,
		filters?: { startDate?: string; endDate?: string },
	): Promise<FundamentalIndicators[]> {
		const rows = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(buildSymbolDateConditions(symbol, filters?.startDate, filters?.endDate))
			.orderBy(desc(fundamentalIndicators.date));

		return rows.map(mapFundamentalRow);
	}

	async findMany(
		filters?: FundamentalFilters,
		pagination?: PaginationOptions,
	): Promise<PaginatedResult<FundamentalIndicators>> {
		const conditions = buildFundamentalFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(fundamentalIndicators)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(whereClause)
			.orderBy(desc(fundamentalIndicators.date), fundamentalIndicators.symbol)
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapFundamentalRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findBySector(sector: string, date?: string): Promise<FundamentalIndicators[]> {
		if (date) {
			const rows = await this.db
				.select()
				.from(fundamentalIndicators)
				.where(
					and(
						eq(fundamentalIndicators.sector, sector),
						eq(fundamentalIndicators.date, new Date(date)),
					),
				)
				.orderBy(fundamentalIndicators.symbol);

			return rows.map(mapFundamentalRow);
		}

		const rows = await this.db
			.selectDistinctOn([fundamentalIndicators.symbol])
			.from(fundamentalIndicators)
			.where(eq(fundamentalIndicators.sector, sector))
			.orderBy(fundamentalIndicators.symbol, desc(fundamentalIndicators.date));

		return rows.map(mapFundamentalRow);
	}

	async update(
		id: string,
		input: UpdateFundamentalIndicatorsInput,
	): Promise<FundamentalIndicators> {
		const [row] = await this.db
			.update(fundamentalIndicators)
			.set(buildFundamentalUpdateData(input))
			.where(eq(fundamentalIndicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("fundamental_indicators", id);
		}

		return mapFundamentalRow(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(fundamentalIndicators)
			.where(eq(fundamentalIndicators.id, id))
			.returning({ id: fundamentalIndicators.id });

		return result.length > 0;
	}

	async deleteBySymbolAndDate(symbol: string, date: string): Promise<boolean> {
		const result = await this.db
			.delete(fundamentalIndicators)
			.where(
				and(
					eq(fundamentalIndicators.symbol, symbol),
					eq(fundamentalIndicators.date, new Date(date)),
				),
			)
			.returning({ id: fundamentalIndicators.id });

		return result.length > 0;
	}

	async deleteBySymbol(symbol: string): Promise<number> {
		const result = await this.db
			.delete(fundamentalIndicators)
			.where(eq(fundamentalIndicators.symbol, symbol))
			.returning({ id: fundamentalIndicators.id });

		return result.length;
	}

	async deleteOlderThan(date: string): Promise<number> {
		const result = await this.db
			.delete(fundamentalIndicators)
			.where(lte(fundamentalIndicators.date, new Date(date)))
			.returning({ id: fundamentalIndicators.id });

		return result.length;
	}

	async getDistinctSectors(): Promise<string[]> {
		const rows = await this.db
			.selectDistinct({ sector: fundamentalIndicators.sector })
			.from(fundamentalIndicators)
			.where(sql`${fundamentalIndicators.sector} IS NOT NULL`)
			.orderBy(fundamentalIndicators.sector);

		return rows.map((r) => r.sector).filter((s): s is string => s !== null);
	}

	async getDistinctIndustries(sector?: string): Promise<string[]> {
		const conditions = [sql`${fundamentalIndicators.industry} IS NOT NULL`];

		if (sector) {
			conditions.push(eq(fundamentalIndicators.sector, sector));
		}

		const rows = await this.db
			.selectDistinct({ industry: fundamentalIndicators.industry })
			.from(fundamentalIndicators)
			.where(and(...conditions))
			.orderBy(fundamentalIndicators.industry);

		return rows.map((r) => r.industry).filter((i): i is string => i !== null);
	}

	async count(filters?: FundamentalFilters): Promise<number> {
		const conditions = buildFundamentalFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [result] = await this.db
			.select({ count: count() })
			.from(fundamentalIndicators)
			.where(whereClause);

		return result?.count ?? 0;
	}
}
