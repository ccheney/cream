/**
 * Filings Ingestion Service
 *
 * Orchestrates the complete filing ingestion pipeline:
 * 1. Fetch filings from SEC EDGAR (native TypeScript client)
 * 2. Parse filings with cheerio
 * 3. Chunk filings by section
 * 4. Ingest chunks into HelixDB with embeddings
 * 5. Track progress in PostgreSQL
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import { type Database, FilingSyncRunsRepository, FilingsRepository } from "@cream/storage";
import { chunkParsedFiling } from "./chunker.js";
import { EdgarClient, type EdgarClientConfig } from "./edgar-client.js";
import { batchIngestChunks } from "./helix-ingest.js";
import { parseFiling } from "./parsers/index.js";
import type {
	Filing,
	FilingChunk,
	FilingSyncConfig,
	FilingSyncResult,
	FilingType,
	ProgressCallback,
} from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Internal representation of a processed filing with its chunks
 */
interface ProcessedFiling {
	filing: Filing;
	chunks: FilingChunk[];
}

interface SyncCounters {
	symbolsProcessed: number;
	filingsFetched: number;
	filingsIngested: number;
	chunksCreated: number;
}

// ============================================
// Service Class
// ============================================

/**
 * Service for orchestrating SEC filings ingestion.
 *
 * @example
 * ```typescript
 * const service = new FilingsIngestionService(filingsRepo, syncRunsRepo);
 *
 * const result = await service.syncFilings({
 *   symbols: ["AAPL", "MSFT"],
 *   filingTypes: ["10-K", "10-Q"],
 *   triggerSource: "scheduled",
 *   environment: "PAPER",
 * });
 * ```
 */
export class FilingsIngestionService {
	private edgarClient: EdgarClient;

	constructor(
		private readonly filingsRepo: FilingsRepository,
		private readonly syncRunsRepo: FilingSyncRunsRepository,
		private readonly helixClient?: HelixClient,
		config?: EdgarClientConfig,
	) {
		this.edgarClient = new EdgarClient(config);
	}

	/**
	 * Run a complete filing sync operation.
	 *
	 * 1. Creates a sync run record
	 * 2. Fetches filings from SEC EDGAR
	 * 3. Parses and chunks each filing
	 * 4. Filters out already-ingested filings
	 * 5. Ingests new chunks into HelixDB
	 * 6. Updates tracking records
	 */
	async syncFilings(
		config: FilingSyncConfig,
		onProgress?: ProgressCallback,
	): Promise<FilingSyncResult> {
		const startTime = Date.now();
		const errors: string[] = [];
		const counters = this.createSyncCounters();

		const syncRun = await this.syncRunsRepo.start({
			symbolsRequested: config.symbols,
			filingTypes: config.filingTypes,
			dateRangeStart: config.startDate,
			dateRangeEnd: config.endDate,
			symbolsTotal: config.symbols.length,
			triggerSource: config.triggerSource,
			environment: config.environment,
		});
		const runId = syncRun.id;

		try {
			const client = this.helixClient ?? createHelixClientFromEnv();
			for (const symbol of config.symbols) {
				await this.processSymbol(config, symbol, client, counters, errors, onProgress);
				counters.symbolsProcessed++;
				await this.syncRunsRepo.updateProgress(runId, counters);
			}

			await this.syncRunsRepo.complete(runId, {
				filingsIngested: counters.filingsIngested,
				chunksCreated: counters.chunksCreated,
			});
			return this.buildSyncResult(runId, startTime, counters, errors, errors.length === 0);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			errors.push(errorMessage);
			await this.syncRunsRepo.fail(runId, errorMessage);
			return this.buildSyncResult(runId, startTime, counters, errors, false);
		}
	}

	private createSyncCounters(): SyncCounters {
		return {
			symbolsProcessed: 0,
			filingsFetched: 0,
			filingsIngested: 0,
			chunksCreated: 0,
		};
	}

	private buildSyncResult(
		runId: string,
		startTime: number,
		counters: SyncCounters,
		errors: string[],
		success: boolean,
	): FilingSyncResult {
		return {
			runId,
			success,
			symbolsProcessed: counters.symbolsProcessed,
			filingsFetched: counters.filingsFetched,
			filingsIngested: counters.filingsIngested,
			chunksCreated: counters.chunksCreated,
			durationMs: Date.now() - startTime,
			errors,
		};
	}

	private reportProgress(
		phase: Parameters<ProgressCallback>[0]["phase"],
		symbol: string,
		config: FilingSyncConfig,
		counters: SyncCounters,
		onProgress?: ProgressCallback,
	): void {
		if (!onProgress) {
			return;
		}
		onProgress({
			phase,
			symbol,
			symbolsProcessed: counters.symbolsProcessed,
			symbolsTotal: config.symbols.length,
			filingsIngested: counters.filingsIngested,
			chunksCreated: counters.chunksCreated,
		});
	}

	private async processSymbol(
		config: FilingSyncConfig,
		symbol: string,
		client: HelixClient,
		counters: SyncCounters,
		errors: string[],
		onProgress?: ProgressCallback,
	): Promise<void> {
		this.reportProgress("fetching", symbol, config, counters, onProgress);
		try {
			const filings = await this.edgarClient.getFilings({
				tickerOrCik: symbol,
				filingTypes: config.filingTypes,
				startDate: config.startDate ? new Date(config.startDate) : undefined,
				endDate: config.endDate ? new Date(config.endDate) : undefined,
				limit: config.limitPerSymbol ?? 10,
			});
			counters.filingsFetched += filings.length;
			this.reportProgress("parsing", symbol, config, counters, onProgress);
			for (const filing of filings) {
				await this.processSingleFiling(
					config,
					symbol,
					filing,
					client,
					counters,
					errors,
					onProgress,
				);
			}
		} catch (symbolError) {
			const errorMsg = symbolError instanceof Error ? symbolError.message : "Unknown error";
			errors.push(`Failed to process ${symbol}: ${errorMsg}`);
		}
	}

	private async processSingleFiling(
		config: FilingSyncConfig,
		symbol: string,
		filing: Filing,
		client: HelixClient,
		counters: SyncCounters,
		errors: string[],
		onProgress?: ProgressCallback,
	): Promise<void> {
		const exists = await this.filingsRepo.existsByAccessionNumber(filing.accessionNumber);
		if (exists) {
			return;
		}

		try {
			const html = await this.edgarClient.getFilingHtml(filing);
			const parsed = parseFiling(filing, html);
			this.reportProgress("chunking", symbol, config, counters, onProgress);
			const chunks = chunkParsedFiling(parsed);

			const createdFiling = await this.filingsRepo.create({
				accessionNumber: filing.accessionNumber,
				symbol,
				filingType: filing.filingType,
				filedDate: formatDate(filing.filedDate),
				ingestedAt: new Date().toISOString(),
			});

			this.reportProgress("storing", symbol, config, counters, onProgress);
			const result = await batchIngestChunks(client, chunks);
			await this.handleBatchResult(createdFiling.id, filing, parsed, result, counters, errors);
		} catch (parseError) {
			const errorMsg = parseError instanceof Error ? parseError.message : "Unknown error";
			errors.push(`Failed to parse ${symbol}/${filing.accessionNumber}: ${errorMsg}`);
		}
	}

	private async handleBatchResult(
		filingId: string,
		filing: Filing,
		parsed: ReturnType<typeof parseFiling>,
		result: Awaited<ReturnType<typeof batchIngestChunks>>,
		counters: SyncCounters,
		errors: string[],
	): Promise<void> {
		if (result.successful.length > 0) {
			await this.filingsRepo.markComplete(
				filingId,
				Object.keys(parsed.sections).length,
				result.successful.length,
			);
			counters.filingsIngested++;
			counters.chunksCreated += result.successful.length;
			return;
		}

		if (result.failed.length === 0) {
			return;
		}

		const errorMsg = result.failed.map((failedItem) => failedItem.error).join("; ");
		await this.filingsRepo.markFailed(filingId, errorMsg);
		errors.push(`Failed to ingest ${filing.accessionNumber}: ${errorMsg}`);
	}

	/**
	 * Fetch and process a single filing.
	 *
	 * Useful for testing or one-off ingestion.
	 */
	async processFiling(symbol: string, accessionNumber: string): Promise<ProcessedFiling | null> {
		// Get filings for symbol
		const filings = await this.edgarClient.getFilings({
			tickerOrCik: symbol,
			limit: 100,
		});

		// Find the specific filing
		const filing = filings.find((f) => f.accessionNumber === accessionNumber);
		if (!filing) {
			return null;
		}

		// Fetch and parse
		const html = await this.edgarClient.getFilingHtml(filing);
		const parsed = parseFiling(filing, html);
		const chunks = chunkParsedFiling(parsed);

		return { filing, chunks };
	}

	/**
	 * Get the last successful sync run.
	 */
	async getLastSync(): Promise<{
		runId: string;
		completedAt: string;
		filingsIngested: number;
		chunksCreated: number;
	} | null> {
		const lastRun = await this.syncRunsRepo.getLastSuccessful();
		if (!lastRun) {
			return null;
		}

		return {
			runId: lastRun.id,
			completedAt: lastRun.completedAt ?? lastRun.startedAt,
			filingsIngested: lastRun.filingsIngested,
			chunksCreated: lastRun.chunksCreated,
		};
	}

	/**
	 * Check if a sync is currently running.
	 */
	async isSyncRunning(): Promise<boolean> {
		const running = await this.syncRunsRepo.findRunning();
		return running !== null;
	}

	/**
	 * Get filing statistics for a symbol.
	 */
	async getSymbolStats(symbol: string): Promise<{
		total: number;
		byType: Record<FilingType, number>;
		lastIngested: string | null;
	}> {
		return this.filingsRepo.getStatsBySymbol(symbol);
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a FilingsIngestionService from database client.
 */
export function createFilingsIngestionService(
	db: Database,
	helixClient?: HelixClient,
	config?: EdgarClientConfig,
): FilingsIngestionService {
	const filingsRepo = new FilingsRepository(db);
	const syncRunsRepo = new FilingSyncRunsRepository(db);

	return new FilingsIngestionService(filingsRepo, syncRunsRepo, helixClient, config);
}

// ============================================
// Utilities
// ============================================

/**
 * Format a Date as ISO date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
	const isoString = date.toISOString();
	return isoString.split("T")[0] ?? isoString.slice(0, 10);
}
