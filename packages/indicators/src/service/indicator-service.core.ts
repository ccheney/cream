import { log } from "../logger";
import {
	type CorporateIndicators,
	createEmptyCorporateIndicators,
	createEmptyLiquidityIndicators,
	createEmptyMarketContext,
	createEmptyOptionsIndicators,
	createEmptyPriceIndicators,
	createEmptySentimentIndicators,
	createEmptyShortInterestIndicators,
	createEmptySnapshot,
	type DataQuality,
	type IndicatorSnapshot,
	type LiquidityIndicators,
	type OHLCVBar,
	type OptionsIndicators,
	type PriceIndicators,
	type Quote,
	type SentimentIndicators,
	type ShortInterestIndicators,
} from "../types";
import {
	calculateMissingFields,
	collectFailures,
	createEmptyFundamentals,
	determineDataQuality,
	type Fundamentals,
	unwrapSettledValue,
} from "./indicator-service.helpers";
import {
	type BatchProgressCallback,
	type BatchSnapshotOptions,
	type BatchSnapshotResult,
	DEFAULT_SERVICE_CONFIG,
	type IndicatorServiceConfig,
	type IndicatorServiceDependencies,
	type MarketDataProvider,
} from "./indicator-service.types";
import { chunkArray, toDateString } from "./indicator-service.utils";

interface ResolvedIndicators {
	price: PriceIndicators;
	liquidity: LiquidityIndicators;
	options: OptionsIndicators;
	value: Fundamentals["value"];
	quality: Fundamentals["quality"];
	shortInterest: ShortInterestIndicators;
	sentiment: SentimentIndicators;
	corporate: CorporateIndicators;
	failures: string[];
}

interface MarketDataResult {
	bars: OHLCVBar[];
	quote: Quote | null;
}

interface BatchContext {
	total: number;
	concurrency: number;
	bypassCache: boolean;
	normalizedSymbols: string[];
	symbolsToFetch: string[];
	snapshots: Map<string, IndicatorSnapshot>;
	errors: Map<string, string>;
	cachedCount: number;
	completed: number;
	onProgress?: BatchProgressCallback;
}

export class IndicatorService {
	private readonly config: IndicatorServiceConfig;
	private readonly deps: IndicatorServiceDependencies;

	constructor(deps: IndicatorServiceDependencies, config: Partial<IndicatorServiceConfig> = {}) {
		this.deps = deps;
		this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
	}

	async getSnapshot(symbol: string): Promise<IndicatorSnapshot> {
		const startedAt = Date.now();
		const normalizedSymbol = symbol.toUpperCase();
		const cached = this.getCachedSnapshot(normalizedSymbol, this.config.bypassCache);
		if (cached) {
			return cached;
		}

		try {
			const { bars, quote } = await this.fetchMarketData(normalizedSymbol);
			const indicators = await this.resolveIndicators(normalizedSymbol, bars, quote);
			const snapshot = this.buildSnapshot(normalizedSymbol, bars.length > 0, indicators);
			this.cacheSnapshot(normalizedSymbol, snapshot);
			this.logSnapshotCompletion(
				normalizedSymbol,
				startedAt,
				bars.length,
				indicators.failures.length,
				snapshot.metadata.data_quality,
			);
			return snapshot;
		} catch (error) {
			log.error({ symbol: normalizedSymbol, error }, "Failed to generate indicator snapshot");
			throw error;
		}
	}

	async getPriceIndicators(symbol: string): Promise<PriceIndicators> {
		const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
		return this.calculatePriceIndicators(bars);
	}

	async getSnapshots(symbols: string[]): Promise<Map<string, IndicatorSnapshot>> {
		const result = await this.getSnapshotsBatch(symbols);
		return result.snapshots;
	}

	async getSnapshotsBatch(
		symbols: string[],
		options: BatchSnapshotOptions = {},
	): Promise<BatchSnapshotResult> {
		const startedAt = Date.now();
		const context = this.createBatchContext(symbols, options);
		if (context.total === 0) {
			return this.buildBatchResult(context, startedAt);
		}

		this.emitBatchProgress(context);
		this.populateBatchFromCache(context);
		await this.fetchBatchSnapshots(context);
		return this.buildBatchResult(context, startedAt);
	}

	async getLiquidityIndicators(symbol: string): Promise<LiquidityIndicators> {
		const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
		const quote = await this.deps.marketData.getQuote(symbol);
		return this.calculateLiquidityIndicators(bars, quote);
	}

	async getOptionsIndicators(symbol: string): Promise<OptionsIndicators> {
		return this.calculateOptionsIndicators(symbol);
	}

	private getCachedSnapshot(symbol: string, bypassCache: boolean): IndicatorSnapshot | null {
		if (!this.config.enableCache || bypassCache || !this.deps.cache) {
			return null;
		}
		const cached = this.deps.cache.getSnapshot(symbol);
		if (cached) {
			log.debug({ symbol, cached: true }, "Returning cached snapshot");
		}
		return cached;
	}

	private cacheSnapshot(symbol: string, snapshot: IndicatorSnapshot): void {
		if (this.config.enableCache && this.deps.cache) {
			this.deps.cache.setSnapshot(symbol, snapshot);
		}
	}

	private async fetchMarketData(symbol: string): Promise<MarketDataResult> {
		const [barsResult, quoteResult] = await Promise.allSettled([
			this.deps.marketData.getBars(symbol, this.config.barsLookback),
			this.deps.marketData.getQuote(symbol),
		]);

		if (barsResult.status === "rejected") {
			log.warn({ symbol, error: barsResult.reason }, "Failed to fetch bars");
		}
		if (quoteResult.status === "rejected") {
			log.warn({ symbol, error: quoteResult.reason }, "Failed to fetch quote");
		}

		return {
			bars: unwrapSettledValue(barsResult, []),
			quote: unwrapSettledValue(quoteResult, null),
		};
	}

	private async resolveIndicators(
		symbol: string,
		bars: OHLCVBar[],
		quote: Quote | null,
	): Promise<ResolvedIndicators> {
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
			this.calculateOptionsIndicators(symbol),
			this.fetchFundamentals(symbol),
			this.fetchShortInterest(symbol),
			this.fetchSentiment(symbol),
			this.fetchCorporateActions(symbol),
		]);

		const fundamentals = unwrapSettledValue(fundamentalsResult, createEmptyFundamentals());
		const failures = collectFailures([
			["options", optionsResult],
			["fundamentals", fundamentalsResult],
			["shortInterest", shortInterestResult],
			["sentiment", sentimentResult],
			["corporate", corporateResult],
		]);
		if (failures.length > 0) {
			log.warn({ symbol, failures }, "Partial failures in indicator fetch");
		}

		return {
			price: unwrapSettledValue(priceResult, createEmptyPriceIndicators()),
			liquidity: unwrapSettledValue(liquidityResult, createEmptyLiquidityIndicators()),
			options: unwrapSettledValue(optionsResult, createEmptyOptionsIndicators()),
			value: fundamentals.value,
			quality: fundamentals.quality,
			shortInterest: unwrapSettledValue(shortInterestResult, createEmptyShortInterestIndicators()),
			sentiment: unwrapSettledValue(sentimentResult, createEmptySentimentIndicators()),
			corporate: unwrapSettledValue(corporateResult, createEmptyCorporateIndicators()),
			failures,
		};
	}

	private buildSnapshot(
		symbol: string,
		hasMarketData: boolean,
		indicators: ResolvedIndicators,
	): IndicatorSnapshot {
		const now = Date.now();
		const dateString = toDateString(new Date(now));
		const dataQuality = determineDataQuality(
			hasMarketData,
			indicators.price,
			indicators.liquidity,
			indicators.value,
			indicators.shortInterest,
			indicators.sentiment,
		);

		return {
			symbol,
			timestamp: now,
			price: indicators.price,
			liquidity: indicators.liquidity,
			options: indicators.options,
			value: indicators.value,
			quality: indicators.quality,
			short_interest: indicators.shortInterest,
			sentiment: indicators.sentiment,
			corporate: indicators.corporate,
			market: createEmptyMarketContext(),
			metadata: {
				price_updated_at: now,
				fundamentals_date: indicators.value.pe_ratio_ttm !== null ? dateString : null,
				short_interest_date: indicators.shortInterest.settlement_date,
				sentiment_date: indicators.sentiment.overall_score !== null ? dateString : null,
				data_quality: dataQuality,
				missing_fields: calculateMissingFields(
					indicators.price,
					indicators.liquidity,
					indicators.options,
				),
			},
		};
	}

	private logSnapshotCompletion(
		symbol: string,
		startedAt: number,
		barsCount: number,
		failureCount: number,
		dataQuality: DataQuality,
	): void {
		log.debug(
			{
				symbol,
				duration: Date.now() - startedAt,
				barsCount,
				dataQuality,
				failures: failureCount,
			},
			"Generated indicator snapshot",
		);
	}

	private createBatchContext(symbols: string[], options: BatchSnapshotOptions): BatchContext {
		const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
		const concurrency = Math.max(1, options.concurrency ?? this.config.batchConcurrency);

		return {
			total: normalizedSymbols.length,
			concurrency,
			bypassCache: options.bypassCache ?? this.config.bypassCache,
			normalizedSymbols,
			symbolsToFetch: [...normalizedSymbols],
			snapshots: new Map<string, IndicatorSnapshot>(),
			errors: new Map<string, string>(),
			cachedCount: 0,
			completed: 0,
			onProgress: options.onProgress,
		};
	}

	private emitBatchProgress(context: BatchContext, currentSymbol?: string): void {
		if (!context.onProgress) {
			return;
		}

		context.onProgress({
			total: context.total,
			completed: context.completed,
			cached: context.cachedCount,
			failed: context.errors.size,
			currentSymbol,
		});
	}

	private populateBatchFromCache(context: BatchContext): void {
		if (!this.config.enableCache || context.bypassCache || !this.deps.cache) {
			return;
		}

		context.symbolsToFetch = [];
		for (const symbol of context.normalizedSymbols) {
			const cached = this.deps.cache.getSnapshot(symbol);
			if (!cached) {
				context.symbolsToFetch.push(symbol);
				continue;
			}

			context.snapshots.set(symbol, cached);
			context.cachedCount += 1;
			context.completed += 1;
			log.debug({ symbol }, "Batch: Retrieved from cache");
		}

		if (context.cachedCount > 0) {
			this.emitBatchProgress(context);
		}
	}

	private async fetchBatchSnapshots(context: BatchContext): Promise<void> {
		if (context.symbolsToFetch.length === 0) {
			return;
		}

		for (const symbolsChunk of chunkArray(context.symbolsToFetch, context.concurrency)) {
			await Promise.all(symbolsChunk.map((symbol) => this.fetchSnapshotForBatch(symbol, context)));
			this.emitBatchProgress(context);
		}
	}

	private async fetchSnapshotForBatch(symbol: string, context: BatchContext): Promise<void> {
		this.emitBatchProgress(context, symbol);
		try {
			const snapshot = await this.getSnapshot(symbol);
			context.snapshots.set(symbol, snapshot);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			context.errors.set(symbol, errorMessage);
			context.snapshots.set(symbol, createEmptySnapshot(symbol));
			log.warn({ symbol, error: errorMessage }, "Batch: Failed to get snapshot");
		} finally {
			context.completed += 1;
		}
	}

	private buildBatchResult(context: BatchContext, startedAt: number): BatchSnapshotResult {
		const executionTimeMs = Date.now() - startedAt;
		const successful = context.snapshots.size - context.errors.size;

		log.info(
			{
				total: context.total,
				successful,
				cached: context.cachedCount,
				failed: context.errors.size,
				executionTimeMs,
			},
			"Batch snapshot operation completed",
		);

		return {
			snapshots: context.snapshots,
			errors: context.errors,
			metadata: {
				total: context.total,
				successful,
				cached: context.cachedCount,
				failed: context.errors.size,
				executionTimeMs,
			},
		};
	}

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

	private async fetchFundamentals(symbol: string): Promise<Fundamentals> {
		if (!this.config.includeBatchIndicators || !this.deps.fundamentalRepo) {
			return createEmptyFundamentals();
		}
		return (await this.deps.fundamentalRepo.getLatest(symbol)) ?? createEmptyFundamentals();
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

	invalidateCache(symbol: string): void {
		if (this.deps.cache) {
			this.deps.cache.invalidate(symbol.toUpperCase());
		}
	}

	invalidateRealtimeCache(symbol: string): void {
		if (this.deps.cache) {
			this.deps.cache.invalidateRealtime(symbol.toUpperCase());
		}
	}

	getCacheMetrics() {
		if (this.deps.cache) {
			return this.deps.cache.getMetrics();
		}
		return null;
	}
}

export function createIndicatorService(
	marketData: MarketDataProvider,
	config?: Partial<IndicatorServiceConfig>,
): IndicatorService {
	return new IndicatorService({ marketData }, config);
}
