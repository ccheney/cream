/**
 * Filings Ingestion Service
 *
 * Orchestrates the complete filing ingestion pipeline:
 * 1. Fetch filings from SEC EDGAR (via Python bridge)
 * 2. Chunk filings by section
 * 3. Ingest chunks into HelixDB with embeddings
 * 4. Track progress in Turso
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import { FilingSyncRunsRepository, FilingsRepository, type TursoClient } from "@cream/storage";
import { ingestChunkedFilings } from "./helix-ingest.js";
import { fetchAndChunkFilings } from "./python-bridge.js";
import type {
  ChunkedFilingEvent,
  FilingSyncConfig,
  FilingSyncResult,
  FilingType,
  ProgressCallback,
} from "./types.js";

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
  constructor(
    private readonly filingsRepo: FilingsRepository,
    private readonly syncRunsRepo: FilingSyncRunsRepository,
    private readonly helixClient?: HelixClient,
    private readonly cwd?: string
  ) {}

  /**
   * Run a complete filing sync operation.
   *
   * 1. Creates a sync run record
   * 2. Fetches and chunks filings from SEC
   * 3. Filters out already-ingested filings
   * 4. Ingests new chunks into HelixDB
   * 5. Updates tracking records
   */
  async syncFilings(
    config: FilingSyncConfig,
    onProgress?: ProgressCallback
  ): Promise<FilingSyncResult> {
    const startTime = Date.now();
    const runId = `sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const errors: string[] = [];

    // Create sync run record
    await this.syncRunsRepo.start({
      id: runId,
      symbolsRequested: config.symbols,
      filingTypes: config.filingTypes,
      dateRangeStart: config.startDate,
      dateRangeEnd: config.endDate,
      symbolsTotal: config.symbols.length,
      triggerSource: config.triggerSource,
      environment: config.environment,
    });

    let filingsIngested = 0;
    let chunksCreated = 0;

    try {
      // Phase 1: Fetch and chunk filings from SEC
      const {
        filings,
        complete,
        errors: fetchErrors,
      } = await fetchAndChunkFilings(config.symbols, {
        filingTypes: config.filingTypes,
        startDate: config.startDate,
        endDate: config.endDate,
        limitPerSymbol: config.limitPerSymbol,
        cwd: this.cwd,
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({
              ...progress,
              filingsIngested,
              chunksCreated,
            });
          }
        },
      });

      errors.push(...fetchErrors);

      // Phase 2: Filter out already-ingested filings
      const newFilings = await this.filterNewFilings(filings);

      // Phase 3: Ingest into HelixDB
      const client = this.helixClient ?? createHelixClientFromEnv();

      await ingestChunkedFilings(client, newFilings, async (filing, result) => {
        // Track individual filing
        const filingId = `filing_${filing.accession_number.replace(/-/g, "")}`;

        await this.filingsRepo.create({
          id: filingId,
          accessionNumber: filing.accession_number,
          symbol: filing.symbol,
          filingType: filing.filing_type as FilingType,
          filedDate: filing.filed_date,
          ingestedAt: new Date().toISOString(),
        });

        if (result.successful.length > 0) {
          await this.filingsRepo.markComplete(
            filingId,
            filing.chunks.length,
            result.successful.length
          );
          filingsIngested++;
          chunksCreated += result.successful.length;
        } else if (result.failed.length > 0) {
          await this.filingsRepo.markFailed(filingId, result.failed.map((f) => f.error).join("; "));
        }

        if (onProgress) {
          onProgress({
            phase: "storing",
            symbol: filing.symbol,
            symbolsProcessed: config.symbols.indexOf(filing.symbol) + 1,
            symbolsTotal: config.symbols.length,
            filingsIngested,
            chunksCreated,
          });
        }
      });

      // Update progress
      await this.syncRunsRepo.updateProgress(runId, {
        symbolsProcessed: config.symbols.length,
        filingsFetched: complete?.filings_fetched ?? 0,
        filingsIngested,
        chunksCreated,
      });

      // Mark complete
      await this.syncRunsRepo.complete(runId, {
        filingsIngested,
        chunksCreated,
      });

      return {
        runId,
        success: true,
        symbolsProcessed: config.symbols.length,
        filingsFetched: complete?.filings_fetched ?? 0,
        filingsIngested,
        chunksCreated,
        durationMs: Date.now() - startTime,
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMessage);

      await this.syncRunsRepo.fail(runId, errorMessage);

      return {
        runId,
        success: false,
        symbolsProcessed: 0,
        filingsFetched: 0,
        filingsIngested,
        chunksCreated,
        durationMs: Date.now() - startTime,
        errors,
      };
    }
  }

  /**
   * Filter out filings that have already been ingested.
   */
  private async filterNewFilings(filings: ChunkedFilingEvent[]): Promise<ChunkedFilingEvent[]> {
    const newFilings: ChunkedFilingEvent[] = [];

    for (const filing of filings) {
      const exists = await this.filingsRepo.existsByAccessionNumber(filing.accession_number);
      if (!exists) {
        newFilings.push(filing);
      }
    }

    return newFilings;
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
 * Create a FilingsIngestionService from Turso client.
 */
export function createFilingsIngestionService(
  tursoClient: TursoClient,
  helixClient?: HelixClient,
  cwd?: string
): FilingsIngestionService {
  const filingsRepo = new FilingsRepository(tursoClient);
  const syncRunsRepo = new FilingSyncRunsRepository(tursoClient);

  return new FilingsIngestionService(filingsRepo, syncRunsRepo, helixClient, cwd);
}
