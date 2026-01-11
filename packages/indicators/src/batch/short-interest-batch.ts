/**
 * Short Interest Batch Job
 *
 * Fetches short interest data from FINRA API and stores in Turso.
 * Runs bi-monthly to align with FINRA's reporting schedule.
 *
 * FINRA publishes short interest data twice monthly:
 * - Mid-month (around 15th) for settlement date around 1st
 * - End-month (around last day) for settlement date around 15th
 *
 * Academic reference:
 * - Rapach et al (2016): Short Interest and Aggregate Stock Returns
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type {
  CreateShortInterestInput,
  ShortInterestRepository,
} from "@cream/storage/repositories";
import { log } from "../logger.js";
import type { BatchJobResult } from "./fundamentals-batch.js";

// ============================================
// Types
// ============================================

/**
 * FINRA Consolidated Short Interest API response format.
 *
 * Based on FINRA API documentation:
 * - Endpoint: https://api.finra.org/data/group/otcMarket/name/EquityShortInterest
 * - Auth: OAuth 2.0 Bearer token
 */
export interface FINRAShortInterestRecord {
  symbolCode: string;
  issueName: string;
  marketClassCode: string;
  settlementDate: string;
  currentShortPositionQuantity: number;
  previousShortPositionQuantity: number | null;
  changePreviousNumber: number | null;
  changePercent: number | null;
  averageDailyVolumeQuantity: number | null;
  daysToCoverQuantity: number | null;
  stockSplitFlag: string | null;
  revisionFlag: string | null;
}

/**
 * FINRA API query filter
 */
export interface FINRAQueryFilter {
  compareType: "EQUAL" | "GREATER_THAN" | "LESS_THAN" | "IN";
  fieldName: string;
  fieldValue: string | string[];
}

/**
 * FINRA API query request
 */
export interface FINRAQueryRequest {
  compareFilters?: FINRAQueryFilter[];
  orFilters?: FINRAQueryFilter[][];
  limit?: number;
  offset?: number;
  fields?: string[];
}

/**
 * FINRA API client interface for dependency injection.
 */
export interface FINRAClient {
  /**
   * Query consolidated short interest data.
   * @param request Query parameters
   * @returns Array of short interest records
   */
  queryShortInterest(request?: FINRAQueryRequest): Promise<FINRAShortInterestRecord[]>;

  /**
   * Get short interest for specific symbols on a specific date.
   * @param symbols Array of stock symbols
   * @param settlementDate Settlement date in YYYY-MM-DD format
   * @returns Array of short interest records
   */
  getShortInterestBySymbols(
    symbols: string[],
    settlementDate?: string
  ): Promise<FINRAShortInterestRecord[]>;

  /**
   * Get the most recent settlement date available.
   * @returns Settlement date in YYYY-MM-DD format
   */
  getLatestSettlementDate(): Promise<string>;
}

/**
 * Shares outstanding data provider for calculating short % of float.
 * This is needed because FINRA doesn't provide float shares data.
 */
export interface SharesOutstandingProvider {
  /**
   * Get shares outstanding and float for a symbol.
   * @param symbol Stock symbol
   * @returns Shares data or null if not available
   */
  getSharesData(symbol: string): Promise<{
    sharesOutstanding: number;
    floatShares: number | null;
  } | null>;
}

/**
 * Batch job configuration
 */
export interface ShortInterestBatchJobConfig {
  /** Rate limit delay between API calls in ms (default: 100ms) */
  rateLimitDelayMs?: number;
  /** Max retries per API call (default: 3) */
  maxRetries?: number;
  /** Retry delay in ms (default: 1000) */
  retryDelayMs?: number;
  /** Continue on individual symbol errors (default: true) */
  continueOnError?: boolean;
  /** Batch size for FINRA API queries (default: 100) */
  batchSize?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate unique ID for short interest record
 */
function generateId(): string {
  return `si_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate short % of float.
 *
 * From Rapach et al (2016): Short interest ratio is a key predictor
 * of stock returns, with high short interest indicating bearish sentiment.
 *
 * @param shortInterest Current short position quantity
 * @param floatShares Float shares (shares available for trading)
 * @returns Short % of float as decimal (0.15 = 15%), or null if not calculable
 */
export function calculateShortPctFloat(
  shortInterest: number,
  floatShares: number | null
): number | null {
  if (floatShares === null || floatShares <= 0) {
    return null;
  }
  const pct = shortInterest / floatShares;
  return Number.isFinite(pct) ? pct : null;
}

/**
 * Calculate short interest ratio (short interest / avg daily volume).
 *
 * This is equivalent to days to cover but using our own calculation
 * for consistency.
 *
 * @param shortInterest Current short position quantity
 * @param avgDailyVolume Average daily trading volume
 * @returns Short interest ratio, or null if not calculable
 */
export function calculateShortInterestRatio(
  shortInterest: number,
  avgDailyVolume: number | null
): number | null {
  if (avgDailyVolume === null || avgDailyVolume <= 0) {
    return null;
  }
  const ratio = shortInterest / avgDailyVolume;
  return Number.isFinite(ratio) ? ratio : null;
}

/**
 * Calculate short interest momentum (change from previous period).
 *
 * @param current Current short position quantity
 * @param previous Previous short position quantity
 * @returns Percentage change as decimal, or null if not calculable
 */
export function calculateShortInterestMomentum(
  current: number,
  previous: number | null
): number | null {
  if (previous === null || previous <= 0) {
    return null;
  }
  const change = (current - previous) / previous;
  return Number.isFinite(change) ? change : null;
}

// ============================================
// Batch Job Class
// ============================================

/**
 * Batch job for fetching and storing short interest data from FINRA.
 *
 * @example
 * ```typescript
 * const job = new ShortInterestBatchJob(finraClient, sharesProvider, repository);
 * const result = await job.run(symbols);
 * console.log(`Processed ${result.processed}, Failed ${result.failed}`);
 * ```
 */
export class ShortInterestBatchJob {
  private readonly finra: FINRAClient;
  private readonly sharesProvider: SharesOutstandingProvider | null;
  private readonly repo: ShortInterestRepository;
  private readonly config: Required<ShortInterestBatchJobConfig>;

  constructor(
    finra: FINRAClient,
    repo: ShortInterestRepository,
    sharesProvider?: SharesOutstandingProvider,
    config?: ShortInterestBatchJobConfig
  ) {
    this.finra = finra;
    this.repo = repo;
    this.sharesProvider = sharesProvider ?? null;
    this.config = {
      rateLimitDelayMs: config?.rateLimitDelayMs ?? 100,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      continueOnError: config?.continueOnError ?? true,
      batchSize: config?.batchSize ?? 100,
    };
  }

  /**
   * Run batch job for a list of symbols.
   *
   * Fetches short interest data from FINRA API, calculates additional
   * metrics (short % of float), and stores in repository.
   *
   * @param symbols List of stock symbols to process
   * @param settlementDate Optional specific settlement date (defaults to latest)
   * @returns Batch job result with processed/failed counts
   */
  async run(symbols: string[], settlementDate?: string): Promise<BatchJobResult> {
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    const errors: Array<{ symbol: string; error: string }> = [];

    log.info({ symbolCount: symbols.length, settlementDate }, "Starting short interest batch job");

    // Get latest settlement date if not provided
    const targetDate = settlementDate ?? (await this.getLatestDateWithRetry());
    log.info({ targetDate }, "Using settlement date");

    // Process in batches to respect FINRA API limits
    const batches = this.chunkArray(symbols, this.config.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch) {
        continue;
      }

      try {
        // Fetch short interest data from FINRA for this batch
        const finraData = await this.fetchWithRetry(batch, targetDate);

        // Create a map for quick lookup
        const finraMap = new Map<string, FINRAShortInterestRecord>();
        for (const record of finraData) {
          finraMap.set(record.symbolCode.toUpperCase(), record);
        }

        // Process each symbol
        for (const symbol of batch) {
          const upperSymbol = symbol.toUpperCase();
          const finraRecord = finraMap.get(upperSymbol);

          if (!finraRecord) {
            // No FINRA data for this symbol (may not be OTC-reported)
            log.debug({ symbol: upperSymbol }, "No FINRA data available");
            continue;
          }

          try {
            await this.processSymbol(finraRecord);
            processed++;
            log.debug(
              { symbol: upperSymbol, processed, total: symbols.length },
              "Processed symbol"
            );
          } catch (error) {
            failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ symbol: upperSymbol, error: errorMessage });
            log.warn({ symbol: upperSymbol, error: errorMessage }, "Failed to process symbol");

            if (!this.config.continueOnError) {
              throw error;
            }
          }
        }
      } catch (error) {
        // Batch-level failure
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(
          { batchIndex, batchSize: batch.length, error: errorMessage },
          "Failed to fetch batch from FINRA"
        );

        if (!this.config.continueOnError) {
          throw error;
        }

        // Mark all symbols in this batch as failed
        for (const symbol of batch) {
          failed++;
          errors.push({ symbol, error: `Batch fetch failed: ${errorMessage}` });
        }
      }

      // Rate limiting between batches
      if (batchIndex < batches.length - 1) {
        await sleep(this.config.rateLimitDelayMs);
      }
    }

    const durationMs = Date.now() - startTime;
    log.info({ processed, failed, durationMs }, "Completed short interest batch job");

    return { processed, failed, errors, durationMs };
  }

  /**
   * Process a single FINRA record and store in repository.
   */
  private async processSymbol(finraRecord: FINRAShortInterestRecord): Promise<void> {
    const symbol = finraRecord.symbolCode.toUpperCase();

    // Calculate short % of float if we have shares data
    let shortPctFloat: number | null = null;
    if (this.sharesProvider) {
      const sharesData = await this.sharesProvider.getSharesData(symbol);
      if (sharesData?.floatShares) {
        shortPctFloat = calculateShortPctFloat(
          finraRecord.currentShortPositionQuantity,
          sharesData.floatShares
        );
      }
    }

    // Calculate additional metrics
    const shortInterestRatio = calculateShortInterestRatio(
      finraRecord.currentShortPositionQuantity,
      finraRecord.averageDailyVolumeQuantity
    );

    const shortInterestChange = calculateShortInterestMomentum(
      finraRecord.currentShortPositionQuantity,
      finraRecord.previousShortPositionQuantity
    );

    // Build input for repository
    const input: CreateShortInterestInput = {
      id: generateId(),
      symbol,
      settlementDate: finraRecord.settlementDate,
      shortInterest: finraRecord.currentShortPositionQuantity,
      shortInterestRatio,
      daysToCover: finraRecord.daysToCoverQuantity,
      shortPctFloat,
      shortInterestChange,
      source: "FINRA",
    };

    // Upsert to handle duplicate settlement dates
    await this.repo.upsert(input);
  }

  /**
   * Fetch short interest data with retry logic.
   */
  private async fetchWithRetry(
    symbols: string[],
    settlementDate: string
  ): Promise<FINRAShortInterestRecord[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.finra.getShortInterestBySymbols(symbols, settlementDate);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * (attempt + 1);
          log.warn({ attempt, delay, error: lastError.message }, "Retrying FINRA API call");
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Failed to fetch from FINRA API");
  }

  /**
   * Get latest settlement date with retry logic.
   */
  private async getLatestDateWithRetry(): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.finra.getLatestSettlementDate();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries) {
          await sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error("Failed to get latest settlement date");
  }

  /**
   * Chunk an array into smaller arrays.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
