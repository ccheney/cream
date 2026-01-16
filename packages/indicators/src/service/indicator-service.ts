/**
 * Indicator Service
 *
 * Main orchestration service for indicator calculation and retrieval.
 * Uses constructor injection for all dependencies to enable testing.
 *
 * Architecture:
 * - Real-time indicators (price, liquidity, options) are calculated on-demand
 * - Batch indicators (value, quality, short interest, sentiment, corporate) are fetched from PostgreSQL
 * - Results are merged into a unified IndicatorSnapshot
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { log } from "../logger";
import {
	type CorporateIndicators,
	createEmptyCorporateIndicators,
	createEmptyLiquidityIndicators,
	createEmptyMarketContext,
	createEmptyOptionsIndicators,
	createEmptyPriceIndicators,
	createEmptyQualityIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
	createEmptySnapshot,
	createEmptyValueIndicators,
	type DataQuality,
	type IndicatorSnapshot,
	type LiquidityIndicators,
	type OHLCVBar,
	type OptionsIndicators,
	type PriceIndicators,
	type QualityIndicators,
	type Quote,
	type SentimentIndicators,
	type ShortInterestIndicators,
	type ValueIndicators,
} from "../types";
import type { IndicatorCache } from "./indicator-cache";

// ============================================
// Helpers
// ============================================

/**
 * Chunk an array into smaller arrays of specified size.
 * Used for concurrent batch processing with rate limiting.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

// ============================================
// Provider Interfaces (for dependency injection)
// ============================================

/**
 * Market data provider interface
 * Implemented by @cream/marketdata
 */
export interface MarketDataProvider {
	getBars(symbol: string, limit: number): Promise<OHLCVBar[]>;
	getQuote(symbol: string): Promise<Quote | null>;
}

/**
 * Options data provider interface
 * Implemented by @cream/marketdata or execution-engine
 */
export interface OptionsDataProvider {
	getImpliedVolatility(symbol: string): Promise<number | null>;
	getIVSkew(symbol: string): Promise<number | null>;
	getPutCallRatio(symbol: string): Promise<number | null>;
}

// ============================================
// Calculator Interfaces (for dependency injection)
// ============================================

/**
 * Price indicator calculator interface
 */
export interface PriceCalculator {
	calculate(bars: OHLCVBar[]): PriceIndicators;
}

/**
 * Liquidity indicator calculator interface
 */
export interface LiquidityCalculator {
	calculate(bars: OHLCVBar[], quote: Quote | null): LiquidityIndicators;
}

/**
 * Options indicator calculator interface
 */
export interface OptionsCalculator {
	calculate(symbol: string, provider: OptionsDataProvider): Promise<OptionsIndicators>;
}

// ============================================
// Repository Interfaces (for batch indicators)
// ============================================

/**
 * Repository for fundamental (value + quality) indicators
 */
export interface FundamentalRepository {
	getLatest(symbol: string): Promise<{ value: ValueIndicators; quality: QualityIndicators } | null>;
}

/**
 * Repository for short interest indicators
 */
export interface ShortInterestRepository {
	getLatest(symbol: string): Promise<ShortInterestIndicators | null>;
}

/**
 * Repository for sentiment indicators
 */
export interface SentimentRepository {
	getLatest(symbol: string): Promise<SentimentIndicators | null>;
}

/**
 * Repository for corporate actions indicators
 */
export interface CorporateActionsRepository {
	getLatest(symbol: string): Promise<CorporateIndicators | null>;
}

// ============================================
// Service Configuration
// ============================================

export interface IndicatorServiceConfig {
	/** Number of bars to fetch for real-time calculations */
	barsLookback: number;
	/** Whether to fetch batch indicators from repositories */
	includeBatchIndicators: boolean;
	/** Whether to fetch options indicators */
	includeOptionsIndicators: boolean;
	/** Enable caching of indicator data */
	enableCache: boolean;
	/** Skip cache read (useful for forcing fresh data) */
	bypassCache: boolean;
	/** Concurrency limit for batch operations (default: 5) */
	batchConcurrency: number;
}

export const DEFAULT_SERVICE_CONFIG: IndicatorServiceConfig = {
	barsLookback: 200,
	includeBatchIndicators: true,
	includeOptionsIndicators: true,
	enableCache: true,
	bypassCache: false,
	batchConcurrency: 5,
};

// ============================================
// Batch Operation Types
// ============================================

/**
 * Progress callback for batch operations
 */
export type BatchProgressCallback = (progress: BatchProgress) => void;

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
	/** Total number of symbols being processed */
	total: number;
	/** Number of symbols completed */
	completed: number;
	/** Number of symbols fetched from cache */
	cached: number;
	/** Number of symbols with errors */
	failed: number;
	/** Current symbol being processed (if any) */
	currentSymbol?: string;
}

/**
 * Options for batch snapshot retrieval
 */
export interface BatchSnapshotOptions {
	/** Override concurrency limit for this batch */
	concurrency?: number;
	/** Progress callback for tracking batch progress */
	onProgress?: BatchProgressCallback;
	/** Skip cache for this batch (force fresh data) */
	bypassCache?: boolean;
}

/**
 * Result of a batch snapshot operation with metadata
 */
export interface BatchSnapshotResult {
	/** Map of symbol to snapshot */
	snapshots: Map<string, IndicatorSnapshot>;
	/** Symbols that failed with their error messages */
	errors: Map<string, string>;
	/** Metadata about the batch operation */
	metadata: {
		/** Total symbols requested */
		total: number;
		/** Successfully retrieved (including cached) */
		successful: number;
		/** Retrieved from cache */
		cached: number;
		/** Failed to retrieve */
		failed: number;
		/** Total execution time in ms */
		executionTimeMs: number;
	};
}

// ============================================
// Service Dependencies
// ============================================

export interface IndicatorServiceDependencies {
	marketData: MarketDataProvider;
	optionsData?: OptionsDataProvider;
	priceCalculator?: PriceCalculator;
	liquidityCalculator?: LiquidityCalculator;
	optionsCalculator?: OptionsCalculator;
	fundamentalRepo?: FundamentalRepository;
	shortInterestRepo?: ShortInterestRepository;
	sentimentRepo?: SentimentRepository;
	corporateActionsRepo?: CorporateActionsRepository;
	cache?: IndicatorCache;
}

// ============================================
// Service Implementation
// ============================================

/**
 * Main indicator service for calculating and retrieving indicator snapshots.
 *
 * @example
 * ```typescript
 * const service = new IndicatorService({
 *   marketData: alpacaProvider,
 *   priceCalculator: new PriceCalculatorImpl(),
 *   fundamentalRepo: new FundamentalRepoImpl(db),
 * });
 *
 * const snapshot = await service.getSnapshot("AAPL");
 * console.log(snapshot.price.rsi_14);
 * ```
 */
export class IndicatorService {
	private readonly config: IndicatorServiceConfig;
	private readonly deps: IndicatorServiceDependencies;

	constructor(deps: IndicatorServiceDependencies, config: Partial<IndicatorServiceConfig> = {}) {
		this.deps = deps;
		this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
	}

	/**
	 * Get a full indicator snapshot for a symbol.
	 *
	 * Combines real-time indicators (calculated on-demand) with
	 * batch indicators (fetched from repositories).
	 *
	 * Uses Promise.allSettled for resilient parallel execution -
	 * partial failures return available data with empty defaults for failed parts.
	 */
	async getSnapshot(symbol: string): Promise<IndicatorSnapshot> {
		const startTime = Date.now();
		const normalizedSymbol = symbol.toUpperCase();

		// Check cache first (unless bypassed)
		if (this.config.enableCache && !this.config.bypassCache && this.deps.cache) {
			const cached = this.deps.cache.getSnapshot(normalizedSymbol);
			if (cached) {
				log.debug({ symbol: normalizedSymbol, cached: true }, "Returning cached snapshot");
				return cached;
			}
		}

		try {
			// Fetch market data first (required for real-time calculations)
			const [barsResult, quoteResult] = await Promise.allSettled([
				this.deps.marketData.getBars(normalizedSymbol, this.config.barsLookback),
				this.deps.marketData.getQuote(normalizedSymbol),
			]);

			const bars = barsResult.status === "fulfilled" ? barsResult.value : [];
			const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;

			if (barsResult.status === "rejected") {
				log.warn({ symbol: normalizedSymbol, error: barsResult.reason }, "Failed to fetch bars");
			}
			if (quoteResult.status === "rejected") {
				log.warn({ symbol: normalizedSymbol, error: quoteResult.reason }, "Failed to fetch quote");
			}

			// Parallel fetch all indicators using Promise.allSettled for resilience
			const [
				priceResult,
				liquidityResult,
				optionsResult,
				fundamentalsResult,
				shortInterestResult,
				sentimentResult,
				corporateResult,
			] = await Promise.allSettled([
				Promise.resolve(this.calculatePriceIndicators(bars)),
				Promise.resolve(this.calculateLiquidityIndicators(bars, quote)),
				this.calculateOptionsIndicators(normalizedSymbol),
				this.fetchFundamentals(normalizedSymbol),
				this.fetchShortInterest(normalizedSymbol),
				this.fetchSentiment(normalizedSymbol),
				this.fetchCorporateActions(normalizedSymbol),
			]);

			// Extract results with defaults for failures
			const price =
				priceResult.status === "fulfilled" ? priceResult.value : createEmptyPriceIndicators();
			const liquidity =
				liquidityResult.status === "fulfilled"
					? liquidityResult.value
					: createEmptyLiquidityIndicators();
			const options =
				optionsResult.status === "fulfilled" ? optionsResult.value : createEmptyOptionsIndicators();
			const { value, quality } =
				fundamentalsResult.status === "fulfilled"
					? fundamentalsResult.value
					: { value: createEmptyValueIndicators(), quality: createEmptyQualityIndicators() };
			const shortInterest =
				shortInterestResult.status === "fulfilled"
					? shortInterestResult.value
					: createEmptyShortInterestIndicators();
			const sentiment =
				sentimentResult.status === "fulfilled"
					? sentimentResult.value
					: createEmptySentimentIndicators();
			const corporate =
				corporateResult.status === "fulfilled"
					? corporateResult.value
					: createEmptyCorporateIndicators();

			// Log any failures
			const failures: string[] = [];
			if (optionsResult.status === "rejected") {
				failures.push("options");
			}
			if (fundamentalsResult.status === "rejected") {
				failures.push("fundamentals");
			}
			if (shortInterestResult.status === "rejected") {
				failures.push("shortInterest");
			}
			if (sentimentResult.status === "rejected") {
				failures.push("sentiment");
			}
			if (corporateResult.status === "rejected") {
				failures.push("corporate");
			}

			if (failures.length > 0) {
				log.warn({ symbol: normalizedSymbol, failures }, "Partial failures in indicator fetch");
			}

			// Calculate data quality based on what's available
			const dataQuality = this.determineDataQuality(
				bars.length > 0,
				price,
				liquidity,
				value,
				shortInterest,
				sentiment
			);

			const now = Date.now();
			const snapshot: IndicatorSnapshot = {
				symbol: normalizedSymbol,
				timestamp: now,
				price,
				liquidity,
				options,
				value,
				quality,
				short_interest: shortInterest,
				sentiment,
				corporate,
				market: createEmptyMarketContext(),
				metadata: {
					price_updated_at: now,
					fundamentals_date:
						value.pe_ratio_ttm !== null ? new Date().toISOString().slice(0, 10) : null,
					short_interest_date: shortInterest.settlement_date,
					sentiment_date:
						sentiment.overall_score !== null ? new Date().toISOString().slice(0, 10) : null,
					data_quality: dataQuality,
					missing_fields: this.calculateMissingFields(price, liquidity, options),
				},
			};

			// Cache the result
			if (this.config.enableCache && this.deps.cache) {
				this.deps.cache.setSnapshot(normalizedSymbol, snapshot);
			}

			log.debug(
				{
					symbol: normalizedSymbol,
					duration: Date.now() - startTime,
					barsCount: bars.length,
					dataQuality,
					failures: failures.length,
				},
				"Generated indicator snapshot"
			);

			return snapshot;
		} catch (error) {
			log.error({ symbol: normalizedSymbol, error }, "Failed to generate indicator snapshot");
			throw error;
		}
	}

	/**
	 * Get only price-based indicators for a symbol.
	 * Faster than getSnapshot() when only price indicators are needed.
	 */
	async getPriceIndicators(symbol: string): Promise<PriceIndicators> {
		const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
		return this.calculatePriceIndicators(bars);
	}

	/**
	 * Get indicator snapshots for multiple symbols.
	 * Basic parallel execution with default concurrency.
	 * For more control, use getSnapshotsBatch().
	 */
	async getSnapshots(symbols: string[]): Promise<Map<string, IndicatorSnapshot>> {
		const result = await this.getSnapshotsBatch(symbols);
		return result.snapshots;
	}

	/**
	 * Get indicator snapshots for multiple symbols with full batch control.
	 *
	 * Features:
	 * - Configurable concurrency limit
	 * - Cache-first: checks cache before fetching
	 * - Progress callback for long-running operations
	 * - Per-symbol error tracking
	 * - Detailed execution metadata
	 *
	 * @example
	 * ```typescript
	 * const result = await service.getSnapshotsBatch(
	 *   ["AAPL", "MSFT", "GOOGL", ...largeList],
	 *   {
	 *     concurrency: 10,
	 *     onProgress: (progress) => {
	 *       console.log(`${progress.completed}/${progress.total}`);
	 *     }
	 *   }
	 * );
	 *
	 * console.log(`Success: ${result.metadata.successful}`);
	 * console.log(`Cached: ${result.metadata.cached}`);
	 * console.log(`Failed: ${result.metadata.failed}`);
	 * ```
	 */
	async getSnapshotsBatch(
		symbols: string[],
		options: BatchSnapshotOptions = {}
	): Promise<BatchSnapshotResult> {
		const startTime = Date.now();
		const concurrency = options.concurrency ?? this.config.batchConcurrency;
		const bypassCache = options.bypassCache ?? this.config.bypassCache;

		const snapshots = new Map<string, IndicatorSnapshot>();
		const errors = new Map<string, string>();
		let cachedCount = 0;
		let completed = 0;

		// Deduplicate and normalize symbols
		const normalizedSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
		const total = normalizedSymbols.length;

		if (total === 0) {
			return {
				snapshots,
				errors,
				metadata: {
					total: 0,
					successful: 0,
					cached: 0,
					failed: 0,
					executionTimeMs: Date.now() - startTime,
				},
			};
		}

		// Emit initial progress
		if (options.onProgress) {
			options.onProgress({ total, completed: 0, cached: 0, failed: 0 });
		}

		// Check cache first to determine which symbols need fetching
		const symbolsToFetch: string[] = [];

		if (this.config.enableCache && !bypassCache && this.deps.cache) {
			for (const symbol of normalizedSymbols) {
				const cached = this.deps.cache.getSnapshot(symbol);
				if (cached) {
					snapshots.set(symbol, cached);
					cachedCount++;
					completed++;
					log.debug({ symbol }, "Batch: Retrieved from cache");
				} else {
					symbolsToFetch.push(symbol);
				}
			}

			// Emit progress after cache check
			if (options.onProgress && cachedCount > 0) {
				options.onProgress({ total, completed, cached: cachedCount, failed: 0 });
			}
		} else {
			symbolsToFetch.push(...normalizedSymbols);
		}

		// Fetch remaining symbols in concurrent batches
		if (symbolsToFetch.length > 0) {
			const chunks = chunkArray(symbolsToFetch, concurrency);

			for (const chunk of chunks) {
				const chunkPromises = chunk.map(async (symbol) => {
					try {
						// Emit progress for current symbol
						if (options.onProgress) {
							options.onProgress({
								total,
								completed,
								cached: cachedCount,
								failed: errors.size,
								currentSymbol: symbol,
							});
						}

						const snapshot = await this.getSnapshot(symbol);
						snapshots.set(symbol, snapshot);
						completed++;
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						errors.set(symbol, errorMessage);
						snapshots.set(symbol, createEmptySnapshot(symbol));
						completed++;
						log.warn({ symbol, error: errorMessage }, "Batch: Failed to get snapshot");
					}
				});

				await Promise.all(chunkPromises);

				// Emit progress after each chunk
				if (options.onProgress) {
					options.onProgress({
						total,
						completed,
						cached: cachedCount,
						failed: errors.size,
					});
				}
			}
		}

		const executionTimeMs = Date.now() - startTime;

		log.info(
			{
				total,
				successful: snapshots.size - errors.size,
				cached: cachedCount,
				failed: errors.size,
				executionTimeMs,
			},
			"Batch snapshot operation completed"
		);

		return {
			snapshots,
			errors,
			metadata: {
				total,
				successful: snapshots.size - errors.size,
				cached: cachedCount,
				failed: errors.size,
				executionTimeMs,
			},
		};
	}

	/**
	 * Get only liquidity indicators for a symbol.
	 */
	async getLiquidityIndicators(symbol: string): Promise<LiquidityIndicators> {
		const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
		const quote = await this.deps.marketData.getQuote(symbol);
		return this.calculateLiquidityIndicators(bars, quote);
	}

	/**
	 * Get only options-derived indicators for a symbol.
	 */
	async getOptionsIndicators(symbol: string): Promise<OptionsIndicators> {
		return this.calculateOptionsIndicators(symbol);
	}

	// ============================================
	// Private: Real-time Calculations
	// ============================================

	private calculatePriceIndicators(bars: OHLCVBar[]): PriceIndicators {
		if (this.deps.priceCalculator) {
			return this.deps.priceCalculator.calculate(bars);
		}
		return createEmptyPriceIndicators();
	}

	private calculateLiquidityIndicators(bars: OHLCVBar[], quote: Quote | null): LiquidityIndicators {
		if (this.deps.liquidityCalculator) {
			return this.deps.liquidityCalculator.calculate(bars, quote);
		}
		return createEmptyLiquidityIndicators();
	}

	private async calculateOptionsIndicators(symbol: string): Promise<OptionsIndicators> {
		if (
			!this.config.includeOptionsIndicators ||
			!this.deps.optionsCalculator ||
			!this.deps.optionsData
		) {
			return createEmptyOptionsIndicators();
		}
		return this.deps.optionsCalculator.calculate(symbol, this.deps.optionsData);
	}

	// ============================================
	// Private: Batch Indicator Fetching
	// ============================================

	private async fetchFundamentals(
		symbol: string
	): Promise<{ value: ValueIndicators; quality: QualityIndicators }> {
		if (!this.config.includeBatchIndicators || !this.deps.fundamentalRepo) {
			return {
				value: createEmptyValueIndicators(),
				quality: createEmptyQualityIndicators(),
			};
		}

		const result = await this.deps.fundamentalRepo.getLatest(symbol);
		return (
			result ?? {
				value: createEmptyValueIndicators(),
				quality: createEmptyQualityIndicators(),
			}
		);
	}

	private async fetchShortInterest(symbol: string): Promise<ShortInterestIndicators> {
		if (!this.config.includeBatchIndicators || !this.deps.shortInterestRepo) {
			return createEmptyShortInterestIndicators();
		}
		return (
			(await this.deps.shortInterestRepo.getLatest(symbol)) ?? createEmptyShortInterestIndicators()
		);
	}

	private async fetchSentiment(symbol: string): Promise<SentimentIndicators> {
		if (!this.config.includeBatchIndicators || !this.deps.sentimentRepo) {
			return createEmptySentimentIndicators();
		}
		return (await this.deps.sentimentRepo.getLatest(symbol)) ?? createEmptySentimentIndicators();
	}

	private async fetchCorporateActions(symbol: string): Promise<CorporateIndicators> {
		if (!this.config.includeBatchIndicators || !this.deps.corporateActionsRepo) {
			return createEmptyCorporateIndicators();
		}
		return (
			(await this.deps.corporateActionsRepo.getLatest(symbol)) ?? createEmptyCorporateIndicators()
		);
	}

	// ============================================
	// Private: Helpers
	// ============================================

	private calculateMissingFields(
		price: PriceIndicators,
		liquidity: LiquidityIndicators,
		options: OptionsIndicators
	): string[] {
		const missing: string[] = [];

		if (price.rsi_14 === null) {
			missing.push("rsi_14");
		}
		if (price.atr_14 === null) {
			missing.push("atr_14");
		}
		if (liquidity.bid_ask_spread === null) {
			missing.push("bid_ask_spread");
		}
		if (options.atm_iv === null) {
			missing.push("implied_volatility");
		}

		return missing;
	}

	private determineDataQuality(
		hasMarketData: boolean,
		price: PriceIndicators,
		liquidity: LiquidityIndicators,
		value: ValueIndicators,
		shortInterest: ShortInterestIndicators,
		sentiment: SentimentIndicators
	): DataQuality {
		// Count how many indicator categories have data
		let availableCategories = 0;
		const _totalCategories = 6;

		if (hasMarketData && price.rsi_14 !== null) {
			availableCategories++;
		}
		if (liquidity.bid_ask_spread !== null || liquidity.vwap !== null) {
			availableCategories++;
		}
		if (value.pe_ratio_ttm !== null || value.pb_ratio !== null) {
			availableCategories++;
		}
		if (shortInterest.short_pct_float !== null) {
			availableCategories++;
		}
		if (sentiment.overall_score !== null) {
			availableCategories++;
		}
		// Options are optional, so only count if present
		// Corporate is also optional

		// Determine quality based on availability
		if (availableCategories >= 5) {
			return "COMPLETE";
		} else if (availableCategories >= 2) {
			return "PARTIAL";
		} else {
			return "STALE";
		}
	}

	/**
	 * Invalidate cache for a symbol.
	 * Call this when you know data has changed (e.g., after market data update).
	 */
	invalidateCache(symbol: string): void {
		if (this.deps.cache) {
			this.deps.cache.invalidate(symbol.toUpperCase());
		}
	}

	/**
	 * Invalidate only real-time cached data for a symbol.
	 * Call this on quote/trade updates to force recalculation of price/liquidity.
	 */
	invalidateRealtimeCache(symbol: string): void {
		if (this.deps.cache) {
			this.deps.cache.invalidateRealtime(symbol.toUpperCase());
		}
	}

	/**
	 * Get cache metrics for monitoring.
	 */
	getCacheMetrics() {
		if (this.deps.cache) {
			return this.deps.cache.getMetrics();
		}
		return null;
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an IndicatorService with minimal dependencies.
 * Useful for testing or when only price indicators are needed.
 */
export function createIndicatorService(
	marketData: MarketDataProvider,
	config?: Partial<IndicatorServiceConfig>
): IndicatorService {
	return new IndicatorService({ marketData }, config);
}
