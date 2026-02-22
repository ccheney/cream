/**
 * Point-in-Time Universe Resolver
 *
 * Provides survivorship-bias-free universe resolution by using historical
 * index compositions and ticker changes. Essential for accurate historical testing.
 *
 * This resolver works with pre-populated cached data from the database.
 *
 * Impact of survivorship bias: 1-4% annual return inflation
 */

import type { IndexId } from "../repositories/historical-universe.types.js";
import type {
	IndexConstituentsRepository,
	TickerChangesRepository,
	UniverseSnapshotsRepository,
} from "../repositories/index.js";

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
	/** Whether to use cached snapshots */
	useCache?: boolean;
	/** Maximum age of cached snapshot in days */
	maxCacheAgeDays?: number;
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

/**
 * Resolves universe at historical dates for survivorship-bias-free historical testing.
 *
 * This resolver works with pre-populated cached data.
 *
 * @example
 * ```typescript
 * const resolver = new PointInTimeUniverseResolver(constituentsRepo, tickerChangesRepo, snapshotsRepo);
 * const result = await resolver.getUniverseAsOf("SP500", "2020-01-15");
 * console.log(`S&P 500 on 2020-01-15 had ${result.symbols.length} stocks`);
 * ```
 */
export class PointInTimeUniverseResolver {
	private readonly config: Required<PointInTimeResolverConfig>;

	constructor(
		private readonly constituentsRepo: IndexConstituentsRepository,
		private readonly tickerChangesRepo: TickerChangesRepository,
		private readonly snapshotsRepo: UniverseSnapshotsRepository,
		config: PointInTimeResolverConfig = {},
	) {
		this.config = {
			useCache: config.useCache ?? true,
			maxCacheAgeDays: config.maxCacheAgeDays ?? 30,
		};
	}

	async getUniverseAsOf(indexId: IndexId, asOfDate: string): Promise<PointInTimeResult> {
		const warnings: string[] = [];
		const cachedResult = await this.getCachedUniverse(indexId, asOfDate, warnings);
		if (cachedResult) {
			return cachedResult;
		}

		const constituents = await this.constituentsRepo.getConstituentsAsOf(indexId, asOfDate);
		if (constituents.length === 0) {
			warnings.push(`No historical data available for ${indexId} on ${asOfDate}`);
			return this.createResult([], asOfDate, indexId, false, warnings, this.createEmptyMetadata());
		}

		const metadata = await this.resolveHistoricalSymbols(constituents, asOfDate);
		return this.createResult(
			metadata.resolvedSymbols,
			asOfDate,
			indexId,
			false,
			warnings,
			metadata,
		);
	}

	private createEmptyMetadata(): PointInTimeResult["metadata"] {
		return {
			tickerChangesApplied: 0,
			delistedExcluded: [],
			tickerChangesMapped: new Map(),
		};
	}

	private createResult(
		symbols: string[],
		asOfDate: string,
		indexId: IndexId,
		fromCache: boolean,
		warnings: string[],
		metadata: PointInTimeResult["metadata"],
	): PointInTimeResult {
		return {
			symbols,
			asOfDate,
			indexId,
			fromCache,
			warnings,
			metadata,
		};
	}

	private async getCachedUniverse(
		indexId: IndexId,
		asOfDate: string,
		warnings: string[],
	): Promise<PointInTimeResult | null> {
		if (!this.config.useCache) {
			return null;
		}

		const exactSnapshot = await this.snapshotsRepo.get(indexId, asOfDate);
		if (exactSnapshot) {
			return this.createResult(
				exactSnapshot.tickers,
				asOfDate,
				indexId,
				true,
				[],
				this.createEmptyMetadata(),
			);
		}

		const closestSnapshot = await this.snapshotsRepo.getClosestBefore(indexId, asOfDate);
		if (!closestSnapshot) {
			return null;
		}

		const daysDiff = this.calculateDaysDifference(asOfDate, closestSnapshot.snapshotDate);
		if (daysDiff > this.config.maxCacheAgeDays) {
			return null;
		}

		warnings.push(
			`Using snapshot from ${closestSnapshot.snapshotDate} (${Math.round(daysDiff)} days before target)`,
		);
		return this.createResult(
			closestSnapshot.tickers,
			asOfDate,
			indexId,
			true,
			warnings,
			this.createEmptyMetadata(),
		);
	}

	private calculateDaysDifference(targetDate: string, snapshotDate: string): number {
		const targetTimestamp = new Date(targetDate).getTime();
		const snapshotTimestamp = new Date(snapshotDate).getTime();
		return Math.abs((targetTimestamp - snapshotTimestamp) / (1000 * 60 * 60 * 24));
	}

	private async resolveHistoricalSymbols(
		constituents: string[],
		asOfDate: string,
	): Promise<PointInTimeResult["metadata"] & { resolvedSymbols: string[] }> {
		const resolvedSymbols: string[] = [];
		const tickerChangesMapped = new Map<string, string>();
		let tickerChangesApplied = 0;

		for (const symbol of constituents) {
			const historicalSymbol = await this.tickerChangesRepo.resolveToHistoricalSymbol(
				symbol,
				asOfDate,
			);
			if (historicalSymbol !== symbol) {
				tickerChangesMapped.set(symbol, historicalSymbol);
				tickerChangesApplied++;
			}
			resolvedSymbols.push(historicalSymbol);
		}

		return {
			resolvedSymbols,
			tickerChangesApplied,
			delistedExcluded: [],
			tickerChangesMapped,
		};
	}

	async wasInIndex(indexId: IndexId, symbol: string, asOfDate: string): Promise<boolean> {
		const directMembership = await this.constituentsRepo.wasInIndexOnDate(
			indexId,
			symbol,
			asOfDate,
		);
		if (directMembership) {
			return true;
		}

		const historicalSymbol = await this.tickerChangesRepo.resolveToHistoricalSymbol(
			symbol,
			asOfDate,
		);
		if (historicalSymbol !== symbol) {
			return this.constituentsRepo.wasInIndexOnDate(indexId, historicalSymbol, asOfDate);
		}

		return false;
	}

	async resolveHistoricalTicker(currentSymbol: string, asOfDate: string): Promise<string> {
		return this.tickerChangesRepo.resolveToHistoricalSymbol(currentSymbol, asOfDate);
	}

	async resolveCurrentTicker(historicalSymbol: string): Promise<string> {
		return this.tickerChangesRepo.resolveToCurrentSymbol(historicalSymbol);
	}

	async validateDataCoverage(indexId: IndexId): Promise<DataValidationResult> {
		const issues: string[] = [];

		const constituentCount = await this.constituentsRepo.getConstituentCount(indexId);
		const currentConstituents = await this.constituentsRepo.getCurrentConstituents(indexId);

		const tickerChanges = await this.tickerChangesRepo.getChangesInRange(
			"1900-01-01",
			"2100-12-31",
		);

		const snapshotDates = await this.snapshotsRepo.listDates(indexId);

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
				`Constituent count (${constituentCount}) differs significantly from expected (${expected})`,
			);
		}

		if (constituentCount === 0) {
			issues.push(`No constituent data for ${indexId}`);
		}

		let earliestDate: string | null = null;
		let latestDate: string | null = null;

		if (currentConstituents.length > 0) {
			const dates = currentConstituents.map((c) => c.dateAdded).toSorted();
			earliestDate = dates[0] ?? null;
			latestDate = dates.at(-1) ?? null;
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
}

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
	config?: PointInTimeResolverConfig,
): PointInTimeUniverseResolver {
	return new PointInTimeUniverseResolver(
		constituentsRepo,
		tickerChangesRepo,
		snapshotsRepo,
		config,
	);
}
