/**
 * Batch Data Adapter Types
 */

import type {
	CorporateActionsRepository,
	FundamentalRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "./indicator-service";

/**
 * Convert a Date to ISO date string (YYYY-MM-DD).
 */
export function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Storage FundamentalsRepository interface
 * Maps to @cream/storage FundamentalsRepository
 */
export interface StorageFundamentalsRepository {
	findLatestBySymbol(symbol: string): Promise<StorageFundamentalRow | null>;
}

export interface StorageFundamentalRow {
	id: string;
	symbol: string;
	date: string;
	peRatioTtm: number | null;
	peRatioForward: number | null;
	pbRatio: number | null;
	evEbitda: number | null;
	earningsYield: number | null;
	dividendYield: number | null;
	cape10yr: number | null;
	grossProfitability: number | null;
	roe: number | null;
	roa: number | null;
	assetGrowth: number | null;
	accrualsRatio: number | null;
	cashFlowQuality: number | null;
	beneishMScore: number | null;
	marketCap: number | null;
	sector: string | null;
	industry: string | null;
	source: string;
	computedAt: string;
}

/**
 * Storage ShortInterestRepository interface
 * Maps to @cream/storage ShortInterestRepository
 */
export interface StorageShortInterestRepository {
	findLatestBySymbol(symbol: string): Promise<StorageShortInterestRow | null>;
}

export interface StorageShortInterestRow {
	id: string;
	symbol: string;
	settlementDate: string;
	shortInterest: number;
	shortInterestRatio: number | null;
	daysToCover: number | null;
	shortPctFloat: number | null;
	shortInterestChange: number | null;
	source: string;
	fetchedAt: string;
}

/**
 * Storage SentimentRepository interface
 * Maps to @cream/storage SentimentRepository
 */
export interface StorageSentimentRepository {
	findLatestBySymbol(symbol: string): Promise<StorageSentimentRow | null>;
}

export interface StorageSentimentRow {
	id: string;
	symbol: string;
	date: string;
	sentimentScore: number | null;
	sentimentStrength: number | null;
	newsVolume: number | null;
	sentimentMomentum: number | null;
	eventRiskFlag: boolean;
	newsSentiment: number | null;
	socialSentiment: number | null;
	analystSentiment: number | null;
	computedAt: string;
}

/**
 * Storage CorporateActionsRepository interface
 * Maps to @cream/storage CorporateActionsRepository
 */
export interface StorageCorporateActionsRepository {
	getForSymbol(symbol: string): Promise<StorageCorporateActionRow[]>;
	getDividends(symbol: string): Promise<StorageCorporateActionRow[]>;
	getSplits(symbol: string): Promise<StorageCorporateActionRow[]>;
}

export interface StorageCorporateActionRow {
	id?: number;
	symbol: string;
	actionType: string;
	exDate: string;
	recordDate: string | null;
	payDate: string | null;
	ratio: number | null;
	amount: number | null;
	details: string | null;
	provider: string;
	createdAt?: string;
}

export interface StorageRepositories {
	fundamentals?: StorageFundamentalsRepository;
	shortInterest?: StorageShortInterestRepository;
	sentiment?: StorageSentimentRepository;
	corporateActions?: StorageCorporateActionsRepository;
}

export interface BatchRepositoryAdapters {
	fundamentalRepo?: FundamentalRepository;
	shortInterestRepo?: ShortInterestRepository;
	sentimentRepo?: SentimentRepository;
	corporateActionsRepo?: CorporateActionsRepository;
}
