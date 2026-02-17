import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { filings } from "../schema/external";
import {
	type CreateFilingInput,
	type Filing,
	type FilingFilters,
	type FilingType,
	mapFilingRow,
	type PaginatedResult,
	type PaginationOptions,
} from "./filings.types";

export class FilingsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateFilingInput): Promise<Filing> {
		const [row] = await this.db
			.insert(filings)
			.values({
				accessionNumber: input.accessionNumber,
				symbol: input.symbol,
				filingType: input.filingType as typeof filings.$inferInsert.filingType,
				filedDate: new Date(input.filedDate),
				reportDate: input.reportDate ? new Date(input.reportDate) : null,
				companyName: input.companyName ?? null,
				cik: input.cik ?? null,
				ingestedAt: new Date(input.ingestedAt),
				status: "pending",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create filing");
		}
		return mapFilingRow(row);
	}

	async findById(id: string): Promise<Filing | null> {
		const [row] = await this.db.select().from(filings).where(eq(filings.id, id)).limit(1);

		return row ? mapFilingRow(row) : null;
	}

	async findByAccessionNumber(accessionNumber: string): Promise<Filing | null> {
		const [row] = await this.db
			.select()
			.from(filings)
			.where(eq(filings.accessionNumber, accessionNumber))
			.limit(1);

		return row ? mapFilingRow(row) : null;
	}

	async existsByAccessionNumber(accessionNumber: string): Promise<boolean> {
		const [result] = await this.db
			.select({ count: count() })
			.from(filings)
			.where(eq(filings.accessionNumber, accessionNumber));

		return (result?.count ?? 0) > 0;
	}

	async findMany(
		filters: FilingFilters = {},
		pagination?: PaginationOptions,
	): Promise<PaginatedResult<Filing>> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(filings.symbol, filters.symbol));
		}
		if (filters.filingType) {
			if (Array.isArray(filters.filingType)) {
				conditions.push(
					inArray(
						filings.filingType,
						filters.filingType as (typeof filings.$inferSelect.filingType)[],
					),
				);
			} else {
				conditions.push(
					eq(filings.filingType, filters.filingType as typeof filings.$inferSelect.filingType),
				);
			}
		}
		if (filters.status) {
			if (Array.isArray(filters.status)) {
				conditions.push(
					inArray(filings.status, filters.status as (typeof filings.$inferSelect.status)[]),
				);
			} else {
				conditions.push(eq(filings.status, filters.status as typeof filings.$inferSelect.status));
			}
		}
		if (filters.fromDate) {
			conditions.push(gte(filings.filedDate, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(filings.filedDate, new Date(filters.toDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db.select({ count: count() }).from(filings).where(whereClause);

		const rows = await this.db
			.select()
			.from(filings)
			.where(whereClause)
			.orderBy(desc(filings.filedDate))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapFilingRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findBySymbol(symbol: string, limit = 50): Promise<Filing[]> {
		const rows = await this.db
			.select()
			.from(filings)
			.where(eq(filings.symbol, symbol))
			.orderBy(desc(filings.filedDate))
			.limit(limit);

		return rows.map(mapFilingRow);
	}

	async findRecent(symbol: string, filingType?: FilingType, limit = 10): Promise<Filing[]> {
		const conditions = [eq(filings.symbol, symbol), eq(filings.status, "complete")];

		if (filingType) {
			conditions.push(eq(filings.filingType, filingType as typeof filings.$inferSelect.filingType));
		}

		const rows = await this.db
			.select()
			.from(filings)
			.where(and(...conditions))
			.orderBy(desc(filings.filedDate))
			.limit(limit);

		return rows.map(mapFilingRow);
	}

	async markProcessing(id: string): Promise<void> {
		await this.db
			.update(filings)
			.set({ status: "processing", updatedAt: new Date() })
			.where(eq(filings.id, id));
	}

	async markComplete(id: string, sectionCount: number, chunkCount: number): Promise<void> {
		await this.db
			.update(filings)
			.set({
				status: "complete",
				sectionCount,
				chunkCount,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(filings.id, id));
	}

	async markFailed(id: string, errorMessage: string): Promise<void> {
		await this.db
			.update(filings)
			.set({
				status: "failed",
				errorMessage,
				updatedAt: new Date(),
			})
			.where(eq(filings.id, id));
	}

	async getStatsBySymbol(symbol: string): Promise<{
		total: number;
		byType: Record<FilingType, number>;
		lastIngested: string | null;
	}> {
		const [countResult] = await this.db
			.select({ count: count() })
			.from(filings)
			.where(and(eq(filings.symbol, symbol), eq(filings.status, "complete")));

		const typeRows = await this.db
			.select({
				filingType: filings.filingType,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(filings)
			.where(and(eq(filings.symbol, symbol), eq(filings.status, "complete")))
			.groupBy(filings.filingType);

		const [lastRow] = await this.db
			.select({ ingestedAt: filings.ingestedAt })
			.from(filings)
			.where(and(eq(filings.symbol, symbol), eq(filings.status, "complete")))
			.orderBy(desc(filings.ingestedAt))
			.limit(1);

		const byType: Record<FilingType, number> = {
			"10-K": 0,
			"10-Q": 0,
			"8-K": 0,
			DEF14A: 0,
		};
		for (const row of typeRows) {
			byType[row.filingType as FilingType] = row.count;
		}

		return {
			total: countResult?.count ?? 0,
			byType,
			lastIngested: lastRow?.ingestedAt?.toISOString() ?? null,
		};
	}

	async getOverallStats(): Promise<{
		total: number;
		totalChunks: number;
		byType: Record<string, number>;
	}> {
		const [countResult] = await this.db
			.select({ count: count() })
			.from(filings)
			.where(eq(filings.status, "complete"));

		const [chunkResult] = await this.db
			.select({ total: sql<number>`COALESCE(SUM(${filings.chunkCount}), 0)::int` })
			.from(filings)
			.where(eq(filings.status, "complete"));

		const typeRows = await this.db
			.select({
				filingType: filings.filingType,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(filings)
			.where(eq(filings.status, "complete"))
			.groupBy(filings.filingType);

		const byType: Record<string, number> = {};
		for (const row of typeRows) {
			byType[row.filingType] = row.count;
		}

		return {
			total: countResult?.count ?? 0,
			totalChunks: chunkResult?.total ?? 0,
			byType,
		};
	}

	async findByCreatedAtRange(startTime: string, endTime: string, limit = 100): Promise<Filing[]> {
		const rows = await this.db
			.select()
			.from(filings)
			.where(
				and(gte(filings.createdAt, new Date(startTime)), lte(filings.createdAt, new Date(endTime))),
			)
			.orderBy(desc(filings.filedDate))
			.limit(limit);

		return rows.map(mapFilingRow);
	}
}
