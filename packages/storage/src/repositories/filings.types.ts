import type { filingSyncRuns, filings } from "../schema/external";

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

type FilingRow = typeof filings.$inferSelect;
type SyncRunRow = typeof filingSyncRuns.$inferSelect;

export function mapFilingRow(row: FilingRow): Filing {
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

export function mapSyncRunRow(row: SyncRunRow): FilingSyncRun {
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
