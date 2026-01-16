/**
 * Indicator Service
 *
 * Main service layer for indicator calculation and retrieval.
 * Orchestrates calculators, caching, and persistence.
 */

export {
	type BatchRepositoryAdapters,
	CorporateActionsRepositoryAdapter,
	createBatchRepositoryAdapters,
	createCorporateActionsRepositoryAdapter,
	createFundamentalRepositoryAdapter,
	createSentimentRepositoryAdapter,
	createShortInterestRepositoryAdapter,
	FundamentalRepositoryAdapter,
	SentimentRepositoryAdapter,
	ShortInterestRepositoryAdapter,
	type StorageCorporateActionRow,
	type StorageCorporateActionsRepository,
	type StorageFundamentalRow,
	type StorageFundamentalsRepository,
	type StorageRepositories,
	type StorageSentimentRepository,
	type StorageSentimentRow,
	type StorageShortInterestRepository,
	type StorageShortInterestRow,
} from "./batch-data-adapter";
export {
	type CacheMetrics,
	type CacheTTLConfig,
	createIndicatorCache,
	DEFAULT_CACHE_CONFIG,
	DEFAULT_TTL_CONFIG,
	IndicatorCache,
	type IndicatorCacheConfig,
} from "./indicator-cache";
export {
	type BatchProgress,
	type BatchProgressCallback,
	type BatchSnapshotOptions,
	type BatchSnapshotResult,
	type CorporateActionsRepository,
	createIndicatorService,
	DEFAULT_SERVICE_CONFIG,
	type FundamentalRepository,
	IndicatorService,
	type IndicatorServiceConfig,
	type IndicatorServiceDependencies,
	type LiquidityCalculator,
	type MarketDataProvider,
	type OptionsCalculator,
	type OptionsDataProvider,
	type PriceCalculator,
	type SentimentRepository,
	type ShortInterestRepository,
} from "./indicator-service";
export { createLiquidityCalculator, LiquidityCalculatorAdapter } from "./liquidity-calculator";
export { createOptionsCalculator, OptionsCalculatorAdapter } from "./options-calculator";
export { createPriceCalculator, PriceCalculatorAdapter } from "./price-calculator";
