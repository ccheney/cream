/**
 * Fundamentals Repository (Drizzle ORM)
 *
 * CRUD operations for the fundamental_indicators table.
 * Stores fundamental data (P/E, P/B, ROE, ROA, etc.).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { fundamentalIndicators } from "../schema/indicators";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export interface FundamentalIndicators {
	id: string;
	symbol: string;
	date: string;

	// Value factors
	peRatioTtm: number | null;
	peRatioForward: number | null;
	pbRatio: number | null;
	evEbitda: number | null;
	earningsYield: number | null;
	dividendYield: number | null;
	cape10yr: number | null;

	// Quality factors
	grossProfitability: number | null;
	roe: number | null;
	roa: number | null;
	assetGrowth: number | null;
	accrualsRatio: number | null;
	cashFlowQuality: number | null;
	beneishMScore: number | null;

	// Size/market context
	marketCap: number | null;
	sector: string | null;
	industry: string | null;

	// Metadata
	source: string;
	computedAt: string;
}

export interface CreateFundamentalIndicatorsInput {
	id?: string;
	symbol: string;
	date: string;

	peRatioTtm?: number | null;
	peRatioForward?: number | null;
	pbRatio?: number | null;
	evEbitda?: number | null;
	earningsYield?: number | null;
	dividendYield?: number | null;
	cape10yr?: number | null;

	grossProfitability?: number | null;
	roe?: number | null;
	roa?: number | null;
	assetGrowth?: number | null;
	accrualsRatio?: number | null;
	cashFlowQuality?: number | null;
	beneishMScore?: number | null;

	marketCap?: number | null;
	sector?: string | null;
	industry?: string | null;

	source?: string;
}

export interface UpdateFundamentalIndicatorsInput {
	peRatioTtm?: number | null;
	peRatioForward?: number | null;
	pbRatio?: number | null;
	evEbitda?: number | null;
	earningsYield?: number | null;
	dividendYield?: number | null;
	cape10yr?: number | null;

	grossProfitability?: number | null;
	roe?: number | null;
	roa?: number | null;
	assetGrowth?: number | null;
	accrualsRatio?: number | null;
	cashFlowQuality?: number | null;
	beneishMScore?: number | null;

	marketCap?: number | null;
	sector?: string | null;
	industry?: string | null;
}

export interface FundamentalFilters {
	symbol?: string;
	symbols?: string[];
	sector?: string;
	industry?: string;
	startDate?: string;
	endDate?: string;
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

type FundamentalRow = typeof fundamentalIndicators.$inferSelect;

function mapRow(row: FundamentalRow): FundamentalIndicators {
	return {
		id: row.id,
		symbol: row.symbol,
		date: row.date.toISOString(),

		peRatioTtm: row.peRatioTtm ? Number(row.peRatioTtm) : null,
		peRatioForward: row.peRatioForward ? Number(row.peRatioForward) : null,
		pbRatio: row.pbRatio ? Number(row.pbRatio) : null,
		evEbitda: row.evEbitda ? Number(row.evEbitda) : null,
		earningsYield: row.earningsYield ? Number(row.earningsYield) : null,
		dividendYield: row.dividendYield ? Number(row.dividendYield) : null,
		cape10yr: row.cape10yr ? Number(row.cape10yr) : null,

		grossProfitability: row.grossProfitability ? Number(row.grossProfitability) : null,
		roe: row.roe ? Number(row.roe) : null,
		roa: row.roa ? Number(row.roa) : null,
		assetGrowth: row.assetGrowth ? Number(row.assetGrowth) : null,
		accrualsRatio: row.accrualsRatio ? Number(row.accrualsRatio) : null,
		cashFlowQuality: row.cashFlowQuality ? Number(row.cashFlowQuality) : null,
		beneishMScore: row.beneishMScore ? Number(row.beneishMScore) : null,

		marketCap: row.marketCap ? Number(row.marketCap) : null,
		sector: row.sector,
		industry: row.industry,

		source: row.source,
		computedAt: row.computedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class FundamentalsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
		const [row] = await this.db
			.insert(fundamentalIndicators)
			.values({
				symbol: input.symbol,
				date: new Date(input.date),
				peRatioTtm: input.peRatioTtm != null ? String(input.peRatioTtm) : null,
				peRatioForward: input.peRatioForward != null ? String(input.peRatioForward) : null,
				pbRatio: input.pbRatio != null ? String(input.pbRatio) : null,
				evEbitda: input.evEbitda != null ? String(input.evEbitda) : null,
				earningsYield: input.earningsYield != null ? String(input.earningsYield) : null,
				dividendYield: input.dividendYield != null ? String(input.dividendYield) : null,
				cape10yr: input.cape10yr != null ? String(input.cape10yr) : null,
				grossProfitability:
					input.grossProfitability != null ? String(input.grossProfitability) : null,
				roe: input.roe != null ? String(input.roe) : null,
				roa: input.roa != null ? String(input.roa) : null,
				assetGrowth: input.assetGrowth != null ? String(input.assetGrowth) : null,
				accrualsRatio: input.accrualsRatio != null ? String(input.accrualsRatio) : null,
				cashFlowQuality: input.cashFlowQuality != null ? String(input.cashFlowQuality) : null,
				beneishMScore: input.beneishMScore != null ? String(input.beneishMScore) : null,
				marketCap: input.marketCap != null ? String(input.marketCap) : null,
				sector: input.sector ?? null,
				industry: input.industry ?? null,
				source: input.source ?? "computed",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create fundamental indicators");
		}
		return mapRow(row);
	}

	async upsert(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
		const values = {
			symbol: input.symbol,
			date: new Date(input.date),
			peRatioTtm: input.peRatioTtm != null ? String(input.peRatioTtm) : null,
			peRatioForward: input.peRatioForward != null ? String(input.peRatioForward) : null,
			pbRatio: input.pbRatio != null ? String(input.pbRatio) : null,
			evEbitda: input.evEbitda != null ? String(input.evEbitda) : null,
			earningsYield: input.earningsYield != null ? String(input.earningsYield) : null,
			dividendYield: input.dividendYield != null ? String(input.dividendYield) : null,
			cape10yr: input.cape10yr != null ? String(input.cape10yr) : null,
			grossProfitability:
				input.grossProfitability != null ? String(input.grossProfitability) : null,
			roe: input.roe != null ? String(input.roe) : null,
			roa: input.roa != null ? String(input.roa) : null,
			assetGrowth: input.assetGrowth != null ? String(input.assetGrowth) : null,
			accrualsRatio: input.accrualsRatio != null ? String(input.accrualsRatio) : null,
			cashFlowQuality: input.cashFlowQuality != null ? String(input.cashFlowQuality) : null,
			beneishMScore: input.beneishMScore != null ? String(input.beneishMScore) : null,
			marketCap: input.marketCap != null ? String(input.marketCap) : null,
			sector: input.sector ?? null,
			industry: input.industry ?? null,
			source: input.source ?? "computed",
			computedAt: new Date(),
		};

		const [row] = await this.db
			.insert(fundamentalIndicators)
			.values(values)
			.onConflictDoUpdate({
				target: [fundamentalIndicators.symbol, fundamentalIndicators.date],
				set: {
					peRatioTtm: values.peRatioTtm,
					peRatioForward: values.peRatioForward,
					pbRatio: values.pbRatio,
					evEbitda: values.evEbitda,
					earningsYield: values.earningsYield,
					dividendYield: values.dividendYield,
					cape10yr: values.cape10yr,
					grossProfitability: values.grossProfitability,
					roe: values.roe,
					roa: values.roa,
					assetGrowth: values.assetGrowth,
					accrualsRatio: values.accrualsRatio,
					cashFlowQuality: values.cashFlowQuality,
					beneishMScore: values.beneishMScore,
					marketCap: values.marketCap,
					sector: values.sector,
					industry: values.industry,
					source: values.source,
					computedAt: values.computedAt,
				},
			})
			.returning();

		if (!row) {
			throw new Error("Failed to upsert fundamental indicators");
		}
		return mapRow(row);
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

		return row ? mapRow(row) : null;
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
					eq(fundamentalIndicators.date, new Date(date))
				)
			)
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async findLatestBySymbol(symbol: string): Promise<FundamentalIndicators | null> {
		const [row] = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(eq(fundamentalIndicators.symbol, symbol))
			.orderBy(desc(fundamentalIndicators.date))
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async findLatestBySymbols(symbols: string[]): Promise<FundamentalIndicators[]> {
		if (symbols.length === 0) {
			return [];
		}

		// Use a window function approach
		const rows = await this.db.execute(sql`
			SELECT DISTINCT ON (symbol) *
			FROM ${fundamentalIndicators}
			WHERE symbol = ANY(${symbols})
			ORDER BY symbol, date DESC
		`);

		return (rows.rows as FundamentalRow[]).map(mapRow);
	}

	async findBySymbol(
		symbol: string,
		filters?: { startDate?: string; endDate?: string }
	): Promise<FundamentalIndicators[]> {
		const conditions = [eq(fundamentalIndicators.symbol, symbol)];

		if (filters?.startDate) {
			conditions.push(gte(fundamentalIndicators.date, new Date(filters.startDate)));
		}
		if (filters?.endDate) {
			conditions.push(lte(fundamentalIndicators.date, new Date(filters.endDate)));
		}

		const rows = await this.db
			.select()
			.from(fundamentalIndicators)
			.where(and(...conditions))
			.orderBy(desc(fundamentalIndicators.date));

		return rows.map(mapRow);
	}

	async findMany(
		filters?: FundamentalFilters,
		pagination?: PaginationOptions
	): Promise<PaginatedResult<FundamentalIndicators>> {
		const conditions = [];

		if (filters?.symbol) {
			conditions.push(eq(fundamentalIndicators.symbol, filters.symbol));
		}
		if (filters?.symbols && filters.symbols.length > 0) {
			conditions.push(inArray(fundamentalIndicators.symbol, filters.symbols));
		}
		if (filters?.sector) {
			conditions.push(eq(fundamentalIndicators.sector, filters.sector));
		}
		if (filters?.industry) {
			conditions.push(eq(fundamentalIndicators.industry, filters.industry));
		}
		if (filters?.startDate) {
			conditions.push(gte(fundamentalIndicators.date, new Date(filters.startDate)));
		}
		if (filters?.endDate) {
			conditions.push(lte(fundamentalIndicators.date, new Date(filters.endDate)));
		}

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
			data: rows.map(mapRow),
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
						eq(fundamentalIndicators.date, new Date(date))
					)
				)
				.orderBy(fundamentalIndicators.symbol);

			return rows.map(mapRow);
		} else {
			// Get latest for each symbol in sector using DISTINCT ON
			const rows = await this.db.execute(sql`
				SELECT DISTINCT ON (symbol) *
				FROM ${fundamentalIndicators}
				WHERE sector = ${sector}
				ORDER BY symbol, date DESC
			`);

			return (rows.rows as FundamentalRow[]).map(mapRow);
		}
	}

	async update(
		id: string,
		input: UpdateFundamentalIndicatorsInput
	): Promise<FundamentalIndicators> {
		const updateData: Partial<typeof fundamentalIndicators.$inferInsert> = {
			computedAt: new Date(),
		};

		if (input.peRatioTtm !== undefined) {
			updateData.peRatioTtm = input.peRatioTtm != null ? String(input.peRatioTtm) : null;
		}
		if (input.peRatioForward !== undefined) {
			updateData.peRatioForward =
				input.peRatioForward != null ? String(input.peRatioForward) : null;
		}
		if (input.pbRatio !== undefined) {
			updateData.pbRatio = input.pbRatio != null ? String(input.pbRatio) : null;
		}
		if (input.evEbitda !== undefined) {
			updateData.evEbitda = input.evEbitda != null ? String(input.evEbitda) : null;
		}
		if (input.earningsYield !== undefined) {
			updateData.earningsYield = input.earningsYield != null ? String(input.earningsYield) : null;
		}
		if (input.dividendYield !== undefined) {
			updateData.dividendYield = input.dividendYield != null ? String(input.dividendYield) : null;
		}
		if (input.cape10yr !== undefined) {
			updateData.cape10yr = input.cape10yr != null ? String(input.cape10yr) : null;
		}
		if (input.grossProfitability !== undefined) {
			updateData.grossProfitability =
				input.grossProfitability != null ? String(input.grossProfitability) : null;
		}
		if (input.roe !== undefined) {
			updateData.roe = input.roe != null ? String(input.roe) : null;
		}
		if (input.roa !== undefined) {
			updateData.roa = input.roa != null ? String(input.roa) : null;
		}
		if (input.assetGrowth !== undefined) {
			updateData.assetGrowth = input.assetGrowth != null ? String(input.assetGrowth) : null;
		}
		if (input.accrualsRatio !== undefined) {
			updateData.accrualsRatio = input.accrualsRatio != null ? String(input.accrualsRatio) : null;
		}
		if (input.cashFlowQuality !== undefined) {
			updateData.cashFlowQuality =
				input.cashFlowQuality != null ? String(input.cashFlowQuality) : null;
		}
		if (input.beneishMScore !== undefined) {
			updateData.beneishMScore = input.beneishMScore != null ? String(input.beneishMScore) : null;
		}
		if (input.marketCap !== undefined) {
			updateData.marketCap = input.marketCap != null ? String(input.marketCap) : null;
		}
		if (input.sector !== undefined) {
			updateData.sector = input.sector;
		}
		if (input.industry !== undefined) {
			updateData.industry = input.industry;
		}

		const [row] = await this.db
			.update(fundamentalIndicators)
			.set(updateData)
			.where(eq(fundamentalIndicators.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("fundamental_indicators", id);
		}

		return mapRow(row);
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
					eq(fundamentalIndicators.date, new Date(date))
				)
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
		const conditions = [];

		if (filters?.symbol) {
			conditions.push(eq(fundamentalIndicators.symbol, filters.symbol));
		}
		if (filters?.symbols && filters.symbols.length > 0) {
			conditions.push(inArray(fundamentalIndicators.symbol, filters.symbols));
		}
		if (filters?.sector) {
			conditions.push(eq(fundamentalIndicators.sector, filters.sector));
		}
		if (filters?.startDate) {
			conditions.push(gte(fundamentalIndicators.date, new Date(filters.startDate)));
		}
		if (filters?.endDate) {
			conditions.push(lte(fundamentalIndicators.date, new Date(filters.endDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [result] = await this.db
			.select({ count: count() })
			.from(fundamentalIndicators)
			.where(whereClause);

		return result?.count ?? 0;
	}
}
