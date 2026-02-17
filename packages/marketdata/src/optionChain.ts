/**
 * Option Chain Scanning and Filtering
 *
 * Provides intelligent option chain scanning with filtering by:
 * - DTE (days to expiration)
 * - Delta range (OTM, ATM, ITM)
 * - Liquidity (volume, open interest, bid-ask spread)
 * - IV percentile
 *
 * @see docs/plans/08-options.md (Option Candidate Selection)
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { passesOptionFilter } from "./optionChain-filter.js";
import {
	DEFAULT_FILTERS,
	type GreeksProvider,
	type OptionFilterCriteria,
	type OptionWithMarketData,
	type ScoringWeights,
} from "./optionChain-types.js";
import type { IVPercentileCalculator } from "./options/ivPercentile";
import type { AlpacaMarketDataClient } from "./providers/alpaca";

export * from "./optionChain-types.js";
export { buildOptionTicker, calculateDte, parseOptionTicker } from "./optionChain-utils.js";

const DEFAULT_WEIGHTS: ScoringWeights = {
	liquidity: 0.3,
	spread: 0.25,
	delta: 0.2,
	iv: 0.15,
	dte: 0.1,
};

/**
 * Cache entry for option chain data.
 */
interface CacheEntry {
	data: OptionWithMarketData[];
	timestamp: number;
	underlyingPrice: number;
}

/**
 * Option chain scanner with filtering and ranking.
 */
export class OptionChainScanner {
	private client: AlpacaMarketDataClient;
	private cache: Map<string, CacheEntry> = new Map();
	private cacheTtlMs: number;
	private priceInvalidationPct: number;
	private ivPercentileCalculator?: IVPercentileCalculator;

	/**
	 * Create a new scanner.
	 */
	constructor(
		client: AlpacaMarketDataClient,
		cacheTtlMs = 5 * 60 * 1000,
		priceInvalidationPct = 0.01,
		ivPercentileCalculator?: IVPercentileCalculator,
	) {
		this.client = client;
		this.cacheTtlMs = cacheTtlMs;
		this.priceInvalidationPct = priceInvalidationPct;
		this.ivPercentileCalculator = ivPercentileCalculator;
	}

	/**
	 * Set the IV percentile calculator.
	 */
	setIVPercentileCalculator(calculator: IVPercentileCalculator): void {
		this.ivPercentileCalculator = calculator;
	}

	/**
	 * Scan and filter option chain for candidates.
	 */
	async scan(
		underlying: string,
		filter: OptionFilterCriteria,
		greeksProvider?: GreeksProvider,
	): Promise<OptionWithMarketData[]> {
		const cached = this.getCached(underlying);
		if (cached) {
			if (this.needsIVPercentile(filter)) {
				await this.enrichWithIVPercentile(cached, underlying);
			}
			return this.filterAndRank(cached, filter);
		}

		const chain = await this.fetchChain(underlying);
		if (greeksProvider) {
			await this.enrichWithGreeks(chain, greeksProvider);
		}

		if (this.needsIVPercentile(filter)) {
			await this.enrichWithIVPercentile(chain, underlying);
		}

		const underlyingPrice = await this.getUnderlyingPrice(underlying);
		this.setCache(underlying, chain, underlyingPrice);

		return this.filterAndRank(chain, filter);
	}

	/**
	 * Get top candidates for a strategy.
	 */
	async getTopCandidates(
		underlying: string,
		strategy: keyof typeof DEFAULT_FILTERS,
		topN = 5,
		greeksProvider?: GreeksProvider,
	): Promise<OptionWithMarketData[]> {
		const filter = DEFAULT_FILTERS[strategy];
		if (!filter) {
			throw new Error(`No default filter defined for strategy: ${strategy}`);
		}
		const candidates = await this.scan(underlying, filter, greeksProvider);
		return candidates.slice(0, topN);
	}

	/**
	 * Clear cache for a symbol or all symbols.
	 */
	clearCache(underlying?: string): void {
		if (underlying) {
			this.cache.delete(underlying);
		} else {
			this.cache.clear();
		}
	}

	/**
	 * Check if cache should be invalidated due to price move.
	 */
	async shouldInvalidateCache(underlying: string): Promise<boolean> {
		const entry = this.cache.get(underlying);
		if (!entry) {
			return false;
		}

		const currentPrice = await this.getUnderlyingPrice(underlying);
		const priceDiff = Math.abs(currentPrice - entry.underlyingPrice) / entry.underlyingPrice;

		return priceDiff > this.priceInvalidationPct;
	}

	/**
	 * Check if filter requires IV percentile calculation.
	 */
	private needsIVPercentile(filter: OptionFilterCriteria): boolean {
		return (
			this.ivPercentileCalculator !== undefined &&
			(filter.minIvPercentile !== undefined || filter.maxIvPercentile !== undefined)
		);
	}

	/**
	 * Enrich options with IV percentile data.
	 */
	private async enrichWithIVPercentile(
		options: OptionWithMarketData[],
		underlying: string,
	): Promise<void> {
		if (!this.ivPercentileCalculator) {
			return;
		}

		const optionsWithIV = options.filter((opt) => opt.iv !== undefined);
		if (optionsWithIV.length === 0) {
			return;
		}

		const avgIV = optionsWithIV.reduce((sum, opt) => sum + (opt.iv ?? 0), 0) / optionsWithIV.length;
		const result = await this.ivPercentileCalculator.calculate(underlying, avgIV);
		if (!result) {
			return;
		}

		for (const option of options) {
			if (option.iv === undefined) {
				continue;
			}

			const optionResult = await this.ivPercentileCalculator.calculate(underlying, option.iv);
			if (optionResult) {
				option.ivPercentile = optionResult.percentile;
				option.ivPercentileData = optionResult;
			}
		}
	}

	/**
	 * Check cache validity.
	 */
	private getCached(underlying: string): OptionWithMarketData[] | undefined {
		const entry = this.cache.get(underlying);
		if (!entry) {
			return undefined;
		}

		if (Date.now() - entry.timestamp > this.cacheTtlMs) {
			this.cache.delete(underlying);
			return undefined;
		}

		return entry.data;
	}

	/**
	 * Set cache entry.
	 */
	private setCache(
		underlying: string,
		data: OptionWithMarketData[],
		underlyingPrice: number,
	): void {
		this.cache.set(underlying, {
			data,
			timestamp: Date.now(),
			underlyingPrice,
		});
	}

	/**
	 * Fetch raw option chain from provider.
	 */
	private async fetchChain(underlying: string): Promise<OptionWithMarketData[]> {
		const contracts = await this.client.getOptionContracts(underlying, {
			limit: 1000,
		});
		if (contracts.length === 0) {
			return [];
		}

		const today = new Date();
		return contracts.map((contract) => {
			const expDate = new Date(contract.expirationDate);
			const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
			return {
				ticker: contract.symbol,
				underlying: contract.underlyingSymbol,
				type: contract.type,
				expiration: contract.expirationDate,
				strike: contract.strikePrice,
				dte,
			};
		});
	}

	/**
	 * Get underlying price.
	 */
	private async getUnderlyingPrice(underlying: string): Promise<number> {
		const snapshots = await this.client.getSnapshots([underlying]);
		const snapshot = snapshots.get(underlying);
		return snapshot?.latestTrade?.price ?? snapshot?.dailyBar?.close ?? 0;
	}

	/**
	 * Enrich options with greeks from provider.
	 */
	private async enrichWithGreeks(
		options: OptionWithMarketData[],
		provider: GreeksProvider,
	): Promise<void> {
		const greeks = await provider(options.map((o) => o.ticker));

		for (const option of options) {
			const g = greeks.get(option.ticker);
			if (!g) {
				continue;
			}

			option.delta = g.delta;
			option.gamma = g.gamma;
			option.theta = g.theta;
			option.vega = g.vega;
			option.iv = g.iv;
			option.bid = g.bid;
			option.ask = g.ask;
			option.mid = g.bid !== undefined && g.ask !== undefined ? (g.bid + g.ask) / 2 : undefined;
			option.spread = g.bid !== undefined && g.ask !== undefined ? g.ask - g.bid : undefined;
			option.spreadPct = option.mid && option.spread ? option.spread / option.mid : undefined;
			option.lastPrice = g.lastPrice;
			option.volume = g.volume;
			option.openInterest = g.openInterest;
		}
	}

	/**
	 * Filter and rank options.
	 */
	private filterAndRank(
		options: OptionWithMarketData[],
		filter: OptionFilterCriteria,
		weights: ScoringWeights = DEFAULT_WEIGHTS,
	): OptionWithMarketData[] {
		let filtered = options.filter((opt) => this.passesFilter(opt, filter));

		filtered = filtered.map((opt) => ({
			...opt,
			liquidityScore: this.calculateLiquidityScore(opt),
			overallScore: this.calculateOverallScore(opt, filter, weights),
		}));

		filtered.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
		return filtered;
	}

	private passesFilter(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
		return passesOptionFilter(option, filter);
	}

	/**
	 * Calculate liquidity score (0-100).
	 */
	private calculateLiquidityScore(option: OptionWithMarketData): number {
		let score = 0;

		if (option.volume !== undefined) {
			score += Math.min(40, option.volume / 25);
		}

		if (option.openInterest !== undefined) {
			score += Math.min(40, option.openInterest / 125);
		}

		if (option.spreadPct !== undefined) {
			score += Math.max(0, 20 - option.spreadPct * 200);
		}

		return score;
	}

	/**
	 * Calculate overall score for ranking.
	 */
	private calculateOverallScore(
		option: OptionWithMarketData,
		filter: OptionFilterCriteria,
		weights: ScoringWeights,
	): number {
		let score = 0;
		score += weights.liquidity * (this.calculateLiquidityScore(option) / 100);

		if (option.spreadPct !== undefined) {
			score += weights.spread * Math.max(0, 1 - option.spreadPct * 10);
		}

		if (
			option.delta !== undefined &&
			filter.minDelta !== undefined &&
			filter.maxDelta !== undefined
		) {
			const targetDelta = (filter.minDelta + filter.maxDelta) / 2;
			const deltaDistance = Math.abs(Math.abs(option.delta) - targetDelta);
			const deltaRange = filter.maxDelta - filter.minDelta;
			score += weights.delta * Math.max(0, 1 - deltaDistance / (deltaRange || 1));
		}

		if (filter.minDte !== undefined && filter.maxDte !== undefined) {
			const targetDte = (filter.minDte + filter.maxDte) / 2;
			const dteDistance = Math.abs(option.dte - targetDte);
			const dteRange = filter.maxDte - filter.minDte;
			score += weights.dte * Math.max(0, 1 - dteDistance / (dteRange || 1));
		}

		if (option.iv !== undefined) {
			score += weights.iv * (option.iv / 100);
		}

		return score * 100;
	}
}
