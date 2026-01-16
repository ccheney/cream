/**
 * Batch Data Adapter
 *
 * Adapts the storage repositories to the interfaces expected
 * by the IndicatorService. This bridges the gap between:
 * - @cream/storage repositories (FundamentalsRepository, etc.)
 * - @cream/indicators service interfaces (FundamentalRepository, etc.)
 *
 * The adapter transforms row formats and handles the data mapping
 * between the two layers.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type {
	CorporateIndicators,
	QualityIndicators,
	SentimentIndicators,
	ShortInterestIndicators,
	ValueIndicators,
} from "../types";
import type {
	CorporateActionsRepository,
	FundamentalRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "./indicator-service";

// ============================================
// Helpers
// ============================================

/**
 * Convert a Date to ISO date string (YYYY-MM-DD) safely.
 * Avoids non-null assertions on split result.
 */
function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

// ============================================
// Storage Repository Types (from @cream/storage)
// ============================================

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
	details: Record<string, unknown> | null;
	provider: string;
	createdAt?: string;
}

// ============================================
// Adapter: FundamentalRepository
// ============================================

/**
 * Adapts StorageFundamentalsRepository to FundamentalRepository interface.
 * Transforms storage row format to ValueIndicators + QualityIndicators.
 */
export class FundamentalRepositoryAdapter implements FundamentalRepository {
	constructor(private repo: StorageFundamentalsRepository) {}

	async getLatest(
		symbol: string
	): Promise<{ value: ValueIndicators; quality: QualityIndicators } | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return {
			value: {
				pe_ratio_ttm: row.peRatioTtm,
				pe_ratio_forward: row.peRatioForward,
				pb_ratio: row.pbRatio,
				ev_ebitda: row.evEbitda,
				earnings_yield: row.earningsYield,
				dividend_yield: row.dividendYield,
				cape_10yr: row.cape10yr,
			},
			quality: {
				gross_profitability: row.grossProfitability,
				roe: row.roe,
				roa: row.roa,
				asset_growth: row.assetGrowth,
				accruals_ratio: row.accrualsRatio,
				cash_flow_quality: row.cashFlowQuality,
				beneish_m_score: row.beneishMScore,
				earnings_quality: null, // Derived field, not stored directly
			},
		};
	}
}

// ============================================
// Adapter: ShortInterestRepository
// ============================================

/**
 * Adapts StorageShortInterestRepository to ShortInterestRepository interface.
 * Transforms storage row format to ShortInterestIndicators.
 */
export class ShortInterestRepositoryAdapter implements ShortInterestRepository {
	constructor(private repo: StorageShortInterestRepository) {}

	async getLatest(symbol: string): Promise<ShortInterestIndicators | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return {
			short_interest_ratio: row.shortInterestRatio,
			days_to_cover: row.daysToCover,
			short_pct_float: row.shortPctFloat,
			short_interest_change: row.shortInterestChange,
			settlement_date: row.settlementDate,
		};
	}
}

// ============================================
// Adapter: SentimentRepository
// ============================================

/**
 * Adapts StorageSentimentRepository to SentimentRepository interface.
 * Transforms storage row format to SentimentIndicators.
 */
export class SentimentRepositoryAdapter implements SentimentRepository {
	constructor(private repo: StorageSentimentRepository) {}

	async getLatest(symbol: string): Promise<SentimentIndicators | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return {
			overall_score: row.sentimentScore,
			sentiment_strength: row.sentimentStrength,
			news_volume: row.newsVolume,
			sentiment_momentum: row.sentimentMomentum,
			event_risk: row.eventRiskFlag,
			classification: this.classifySentiment(row.sentimentScore),
		};
	}

	private classifySentiment(
		score: number | null
	): "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH" | null {
		if (score === null) {
			return null;
		}
		if (score >= 0.6) {
			return "STRONG_BULLISH";
		}
		if (score >= 0.2) {
			return "BULLISH";
		}
		if (score >= -0.2) {
			return "NEUTRAL";
		}
		if (score >= -0.6) {
			return "BEARISH";
		}
		return "STRONG_BEARISH";
	}
}

// ============================================
// Adapter: CorporateActionsRepository
// ============================================

/**
 * Adapts StorageCorporateActionsRepository to CorporateActionsRepository interface.
 * Transforms storage row format to CorporateIndicators.
 */
export class CorporateActionsRepositoryAdapter implements CorporateActionsRepository {
	constructor(private repo: StorageCorporateActionsRepository) {}

	async getLatest(symbol: string): Promise<CorporateIndicators | null> {
		const [dividends, splits] = await Promise.all([
			this.repo.getDividends(symbol),
			this.repo.getSplits(symbol),
		]);

		if (dividends.length === 0 && splits.length === 0) {
			return null;
		}

		const today = new Date();
		const trailingDividendYield = this.calculateTrailingDividendYield(dividends);
		const exDividendDays = this.calculateDaysUntilExDividend(dividends, today);
		const recentSplit = this.hasRecentSplit(splits, today);

		return {
			trailing_dividend_yield: trailingDividendYield,
			ex_dividend_days: exDividendDays,
			upcoming_earnings_days: null, // Not stored in corporate_actions table
			recent_split: recentSplit,
		};
	}

	private calculateTrailingDividendYield(dividends: StorageCorporateActionRow[]): number | null {
		if (dividends.length === 0) {
			return null;
		}

		const oneYearAgo = new Date();
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
		const oneYearAgoStr = toDateString(oneYearAgo);

		const trailingDividends = dividends.filter((d) => d.exDate >= oneYearAgoStr);
		if (trailingDividends.length === 0) {
			return null;
		}

		const totalAmount = trailingDividends.reduce((sum, d) => sum + (d.amount ?? 0), 0);
		return totalAmount > 0 ? totalAmount : null;
	}

	private calculateDaysUntilExDividend(
		dividends: StorageCorporateActionRow[],
		today: Date
	): number | null {
		const todayStr = toDateString(today);
		const upcomingDividends = dividends.filter((d) => d.exDate > todayStr);

		if (upcomingDividends.length === 0) {
			return null;
		}

		const nextExDate = upcomingDividends[upcomingDividends.length - 1]?.exDate;
		if (!nextExDate) {
			return null;
		}
		const exDate = new Date(nextExDate);
		const diffTime = exDate.getTime() - today.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		return diffDays;
	}

	private hasRecentSplit(splits: StorageCorporateActionRow[], today: Date): boolean {
		if (splits.length === 0) {
			return false;
		}

		const sixMonthsAgo = new Date(today);
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
		const sixMonthsAgoStr = toDateString(sixMonthsAgo);

		return splits.some((s) => s.exDate >= sixMonthsAgoStr);
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a FundamentalRepository adapter from a storage repository
 */
export function createFundamentalRepositoryAdapter(
	repo: StorageFundamentalsRepository
): FundamentalRepository {
	return new FundamentalRepositoryAdapter(repo);
}

/**
 * Create a ShortInterestRepository adapter from a storage repository
 */
export function createShortInterestRepositoryAdapter(
	repo: StorageShortInterestRepository
): ShortInterestRepository {
	return new ShortInterestRepositoryAdapter(repo);
}

/**
 * Create a SentimentRepository adapter from a storage repository
 */
export function createSentimentRepositoryAdapter(
	repo: StorageSentimentRepository
): SentimentRepository {
	return new SentimentRepositoryAdapter(repo);
}

/**
 * Create a CorporateActionsRepository adapter from a storage repository
 */
export function createCorporateActionsRepositoryAdapter(
	repo: StorageCorporateActionsRepository
): CorporateActionsRepository {
	return new CorporateActionsRepositoryAdapter(repo);
}

// ============================================
// All-in-One Factory
// ============================================

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

/**
 * Create all batch repository adapters from storage repositories.
 * Only creates adapters for repositories that are provided.
 */
export function createBatchRepositoryAdapters(repos: StorageRepositories): BatchRepositoryAdapters {
	const adapters: BatchRepositoryAdapters = {};

	if (repos.fundamentals) {
		adapters.fundamentalRepo = createFundamentalRepositoryAdapter(repos.fundamentals);
	}

	if (repos.shortInterest) {
		adapters.shortInterestRepo = createShortInterestRepositoryAdapter(repos.shortInterest);
	}

	if (repos.sentiment) {
		adapters.sentimentRepo = createSentimentRepositoryAdapter(repos.sentiment);
	}

	if (repos.corporateActions) {
		adapters.corporateActionsRepo = createCorporateActionsRepositoryAdapter(repos.corporateActions);
	}

	return adapters;
}
