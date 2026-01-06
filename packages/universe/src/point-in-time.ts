/**
 * Point-in-Time Universe Resolver
 *
 * Provides survivorship-bias-free universe resolution by using historical
 * index compositions and ticker changes. Essential for accurate backtesting.
 *
 * Impact of survivorship bias: 1-4% annual return inflation
 *
 * @see docs/plans/12-backtest.md - Survivorship Bias Prevention
 */

import type { IndexId } from "@cream/config";
import type {
  IndexConstituentsRepository,
  TickerChangesRepository,
  UniverseSnapshotsRepository,
} from "@cream/storage";
import { createFMPClient, type FMPClient, type FMPClientConfig } from "./fmp-client.js";

// ============================================
// Types
// ============================================

/**
 * Point-in-time resolution result
 */
export interface PointInTimeResult {
  /** Symbols valid on the target date */
  symbols: string[];
  /** The date resolved to */
  asOfDate: string;
  /** Index ID resolved */
  indexId: IndexId;
  /** Whether data came from cache */
  fromCache: boolean;
  /** Warnings during resolution */
  warnings: string[];
  /** Metadata */
  metadata: {
    /** Number of ticker changes applied */
    tickerChangesApplied: number;
    /** Symbols that were excluded due to delisting */
    delistedExcluded: string[];
    /** Symbols that had ticker changes */
    tickerChangesMapped: Map<string, string>;
  };
}

/**
 * Configuration for point-in-time resolver
 */
export interface PointInTimeResolverConfig {
  /** FMP client configuration */
  fmpConfig?: Partial<FMPClientConfig>;
  /** Whether to use cached snapshots */
  useCache?: boolean;
  /** Maximum age of cached snapshot in days */
  maxCacheAgeDays?: number;
  /** Whether to auto-populate missing data from FMP */
  autoPopulate?: boolean;
}

/**
 * Validation result for historical data
 */
export interface DataValidationResult {
  /** Whether data is valid */
  valid: boolean;
  /** Issues found */
  issues: string[];
  /** Coverage statistics */
  coverage: {
    indexId: IndexId;
    earliestDate: string | null;
    latestDate: string | null;
    constituentCount: number;
    tickerChangeCount: number;
    snapshotCount: number;
  };
}

// ============================================
// Point-in-Time Universe Resolver
// ============================================

/**
 * Resolves universe at historical dates for survivorship-bias-free backtesting.
 *
 * @example
 * ```typescript
 * const resolver = new PointInTimeUniverseResolver(client);
 * const result = await resolver.getUniverseAsOf("SP500", "2020-01-15");
 * console.log(`S&P 500 on 2020-01-15 had ${result.symbols.length} stocks`);
 * ```
 */
export class PointInTimeUniverseResolver {
  private fmpClient: FMPClient | null = null;
  private readonly config: Required<PointInTimeResolverConfig>;

  constructor(
    private readonly constituentsRepo: IndexConstituentsRepository,
    private readonly tickerChangesRepo: TickerChangesRepository,
    private readonly snapshotsRepo: UniverseSnapshotsRepository,
    config: PointInTimeResolverConfig = {}
  ) {
    this.config = {
      fmpConfig: config.fmpConfig ?? {},
      useCache: config.useCache ?? true,
      maxCacheAgeDays: config.maxCacheAgeDays ?? 30,
      autoPopulate: config.autoPopulate ?? false,
    };
  }

  /**
   * Get universe as of a specific date
   */
  async getUniverseAsOf(indexId: IndexId, asOfDate: string): Promise<PointInTimeResult> {
    const warnings: string[] = [];
    const tickerChangesMapped = new Map<string, string>();
    const delistedExcluded: string[] = [];
    let tickerChangesApplied = 0;
    let fromCache = false;

    // 1. Try to get from cached snapshot first
    if (this.config.useCache) {
      const snapshot = await this.snapshotsRepo.get(indexId, asOfDate);
      if (snapshot) {
        return {
          symbols: snapshot.tickers,
          asOfDate,
          indexId,
          fromCache: true,
          warnings: [],
          metadata: {
            tickerChangesApplied: 0,
            delistedExcluded: [],
            tickerChangesMapped: new Map(),
          },
        };
      }

      // Try closest snapshot before date
      const closestSnapshot = await this.snapshotsRepo.getClosestBefore(indexId, asOfDate);
      if (closestSnapshot) {
        const snapshotDate = new Date(closestSnapshot.snapshotDate);
        const targetDate = new Date(asOfDate);
        const daysDiff = Math.abs(
          (targetDate.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= this.config.maxCacheAgeDays) {
          fromCache = true;
          // Use snapshot but note it's approximate
          warnings.push(
            `Using snapshot from ${closestSnapshot.snapshotDate} (${Math.round(daysDiff)} days before target)`
          );
          return {
            symbols: closestSnapshot.tickers,
            asOfDate,
            indexId,
            fromCache: true,
            warnings,
            metadata: {
              tickerChangesApplied: 0,
              delistedExcluded: [],
              tickerChangesMapped: new Map(),
            },
          };
        }
      }
    }

    // 2. Try to resolve from constituent history in database
    const constituents = await this.constituentsRepo.getConstituentsAsOf(indexId, asOfDate);

    if (constituents.length > 0) {
      // Apply ticker changes to map historical tickers to what they were on that date
      const resolvedSymbols: string[] = [];

      for (const symbol of constituents) {
        // Check if symbol had a different ticker on that date
        const historicalSymbol = await this.tickerChangesRepo.resolveToHistoricalSymbol(
          symbol,
          asOfDate
        );

        if (historicalSymbol !== symbol) {
          tickerChangesMapped.set(symbol, historicalSymbol);
          tickerChangesApplied++;
        }

        resolvedSymbols.push(historicalSymbol);
      }

      return {
        symbols: resolvedSymbols,
        asOfDate,
        indexId,
        fromCache: false,
        warnings,
        metadata: {
          tickerChangesApplied,
          delistedExcluded,
          tickerChangesMapped,
        },
      };
    }

    // 3. Fall back to FMP API if autoPopulate is enabled
    if (this.config.autoPopulate) {
      const fmp = this.getFMPClient();
      const targetDate = new Date(asOfDate);

      try {
        const symbols = await fmp.getConstituentsAsOf(indexId, targetDate);

        // Cache the result
        await this.snapshotsRepo.save({
          snapshotDate: asOfDate,
          indexId,
          tickers: symbols,
          tickerCount: symbols.length,
          sourceVersion: "fmp-live",
        });

        return {
          symbols,
          asOfDate,
          indexId,
          fromCache: false,
          warnings: ["Fetched from FMP API (no cached data available)"],
          metadata: {
            tickerChangesApplied: 0,
            delistedExcluded: [],
            tickerChangesMapped: new Map(),
          },
        };
      } catch (error) {
        warnings.push(`FMP API error: ${error}`);
      }
    }

    // 4. No data available
    warnings.push(`No historical data available for ${indexId} on ${asOfDate}`);
    return {
      symbols: [],
      asOfDate,
      indexId,
      fromCache: false,
      warnings,
      metadata: {
        tickerChangesApplied: 0,
        delistedExcluded: [],
        tickerChangesMapped: new Map(),
      },
    };
  }

  /**
   * Check if a symbol was in an index on a specific date
   */
  async wasInIndex(indexId: IndexId, symbol: string, asOfDate: string): Promise<boolean> {
    // First check direct membership
    const directMembership = await this.constituentsRepo.wasInIndexOnDate(
      indexId,
      symbol,
      asOfDate
    );
    if (directMembership) return true;

    // Check if symbol might have had a different ticker on that date
    const historicalSymbol = await this.tickerChangesRepo.resolveToHistoricalSymbol(
      symbol,
      asOfDate
    );
    if (historicalSymbol !== symbol) {
      return this.constituentsRepo.wasInIndexOnDate(indexId, historicalSymbol, asOfDate);
    }

    return false;
  }

  /**
   * Resolve a ticker to its historical equivalent
   */
  async resolveHistoricalTicker(currentSymbol: string, asOfDate: string): Promise<string> {
    return this.tickerChangesRepo.resolveToHistoricalSymbol(currentSymbol, asOfDate);
  }

  /**
   * Resolve a historical ticker to its current equivalent
   */
  async resolveCurrentTicker(historicalSymbol: string): Promise<string> {
    return this.tickerChangesRepo.resolveToCurrentSymbol(historicalSymbol);
  }

  /**
   * Validate historical data coverage for an index
   */
  async validateDataCoverage(indexId: IndexId): Promise<DataValidationResult> {
    const issues: string[] = [];

    // Get constituent count and dates
    const constituentCount = await this.constituentsRepo.getConstituentCount(indexId);
    const currentConstituents = await this.constituentsRepo.getCurrentConstituents(indexId);

    // Get ticker changes
    const tickerChanges = await this.tickerChangesRepo.getChangesInRange("1900-01-01", "2100-12-31");

    // Get snapshot dates
    const snapshotDates = await this.snapshotsRepo.listDates(indexId);

    // Validation checks
    const expectedCounts: Record<string, number> = {
      SP500: 500,
      NASDAQ100: 100,
      DOWJONES: 30,
      RUSSELL2000: 2000,
      RUSSELL3000: 3000,
    };

    const expected = expectedCounts[indexId];
    if (expected && Math.abs(constituentCount - expected) > expected * 0.1) {
      issues.push(
        `Constituent count (${constituentCount}) differs significantly from expected (${expected})`
      );
    }

    if (constituentCount === 0) {
      issues.push(`No constituent data for ${indexId}`);
    }

    // Find date range
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    if (currentConstituents.length > 0) {
      const dates = currentConstituents.map((c) => c.dateAdded).sort();
      earliestDate = dates[0] ?? null;
      latestDate = dates[dates.length - 1] ?? null;
    }

    return {
      valid: issues.length === 0,
      issues,
      coverage: {
        indexId,
        earliestDate,
        latestDate,
        constituentCount,
        tickerChangeCount: tickerChanges.length,
        snapshotCount: snapshotDates.length,
      },
    };
  }

  /**
   * Populate historical data from FMP for a date range
   */
  async populateHistoricalData(
    indexId: IndexId,
    startDate: string,
    endDate: string
  ): Promise<{ snapshotsCreated: number; constituentsAdded: number }> {
    const fmp = this.getFMPClient();
    let snapshotsCreated = 0;
    let constituentsAdded = 0;

    // Fetch current constituents
    const currentConstituents = await fmp.getIndexConstituents(indexId);

    for (const constituent of currentConstituents) {
      await this.constituentsRepo.upsert({
        indexId,
        symbol: constituent.symbol,
        dateAdded: constituent.dateFirstAdded ?? startDate,
        dateRemoved: null,
        reasonAdded: "initial_load",
        sector: constituent.sector,
        provider: "fmp",
      });
      constituentsAdded++;
    }

    // Fetch historical changes
    try {
      const historicalChanges = await fmp.getHistoricalConstituents(indexId);

      for (const change of historicalChanges) {
        // Record removal
        if (change.removedTicker) {
          await this.constituentsRepo.upsert({
            indexId,
            symbol: change.removedTicker,
            dateAdded: "1900-01-01", // Unknown original add date
            dateRemoved: change.dateAdded,
            reasonRemoved: change.reason,
            provider: "fmp",
          });
        }

        // Record ticker change if it looks like a rename
        if (
          change.symbol &&
          change.removedTicker &&
          change.reason?.toLowerCase().includes("name")
        ) {
          await this.tickerChangesRepo.insert({
            oldSymbol: change.removedTicker,
            newSymbol: change.symbol,
            changeDate: change.dateAdded,
            changeType: "rename",
            reason: change.reason,
            provider: "fmp",
          });
        }
      }
    } catch {
      // Historical data may not be available for all indices
    }

    // Create a snapshot for the current date
    const today = new Date().toISOString().split("T")[0]!;
    const currentSymbols = currentConstituents.map((c) => c.symbol);

    await this.snapshotsRepo.save({
      snapshotDate: today,
      indexId,
      tickers: currentSymbols,
      tickerCount: currentSymbols.length,
      sourceVersion: "fmp-bulk-load",
    });
    snapshotsCreated++;

    return { snapshotsCreated, constituentsAdded };
  }

  private getFMPClient(): FMPClient {
    if (!this.fmpClient) {
      this.fmpClient = createFMPClient(this.config.fmpConfig);
    }
    return this.fmpClient;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a PointInTimeUniverseResolver.
 *
 * Note: Repositories must be created by the caller to avoid circular dependencies.
 *
 * @example
 * ```typescript
 * import { IndexConstituentsRepository, TickerChangesRepository, UniverseSnapshotsRepository } from "@cream/storage";
 *
 * const constituentsRepo = new IndexConstituentsRepository(client);
 * const tickerChangesRepo = new TickerChangesRepository(client);
 * const snapshotsRepo = new UniverseSnapshotsRepository(client);
 *
 * const resolver = createPointInTimeResolver(constituentsRepo, tickerChangesRepo, snapshotsRepo);
 * ```
 */
export function createPointInTimeResolver(
  constituentsRepo: IndexConstituentsRepository,
  tickerChangesRepo: TickerChangesRepository,
  snapshotsRepo: UniverseSnapshotsRepository,
  config?: PointInTimeResolverConfig
): PointInTimeUniverseResolver {
  return new PointInTimeUniverseResolver(
    constituentsRepo,
    tickerChangesRepo,
    snapshotsRepo,
    config
  );
}
