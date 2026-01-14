/**
 * Filings Repository
 *
 * Data access for filings and filing_sync_runs tables.
 * Tracks SEC filing ingestion and sync job history.
 *
 * @see packages/filings for the ingestion pipeline
 */

import type { Row, TursoClient } from "../turso.js";
import {
	type PaginatedResult,
	type PaginationOptions,
	paginate,
	parseJson,
	query,
	RepositoryError,
	toJson,
} from "./base.js";

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
	id: string;
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
	id: string;
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

// ============================================
// Row Mappers
// ============================================

function mapFilingRow(row: Row): Filing {
	return {
		id: row.id as string,
		accessionNumber: row.accession_number as string,
		symbol: row.symbol as string,
		filingType: row.filing_type as FilingType,
		filedDate: row.filed_date as string,
		reportDate: row.report_date as string | null,
		companyName: row.company_name as string | null,
		cik: row.cik as string | null,
		sectionCount: (row.section_count as number) ?? 0,
		chunkCount: (row.chunk_count as number) ?? 0,
		status: row.status as FilingStatus,
		errorMessage: row.error_message as string | null,
		ingestedAt: row.ingested_at as string,
		completedAt: row.completed_at as string | null,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	};
}

function mapSyncRunRow(row: Row): FilingSyncRun {
	return {
		id: row.id as string,
		startedAt: row.started_at as string,
		completedAt: row.completed_at as string | null,
		symbolsRequested: parseJson<string[]>(row.symbols_requested, []),
		filingTypes: parseJson<string[]>(row.filing_types, []),
		dateRangeStart: row.date_range_start as string | null,
		dateRangeEnd: row.date_range_end as string | null,
		symbolsTotal: (row.symbols_total as number) ?? 0,
		symbolsProcessed: (row.symbols_processed as number) ?? 0,
		filingsFetched: (row.filings_fetched as number) ?? 0,
		filingsIngested: (row.filings_ingested as number) ?? 0,
		chunksCreated: (row.chunks_created as number) ?? 0,
		status: row.status as SyncRunStatus,
		errorMessage: row.error_message as string | null,
		triggerSource: row.trigger_source as TriggerSource,
		environment: row.environment as string,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	};
}

// ============================================
// Filings Repository
// ============================================

export class FilingsRepository {
	private readonly table = "filings";

	constructor(private readonly client: TursoClient) {}

	async create(input: CreateFilingInput): Promise<Filing> {
		try {
			await this.client.run(
				`INSERT INTO ${this.table} (
          id, accession_number, symbol, filing_type, filed_date,
          report_date, company_name, cik, ingested_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
				[
					input.id,
					input.accessionNumber,
					input.symbol,
					input.filingType,
					input.filedDate,
					input.reportDate ?? null,
					input.companyName ?? null,
					input.cik ?? null,
					input.ingestedAt,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(input.id) as Promise<Filing>;
	}

	async findById(id: string): Promise<Filing | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
		return row ? mapFilingRow(row) : null;
	}

	async findByAccessionNumber(accessionNumber: string): Promise<Filing | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM ${this.table} WHERE accession_number = ?`,
			[accessionNumber]
		);
		return row ? mapFilingRow(row) : null;
	}

	async existsByAccessionNumber(accessionNumber: string): Promise<boolean> {
		const row = await this.client.get<{ count: number }>(
			`SELECT COUNT(*) as count FROM ${this.table} WHERE accession_number = ?`,
			[accessionNumber]
		);
		return (row?.count ?? 0) > 0;
	}

	async findMany(
		filters: FilingFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Filing>> {
		const builder = query().orderBy("filed_date", "DESC");

		if (filters.symbol) {
			builder.eq("symbol", filters.symbol);
		}
		if (filters.filingType) {
			if (Array.isArray(filters.filingType)) {
				builder.where("filing_type", "IN", filters.filingType);
			} else {
				builder.eq("filing_type", filters.filingType);
			}
		}
		if (filters.status) {
			if (Array.isArray(filters.status)) {
				builder.where("status", "IN", filters.status);
			} else {
				builder.eq("status", filters.status);
			}
		}
		if (filters.fromDate) {
			builder.where("filed_date", ">=", filters.fromDate);
		}
		if (filters.toDate) {
			builder.where("filed_date", "<=", filters.toDate);
		}

		const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
		// split() always returns at least one element, so index 0 is safe
		// biome-ignore lint/style/noNonNullAssertion: split always returns at least one element
		const baseSql = sql.split(" LIMIT ")[0]!;
		const countSql = baseSql.replace("SELECT *", "SELECT COUNT(*) as count");

		const result = await paginate<Row>(
			this.client,
			baseSql,
			countSql,
			args.slice(0, -2),
			pagination
		);

		return {
			...result,
			data: result.data.map(mapFilingRow),
		};
	}

	async findBySymbol(symbol: string, limit = 50): Promise<Filing[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM ${this.table}
       WHERE symbol = ?
       ORDER BY filed_date DESC
       LIMIT ?`,
			[symbol, limit]
		);
		return rows.map(mapFilingRow);
	}

	async findRecent(symbol: string, filingType?: FilingType, limit = 10): Promise<Filing[]> {
		let sql = `SELECT * FROM ${this.table} WHERE symbol = ?`;
		const args: unknown[] = [symbol];

		if (filingType) {
			sql += ` AND filing_type = ?`;
			args.push(filingType);
		}

		sql += ` AND status = 'complete' ORDER BY filed_date DESC LIMIT ?`;
		args.push(limit);

		const rows = await this.client.execute<Row>(sql, args);
		return rows.map(mapFilingRow);
	}

	async markProcessing(id: string): Promise<void> {
		await this.client.run(
			`UPDATE ${this.table}
       SET status = 'processing', updated_at = datetime('now')
       WHERE id = ?`,
			[id]
		);
	}

	async markComplete(id: string, sectionCount: number, chunkCount: number): Promise<void> {
		await this.client.run(
			`UPDATE ${this.table}
       SET status = 'complete',
           section_count = ?,
           chunk_count = ?,
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
			[sectionCount, chunkCount, id]
		);
	}

	async markFailed(id: string, errorMessage: string): Promise<void> {
		await this.client.run(
			`UPDATE ${this.table}
       SET status = 'failed',
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
			[errorMessage, id]
		);
	}

	async getStatsBySymbol(symbol: string): Promise<{
		total: number;
		byType: Record<FilingType, number>;
		lastIngested: string | null;
	}> {
		const countRow = await this.client.get<{ count: number }>(
			`SELECT COUNT(*) as count FROM ${this.table} WHERE symbol = ? AND status = 'complete'`,
			[symbol]
		);

		const typeRows = await this.client.execute<{ filing_type: string; count: number }>(
			`SELECT filing_type, COUNT(*) as count
       FROM ${this.table}
       WHERE symbol = ? AND status = 'complete'
       GROUP BY filing_type`,
			[symbol]
		);

		const lastRow = await this.client.get<{ ingested_at: string }>(
			`SELECT ingested_at FROM ${this.table}
       WHERE symbol = ? AND status = 'complete'
       ORDER BY ingested_at DESC LIMIT 1`,
			[symbol]
		);

		const byType: Record<FilingType, number> = {
			"10-K": 0,
			"10-Q": 0,
			"8-K": 0,
			DEF14A: 0,
		};
		for (const row of typeRows) {
			byType[row.filing_type as FilingType] = row.count;
		}

		return {
			total: countRow?.count ?? 0,
			byType,
			lastIngested: lastRow?.ingested_at ?? null,
		};
	}

	async getOverallStats(): Promise<{
		total: number;
		totalChunks: number;
		byType: Record<string, number>;
	}> {
		const countRow = await this.client.get<{ count: number }>(
			`SELECT COUNT(*) as count FROM ${this.table} WHERE status = 'complete'`
		);

		const chunkRow = await this.client.get<{ total: number }>(
			`SELECT SUM(chunk_count) as total FROM ${this.table} WHERE status = 'complete'`
		);

		const typeRows = await this.client.execute<{ filing_type: string; count: number }>(
			`SELECT filing_type, COUNT(*) as count
       FROM ${this.table}
       WHERE status = 'complete'
       GROUP BY filing_type`
		);

		const byType: Record<string, number> = {};
		for (const row of typeRows) {
			byType[row.filing_type] = row.count;
		}

		return {
			total: countRow?.count ?? 0,
			totalChunks: chunkRow?.total ?? 0,
			byType,
		};
	}
}

// ============================================
// Filing Sync Runs Repository
// ============================================

export class FilingSyncRunsRepository {
	private readonly table = "filing_sync_runs";

	constructor(private readonly client: TursoClient) {}

	async start(input: CreateSyncRunInput): Promise<FilingSyncRun> {
		const now = new Date().toISOString();

		try {
			await this.client.run(
				`INSERT INTO ${this.table} (
          id, started_at, symbols_requested, filing_types,
          date_range_start, date_range_end, symbols_total,
          trigger_source, environment, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
				[
					input.id,
					now,
					toJson(input.symbolsRequested),
					toJson(input.filingTypes),
					input.dateRangeStart ?? null,
					input.dateRangeEnd ?? null,
					input.symbolsTotal,
					input.triggerSource,
					input.environment,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError(this.table, error as Error);
		}

		return this.findById(input.id) as Promise<FilingSyncRun>;
	}

	async findById(id: string): Promise<FilingSyncRun | null> {
		const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
		return row ? mapSyncRunRow(row) : null;
	}

	async updateProgress(id: string, progress: UpdateSyncRunProgress): Promise<void> {
		const updates: string[] = ["updated_at = datetime('now')"];
		const args: unknown[] = [];

		if (progress.symbolsProcessed !== undefined) {
			updates.push("symbols_processed = ?");
			args.push(progress.symbolsProcessed);
		}
		if (progress.filingsFetched !== undefined) {
			updates.push("filings_fetched = ?");
			args.push(progress.filingsFetched);
		}
		if (progress.filingsIngested !== undefined) {
			updates.push("filings_ingested = ?");
			args.push(progress.filingsIngested);
		}
		if (progress.chunksCreated !== undefined) {
			updates.push("chunks_created = ?");
			args.push(progress.chunksCreated);
		}

		args.push(id);

		await this.client.run(`UPDATE ${this.table} SET ${updates.join(", ")} WHERE id = ?`, args);
	}

	async complete(
		id: string,
		stats: { filingsIngested: number; chunksCreated: number }
	): Promise<void> {
		await this.client.run(
			`UPDATE ${this.table}
       SET status = 'completed',
           completed_at = datetime('now'),
           filings_ingested = ?,
           chunks_created = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
			[stats.filingsIngested, stats.chunksCreated, id]
		);
	}

	async fail(id: string, errorMessage: string): Promise<void> {
		await this.client.run(
			`UPDATE ${this.table}
       SET status = 'failed',
           completed_at = datetime('now'),
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
			[errorMessage, id]
		);
	}

	async findRecent(limit = 10): Promise<FilingSyncRun[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM ${this.table}
       ORDER BY started_at DESC
       LIMIT ?`,
			[limit]
		);
		return rows.map(mapSyncRunRow);
	}

	async findRunning(): Promise<FilingSyncRun | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM ${this.table}
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`
		);
		return row ? mapSyncRunRow(row) : null;
	}

	async getLastSuccessful(): Promise<FilingSyncRun | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM ${this.table}
       WHERE status = 'completed'
       ORDER BY completed_at DESC
       LIMIT 1`
		);
		return row ? mapSyncRunRow(row) : null;
	}
}
