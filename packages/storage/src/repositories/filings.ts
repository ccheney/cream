/**
 * Filings Repository (Drizzle ORM)
 *
 * Data access for filings and filing_sync_runs tables.
 * Tracks SEC filing ingestion and sync job history.
 *
 * @see packages/filings for the ingestion pipeline
 */
import { and, count, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { getDb, type Database } from "../db";
import { filings, filingSyncRuns } from "../schema/external";

// ============================================
// Types
// ============================================

export type FilingType = "10-K" | "10-Q" | "8-K" | "DEF14A";

export type FilingStatus = "pending" | "processing" | "complete" | "failed";

export type SyncRunStatus = "running" | "completed" | "failed";

export type TriggerSource = "scheduled" | "manual" | "dashboard";

export interface Filing {
	id: string;
	accessionNumber: string;
	symbol: string;
	filingType: FilingType;
	filedDate: string;
	reportDate: string | null;
	companyName: string | null;
	cik: string | null;
	sectionCount: number;
	chunkCount: number;
	status: FilingStatus;
	errorMessage: string | null;
	ingestedAt: string;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateFilingInput {
	accessionNumber: string;
	symbol: string;
	filingType: FilingType;
	filedDate: string;
	reportDate?: string;
	companyName?: string;
	cik?: string;
	ingestedAt: string;
}

export interface FilingFilters {
	symbol?: string;
	filingType?: FilingType | FilingType[];
	status?: FilingStatus | FilingStatus[];
	fromDate?: string;
	toDate?: string;
}

export interface FilingSyncRun {
	id: string;
	startedAt: string;
	completedAt: string | null;
	symbolsRequested: string[];
	filingTypes: string[];
	dateRangeStart: string | null;
	dateRangeEnd: string | null;
	symbolsTotal: number;
	symbolsProcessed: number;
	filingsFetched: number;
	filingsIngested: number;
	chunksCreated: number;
	status: SyncRunStatus;
	errorMessage: string | null;
	triggerSource: TriggerSource;
	environment: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateSyncRunInput {
	symbolsRequested: string[];
	filingTypes: string[];
	dateRangeStart?: string;
	dateRangeEnd?: string;
	symbolsTotal: number;
	triggerSource: TriggerSource;
	environment: string;
}

export interface UpdateSyncRunProgress {
	symbolsProcessed?: number;
	filingsFetched?: number;
	filingsIngested?: number;
	chunksCreated?: number;
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
// Row Mappers
// ============================================

type FilingRow = typeof filings.$inferSelect;
type SyncRunRow = typeof filingSyncRuns.$inferSelect;

function mapFilingRow(row: FilingRow): Filing {
	return {
		id: row.id,
		accessionNumber: row.accessionNumber,
		symbol: row.symbol,
		filingType: row.filingType as FilingType,
		filedDate: row.filedDate.toISOString(),
		reportDate: row.reportDate?.toISOString() ?? null,
		companyName: row.companyName,
		cik: row.cik,
		sectionCount: row.sectionCount ?? 0,
		chunkCount: row.chunkCount ?? 0,
		status: row.status as FilingStatus,
		errorMessage: row.errorMessage,
		ingestedAt: row.ingestedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapSyncRunRow(row: SyncRunRow): FilingSyncRun {
	return {
		id: row.id,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		symbolsRequested: row.symbolsRequested as string[],
		filingTypes: row.filingTypes as string[],
		dateRangeStart: row.dateRangeStart?.toISOString() ?? null,
		dateRangeEnd: row.dateRangeEnd?.toISOString() ?? null,
		symbolsTotal: row.symbolsTotal ?? 0,
		symbolsProcessed: row.symbolsProcessed ?? 0,
		filingsFetched: row.filingsFetched ?? 0,
		filingsIngested: row.filingsIngested ?? 0,
		chunksCreated: row.chunksCreated ?? 0,
		status: row.status as SyncRunStatus,
		errorMessage: row.errorMessage,
		triggerSource: row.triggerSource as TriggerSource,
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Filings Repository
// ============================================

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

		return mapFilingRow(row);
	}

	async findById(id: string): Promise<Filing | null> {
		const [row] = await this.db
			.select()
			.from(filings)
			.where(eq(filings.id, id))
			.limit(1);

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
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Filing>> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(filings.symbol, filters.symbol));
		}
		if (filters.filingType) {
			if (Array.isArray(filters.filingType)) {
				conditions.push(inArray(filings.filingType, filters.filingType as typeof filings.$inferSelect.filingType[]));
			} else {
				conditions.push(eq(filings.filingType, filters.filingType as typeof filings.$inferSelect.filingType));
			}
		}
		if (filters.status) {
			if (Array.isArray(filters.status)) {
				conditions.push(inArray(filings.status, filters.status as typeof filings.$inferSelect.status[]));
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

		const [countResult] = await this.db
			.select({ count: count() })
			.from(filings)
			.where(whereClause);

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
		const conditions = [
			eq(filings.symbol, symbol),
			eq(filings.status, "complete"),
		];

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
}

// ============================================
// Filing Sync Runs Repository
// ============================================

export class FilingSyncRunsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async start(input: CreateSyncRunInput): Promise<FilingSyncRun> {
		const [row] = await this.db
			.insert(filingSyncRuns)
			.values({
				startedAt: new Date(),
				symbolsRequested: input.symbolsRequested,
				filingTypes: input.filingTypes,
				dateRangeStart: input.dateRangeStart ? new Date(input.dateRangeStart) : null,
				dateRangeEnd: input.dateRangeEnd ? new Date(input.dateRangeEnd) : null,
				symbolsTotal: input.symbolsTotal,
				triggerSource: input.triggerSource as typeof filingSyncRuns.$inferInsert.triggerSource,
				environment: input.environment as typeof filingSyncRuns.$inferInsert.environment,
				status: "running",
			})
			.returning();

		return mapSyncRunRow(row);
	}

	async findById(id: string): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.id, id))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}

	async updateProgress(id: string, progress: UpdateSyncRunProgress): Promise<void> {
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (progress.symbolsProcessed !== undefined) {
			updates.symbolsProcessed = progress.symbolsProcessed;
		}
		if (progress.filingsFetched !== undefined) {
			updates.filingsFetched = progress.filingsFetched;
		}
		if (progress.filingsIngested !== undefined) {
			updates.filingsIngested = progress.filingsIngested;
		}
		if (progress.chunksCreated !== undefined) {
			updates.chunksCreated = progress.chunksCreated;
		}

		await this.db
			.update(filingSyncRuns)
			.set(updates)
			.where(eq(filingSyncRuns.id, id));
	}

	async complete(
		id: string,
		stats: { filingsIngested: number; chunksCreated: number }
	): Promise<void> {
		await this.db
			.update(filingSyncRuns)
			.set({
				status: "completed",
				completedAt: new Date(),
				filingsIngested: stats.filingsIngested,
				chunksCreated: stats.chunksCreated,
				updatedAt: new Date(),
			})
			.where(eq(filingSyncRuns.id, id));
	}

	async fail(id: string, errorMessage: string): Promise<void> {
		await this.db
			.update(filingSyncRuns)
			.set({
				status: "failed",
				completedAt: new Date(),
				errorMessage,
				updatedAt: new Date(),
			})
			.where(eq(filingSyncRuns.id, id));
	}

	async findRecent(limit = 10): Promise<FilingSyncRun[]> {
		const rows = await this.db
			.select()
			.from(filingSyncRuns)
			.orderBy(desc(filingSyncRuns.startedAt))
			.limit(limit);

		return rows.map(mapSyncRunRow);
	}

	async findRunning(): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.status, "running"))
			.orderBy(desc(filingSyncRuns.startedAt))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}

	async getLastSuccessful(): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.status, "completed"))
			.orderBy(desc(filingSyncRuns.completedAt))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}
}
