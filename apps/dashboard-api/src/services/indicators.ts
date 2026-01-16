/**
 * Indicator Service Factory
 *
 * Creates and configures the IndicatorService with all dependencies.
 * Uses lazy singleton pattern for efficient resource management.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	createBatchRepositoryAdapters,
	createIndicatorCache,
	createLiquidityCalculator,
	createOptionsCalculator,
	createPriceCalculator,
	IndicatorService,
	type MarketDataProvider,
	type OHLCVBar,
	type Quote,
	type StorageCorporateActionsRepository,
	type StorageFundamentalsRepository,
	type StorageRepositories,
	type StorageSentimentRepository,
	type StorageShortInterestRepository,
} from "@cream/indicators";
import type { AlpacaMarketDataClient } from "@cream/marketdata";
import {
	getCorporateActionsRepo,
	getFundamentalsRepo,
	getSentimentRepo,
	getShortInterestRepo,
} from "../db.js";
import { getAlpacaClient } from "../routes/market/types.js";
import { getSharedOptionsDataProvider } from "./shared-options-provider.js";

// ============================================
// Market Data Provider Adapter
// ============================================

/**
 * Adapts AlpacaMarketDataClient to the MarketDataProvider interface
 * expected by IndicatorService.
 */
class AlpacaMarketDataAdapter implements MarketDataProvider {
	constructor(private readonly client: AlpacaMarketDataClient) {}

	async getBars(symbol: string, limit: number): Promise<OHLCVBar[]> {
		// Calculate date range based on limit (assume daily bars need ~1.5x trading days)
		const to = new Date();
		const from = new Date();
		from.setDate(from.getDate() - Math.ceil(limit * 1.5));

		const bars = await this.client.getBars(
			symbol,
			"1Hour",
			from.toISOString().slice(0, 10),
			to.toISOString().slice(0, 10),
			limit
		);

		return bars.map((bar) => ({
			timestamp: new Date(bar.timestamp).getTime(),
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: bar.volume,
		}));
	}

	async getQuote(symbol: string): Promise<Quote | null> {
		try {
			const snapshots = await this.client.getSnapshots([symbol]);
			const snapshot = snapshots.get(symbol);

			if (!snapshot) {
				return null;
			}

			return {
				timestamp: new Date(snapshot.latestQuote?.timestamp ?? Date.now()).getTime(),
				bidPrice: snapshot.latestQuote?.bidPrice ?? 0,
				bidSize: snapshot.latestQuote?.bidSize ?? 0,
				askPrice: snapshot.latestQuote?.askPrice ?? 0,
				askSize: snapshot.latestQuote?.askSize ?? 0,
			};
		} catch {
			return null;
		}
	}
}

// ============================================
// Drizzle Repository Adapters
// ============================================

/**
 * Creates storage repository adapters from Drizzle repositories.
 * These adapt the Drizzle repositories to the interfaces expected by @cream/indicators.
 */
function createDrizzleRepositories(): StorageRepositories {
	return {
		fundamentals: createFundamentalsAdapter(),
		shortInterest: createShortInterestAdapter(),
		sentiment: createSentimentAdapter(),
		corporateActions: createCorporateActionsAdapter(),
	};
}

function createFundamentalsAdapter(): StorageFundamentalsRepository {
	const repo = getFundamentalsRepo();
	return {
		async findLatestBySymbol(symbol: string) {
			const results = await repo.findBySymbol(symbol.toUpperCase());
			const row = results?.[0];
			if (!row) {
				return null;
			}

			return {
				id: row.id,
				symbol: row.symbol,
				date: row.date,
				peRatioTtm: row.peRatioTtm,
				peRatioForward: row.peRatioForward,
				pbRatio: row.pbRatio,
				evEbitda: row.evEbitda,
				earningsYield: row.earningsYield,
				dividendYield: row.dividendYield,
				cape10yr: row.cape10yr,
				grossProfitability: row.grossProfitability,
				roe: row.roe,
				roa: row.roa,
				assetGrowth: row.assetGrowth,
				accrualsRatio: row.accrualsRatio,
				cashFlowQuality: row.cashFlowQuality,
				beneishMScore: row.beneishMScore,
				marketCap: row.marketCap,
				sector: row.sector,
				industry: row.industry,
				source: row.source ?? "computed",
				computedAt: row.computedAt,
			};
		},
	};
}

function createShortInterestAdapter(): StorageShortInterestRepository {
	const repo = getShortInterestRepo();
	return {
		async findLatestBySymbol(symbol: string) {
			const row = await repo.findLatestBySymbol(symbol.toUpperCase());
			if (!row) {
				return null;
			}

			return {
				id: row.id,
				symbol: row.symbol,
				settlementDate: row.settlementDate,
				shortInterest: row.shortInterest,
				shortInterestRatio: row.shortInterestRatio,
				daysToCover: row.daysToCover,
				shortPctFloat: row.shortPctFloat,
				shortInterestChange: row.shortInterestChange,
				source: row.source ?? "FINRA",
				fetchedAt: row.fetchedAt,
			};
		},
	};
}

function createSentimentAdapter(): StorageSentimentRepository {
	const repo = getSentimentRepo();
	return {
		async findLatestBySymbol(symbol: string) {
			const row = await repo.findLatestBySymbol(symbol.toUpperCase());
			if (!row) {
				return null;
			}

			return {
				id: row.id,
				symbol: row.symbol,
				date: row.date,
				sentimentScore: row.sentimentScore,
				sentimentStrength: row.sentimentStrength,
				newsVolume: row.newsVolume,
				sentimentMomentum: row.sentimentMomentum,
				eventRiskFlag: row.eventRiskFlag,
				newsSentiment: row.newsSentiment,
				socialSentiment: row.socialSentiment,
				analystSentiment: row.analystSentiment,
				computedAt: row.computedAt,
			};
		},
	};
}

function createCorporateActionsAdapter(): StorageCorporateActionsRepository {
	const repo = getCorporateActionsRepo();
	return {
		async getForSymbol(symbol: string) {
			const rows = await repo.getForSymbol(symbol.toUpperCase());
			return rows.map((row) => ({
				id: row.id,
				symbol: row.symbol,
				actionType:
					row.actionType === "split" || row.actionType === "reverse_split" ? "SPLIT" : "DIVIDEND",
				exDate: row.exDate,
				recordDate: row.recordDate,
				payDate: row.payDate,
				ratio: row.ratio,
				amount: row.amount,
				details: row.details,
				provider: row.provider.toUpperCase(),
				createdAt: row.createdAt,
			}));
		},
		async getDividends(symbol: string) {
			const rows = await repo.getDividends(symbol.toUpperCase());
			return rows.map((row) => ({
				id: row.id,
				symbol: row.symbol,
				actionType: "DIVIDEND",
				exDate: row.exDate,
				recordDate: row.recordDate,
				payDate: row.payDate,
				ratio: row.ratio,
				amount: row.amount,
				details: row.details,
				provider: row.provider.toUpperCase(),
				createdAt: row.createdAt,
			}));
		},
		async getSplits(symbol: string) {
			const rows = await repo.getSplits(symbol.toUpperCase());
			return rows.map((row) => ({
				id: row.id,
				symbol: row.symbol,
				actionType: "SPLIT",
				exDate: row.exDate,
				recordDate: row.recordDate,
				payDate: row.payDate,
				ratio: row.ratio,
				amount: row.amount,
				details: row.details,
				provider: row.provider.toUpperCase(),
				createdAt: row.createdAt,
			}));
		},
	};
}

// ============================================
// Singleton Factory
// ============================================

let indicatorService: IndicatorService | null = null;
let initPromise: Promise<IndicatorService> | null = null;

/**
 * Get or create the IndicatorService singleton.
 * Thread-safe lazy initialization with all dependencies wired.
 */
export async function getIndicatorService(): Promise<IndicatorService> {
	if (indicatorService) {
		return indicatorService;
	}

	if (initPromise) {
		return initPromise;
	}

	initPromise = initializeIndicatorService();

	try {
		indicatorService = await initPromise;
		return indicatorService;
	} catch (error) {
		initPromise = null;
		throw error;
	}
}

async function initializeIndicatorService(): Promise<IndicatorService> {
	// Get dependencies
	const alpacaClient = getAlpacaClient();

	// Create adapters
	const marketData = new AlpacaMarketDataAdapter(alpacaClient);
	const priceCalculator = createPriceCalculator();
	const liquidityCalculator = createLiquidityCalculator();
	const optionsCalculator = createOptionsCalculator();
	const cache = createIndicatorCache();

	// Create Drizzle repository adapters (compatible with storage interface)
	const drizzleRepos = createDrizzleRepositories();
	const batchRepos = createBatchRepositoryAdapters(drizzleRepos);

	// Get the shared options data provider (uses the shared WebSocket connection)
	const optionsData = getSharedOptionsDataProvider();

	// Create service with all dependencies
	const service = new IndicatorService(
		{
			marketData,
			priceCalculator,
			liquidityCalculator,
			optionsCalculator,
			cache,
			optionsData,
			fundamentalRepo: batchRepos.fundamentalRepo,
			shortInterestRepo: batchRepos.shortInterestRepo,
			sentimentRepo: batchRepos.sentimentRepo,
			corporateActionsRepo: batchRepos.corporateActionsRepo,
		},
		{
			barsLookback: 200,
			includeBatchIndicators: true,
			includeOptionsIndicators: true,
			enableCache: true,
			bypassCache: false,
			batchConcurrency: 5,
		}
	);

	return service;
}

/**
 * Reset the service singleton (for testing).
 */
export function resetIndicatorService(): void {
	indicatorService = null;
	initPromise = null;
}
