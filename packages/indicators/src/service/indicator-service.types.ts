/**
 * Indicator Service Types
 */

import type {
	CorporateIndicators,
	IndicatorSnapshot,
	LiquidityIndicators,
	OHLCVBar,
	OptionsIndicators,
	PriceIndicators,
	QualityIndicators,
	Quote,
	SentimentIndicators,
	ShortInterestIndicators,
	ValueIndicators,
} from "../types";
import type { IndicatorCache } from "./indicator-cache";

/**
 * Market data provider interface.
 */
export interface MarketDataProvider {
	getBars(symbol: string, limit: number): Promise<OHLCVBar[]>;
	getQuote(symbol: string): Promise<Quote | null>;
}

/**
 * Options data provider interface.
 */
export interface OptionsDataProvider {
	getImpliedVolatility(symbol: string): Promise<number | null>;
	getIVSkew(symbol: string): Promise<number | null>;
	getPutCallRatio(symbol: string): Promise<number | null>;
}

/**
 * Price indicator calculator interface.
 */
export interface PriceCalculator {
	calculate(bars: OHLCVBar[]): PriceIndicators;
}

/**
 * Liquidity indicator calculator interface.
 */
export interface LiquidityCalculator {
	calculate(bars: OHLCVBar[], quote: Quote | null): LiquidityIndicators;
}

/**
 * Options indicator calculator interface.
 */
export interface OptionsCalculator {
	calculate(symbol: string, provider: OptionsDataProvider): Promise<OptionsIndicators>;
}

/**
 * Repository for fundamental indicators.
 */
export interface FundamentalRepository {
	getLatest(symbol: string): Promise<{ value: ValueIndicators; quality: QualityIndicators } | null>;
}

/**
 * Repository for short interest indicators.
 */
export interface ShortInterestRepository {
	getLatest(symbol: string): Promise<ShortInterestIndicators | null>;
}

/**
 * Repository for sentiment indicators.
 */
export interface SentimentRepository {
	getLatest(symbol: string): Promise<SentimentIndicators | null>;
}

/**
 * Repository for corporate actions indicators.
 */
export interface CorporateActionsRepository {
	getLatest(symbol: string): Promise<CorporateIndicators | null>;
}

export interface IndicatorServiceConfig {
	barsLookback: number;
	includeBatchIndicators: boolean;
	includeOptionsIndicators: boolean;
	enableCache: boolean;
	bypassCache: boolean;
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

export type BatchProgressCallback = (progress: BatchProgress) => void;

export interface BatchProgress {
	total: number;
	completed: number;
	cached: number;
	failed: number;
	currentSymbol?: string;
}

export interface BatchSnapshotOptions {
	concurrency?: number;
	onProgress?: BatchProgressCallback;
	bypassCache?: boolean;
}

export interface BatchSnapshotResult {
	snapshots: Map<string, IndicatorSnapshot>;
	errors: Map<string, string>;
	metadata: {
		total: number;
		successful: number;
		cached: number;
		failed: number;
		executionTimeMs: number;
	};
}

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
