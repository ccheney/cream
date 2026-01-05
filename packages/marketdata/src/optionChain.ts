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
 */

import { z } from "zod";
import { type PolygonClient, type OptionContract } from "./providers/polygon";

// ============================================
// Types
// ============================================

/**
 * Option type (call or put).
 */
export type OptionType = "call" | "put";

/**
 * Extended option contract with market data.
 */
export const OptionWithMarketDataSchema = z.object({
  // Contract info
  ticker: z.string(),
  underlying: z.string(),
  type: z.enum(["call", "put"]),
  expiration: z.string(),
  strike: z.number(),
  dte: z.number(),

  // Greeks (from external source)
  delta: z.number().optional(),
  gamma: z.number().optional(),
  theta: z.number().optional(),
  vega: z.number().optional(),
  iv: z.number().optional(),

  // Market data
  bid: z.number().optional(),
  ask: z.number().optional(),
  mid: z.number().optional(),
  spread: z.number().optional(),
  spreadPct: z.number().optional(),
  lastPrice: z.number().optional(),
  volume: z.number().optional(),
  openInterest: z.number().optional(),

  // Scoring
  liquidityScore: z.number().optional(),
  overallScore: z.number().optional(),
});

export type OptionWithMarketData = z.infer<typeof OptionWithMarketDataSchema>;

/**
 * Filter criteria for option chain scanning.
 */
export interface OptionFilterCriteria {
  /** Minimum days to expiration. */
  minDte?: number;
  /** Maximum days to expiration. */
  maxDte?: number;

  /** Minimum absolute delta. */
  minDelta?: number;
  /** Maximum absolute delta. */
  maxDelta?: number;

  /** Option type filter (call, put, or both). */
  optionType?: OptionType | "both";

  /** Minimum daily volume per contract. */
  minVolume?: number;
  /** Minimum open interest. */
  minOpenInterest?: number;
  /** Maximum bid-ask spread as percentage of mid. */
  maxSpreadPct?: number;
  /** Maximum absolute bid-ask spread. */
  maxSpreadAbs?: number;

  /** Minimum IV percentile (0-100). */
  minIvPercentile?: number;
  /** Maximum IV percentile (0-100). */
  maxIvPercentile?: number;

  /** Minimum underlying daily volume. */
  minUnderlyingVolume?: number;
}

/**
 * Default filter criteria for different strategies.
 */
export const DEFAULT_FILTERS: Record<string, OptionFilterCriteria> = {
  // Credit spreads (sell OTM options)
  creditSpread: {
    minDte: 30,
    maxDte: 60,
    minDelta: 0.15,
    maxDelta: 0.30,
    minVolume: 100,
    minOpenInterest: 500,
    maxSpreadPct: 0.10,
    minIvPercentile: 50,
  },

  // Debit spreads (buy options)
  debitSpread: {
    minDte: 21,
    maxDte: 45,
    minDelta: 0.30,
    maxDelta: 0.50,
    minVolume: 50,
    minOpenInterest: 200,
    maxSpreadPct: 0.08,
    maxIvPercentile: 50,
  },

  // Covered calls (sell near-the-money)
  coveredCall: {
    minDte: 14,
    maxDte: 45,
    minDelta: 0.25,
    maxDelta: 0.40,
    optionType: "call",
    minVolume: 100,
    minOpenInterest: 300,
    maxSpreadPct: 0.08,
  },

  // Cash-secured puts (sell OTM puts)
  cashSecuredPut: {
    minDte: 21,
    maxDte: 45,
    minDelta: 0.20,
    maxDelta: 0.35,
    optionType: "put",
    minVolume: 100,
    minOpenInterest: 500,
    maxSpreadPct: 0.10,
    minIvPercentile: 40,
  },

  // Long options (directional)
  longOption: {
    minDte: 30,
    maxDte: 90,
    minDelta: 0.40,
    maxDelta: 0.60,
    minVolume: 200,
    minOpenInterest: 1000,
    maxSpreadPct: 0.05,
    maxIvPercentile: 40,
  },
};

/**
 * Scoring weights for candidate ranking.
 */
export interface ScoringWeights {
  /** Weight for liquidity score (volume + OI). */
  liquidity: number;
  /** Weight for tight spreads. */
  spread: number;
  /** Weight for optimal delta. */
  delta: number;
  /** Weight for IV percentile alignment. */
  iv: number;
  /** Weight for DTE alignment. */
  dte: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  liquidity: 0.30,
  spread: 0.25,
  delta: 0.20,
  iv: 0.15,
  dte: 0.10,
};

/**
 * Cache entry for option chain data.
 */
interface CacheEntry {
  data: OptionWithMarketData[];
  timestamp: number;
  underlyingPrice: number;
}

// ============================================
// Option Chain Scanner
// ============================================

/**
 * Option chain scanner with filtering and ranking.
 */
export class OptionChainScanner {
  private client: PolygonClient;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtlMs: number;
  private priceInvalidationPct: number;

  /**
   * Create a new scanner.
   *
   * @param client - Polygon API client
   * @param cacheTtlMs - Cache TTL in milliseconds (default: 5 minutes)
   * @param priceInvalidationPct - Invalidate cache on this % price move (default: 1%)
   */
  constructor(
    client: PolygonClient,
    cacheTtlMs = 5 * 60 * 1000, // 5 minutes
    priceInvalidationPct = 0.01 // 1%
  ) {
    this.client = client;
    this.cacheTtlMs = cacheTtlMs;
    this.priceInvalidationPct = priceInvalidationPct;
  }

  /**
   * Scan and filter option chain for candidates.
   *
   * @param underlying - Underlying ticker symbol
   * @param filter - Filter criteria
   * @param greeksProvider - Optional function to fetch greeks
   * @returns Filtered and ranked option candidates
   */
  async scan(
    underlying: string,
    filter: OptionFilterCriteria,
    greeksProvider?: GreeksProvider
  ): Promise<OptionWithMarketData[]> {
    // Check cache
    const cached = this.getCached(underlying);
    if (cached) {
      return this.filterAndRank(cached, filter);
    }

    // Fetch fresh data
    const chain = await this.fetchChain(underlying);

    // Enrich with greeks if provider available
    if (greeksProvider) {
      await this.enrichWithGreeks(chain, greeksProvider);
    }

    // Cache the results
    const underlyingPrice = await this.getUnderlyingPrice(underlying);
    this.setCache(underlying, chain, underlyingPrice);

    return this.filterAndRank(chain, filter);
  }

  /**
   * Get top candidates for a strategy.
   *
   * @param underlying - Underlying ticker
   * @param strategy - Strategy name (key in DEFAULT_FILTERS)
   * @param topN - Number of candidates to return
   * @param greeksProvider - Optional greeks provider
   */
  async getTopCandidates(
    underlying: string,
    strategy: keyof typeof DEFAULT_FILTERS,
    topN = 5,
    greeksProvider?: GreeksProvider
  ): Promise<OptionWithMarketData[]> {
    const filter = DEFAULT_FILTERS[strategy];
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
   * Check cache validity.
   */
  private getCached(underlying: string): OptionWithMarketData[] | undefined {
    const entry = this.cache.get(underlying);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(underlying);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Check if cache should be invalidated due to price move.
   */
  async shouldInvalidateCache(underlying: string): Promise<boolean> {
    const entry = this.cache.get(underlying);
    if (!entry) return false;

    const currentPrice = await this.getUnderlyingPrice(underlying);
    const priceDiff = Math.abs(currentPrice - entry.underlyingPrice) / entry.underlyingPrice;

    return priceDiff > this.priceInvalidationPct;
  }

  /**
   * Set cache entry.
   */
  private setCache(
    underlying: string,
    data: OptionWithMarketData[],
    underlyingPrice: number
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
    const response = await this.client.getOptionContracts(underlying, {
      limit: 1000,
    });

    if (!response.results) {
      return [];
    }

    const today = new Date();

    return response.results.map((contract) => {
      const expDate = new Date(contract.expiration_date);
      const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ticker: contract.ticker,
        underlying: contract.underlying_ticker,
        type: contract.contract_type,
        expiration: contract.expiration_date,
        strike: contract.strike_price,
        dte,
      };
    });
  }

  /**
   * Get underlying price.
   */
  private async getUnderlyingPrice(underlying: string): Promise<number> {
    const snapshot = await this.client.getTickerSnapshot(underlying);
    return snapshot?.lastTrade?.p ?? snapshot?.day?.c ?? 0;
  }

  /**
   * Enrich options with greeks from provider.
   */
  private async enrichWithGreeks(
    options: OptionWithMarketData[],
    provider: GreeksProvider
  ): Promise<void> {
    const greeks = await provider(options.map((o) => o.ticker));

    for (const option of options) {
      const g = greeks.get(option.ticker);
      if (g) {
        option.delta = g.delta;
        option.gamma = g.gamma;
        option.theta = g.theta;
        option.vega = g.vega;
        option.iv = g.iv;
        option.bid = g.bid;
        option.ask = g.ask;
        option.mid = g.bid !== undefined && g.ask !== undefined
          ? (g.bid + g.ask) / 2
          : undefined;
        option.spread = g.bid !== undefined && g.ask !== undefined
          ? g.ask - g.bid
          : undefined;
        option.spreadPct = option.mid && option.spread
          ? option.spread / option.mid
          : undefined;
        option.lastPrice = g.lastPrice;
        option.volume = g.volume;
        option.openInterest = g.openInterest;
      }
    }
  }

  /**
   * Filter and rank options.
   */
  private filterAndRank(
    options: OptionWithMarketData[],
    filter: OptionFilterCriteria,
    weights: ScoringWeights = DEFAULT_WEIGHTS
  ): OptionWithMarketData[] {
    // Apply filters
    let filtered = options.filter((opt) => this.passesFilter(opt, filter));

    // Calculate scores
    filtered = filtered.map((opt) => ({
      ...opt,
      liquidityScore: this.calculateLiquidityScore(opt),
      overallScore: this.calculateOverallScore(opt, filter, weights),
    }));

    // Sort by score (descending)
    filtered.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

    return filtered;
  }

  /**
   * Check if option passes all filter criteria.
   */
  private passesFilter(option: OptionWithMarketData, filter: OptionFilterCriteria): boolean {
    // DTE filter
    if (filter.minDte !== undefined && option.dte < filter.minDte) return false;
    if (filter.maxDte !== undefined && option.dte > filter.maxDte) return false;

    // Option type filter
    if (filter.optionType && filter.optionType !== "both" && option.type !== filter.optionType) {
      return false;
    }

    // Delta filter (absolute value)
    if (option.delta !== undefined) {
      const absDelta = Math.abs(option.delta);
      if (filter.minDelta !== undefined && absDelta < filter.minDelta) return false;
      if (filter.maxDelta !== undefined && absDelta > filter.maxDelta) return false;
    }

    // Volume filter
    if (filter.minVolume !== undefined) {
      if (option.volume === undefined || option.volume < filter.minVolume) return false;
    }

    // Open interest filter
    if (filter.minOpenInterest !== undefined) {
      if (option.openInterest === undefined || option.openInterest < filter.minOpenInterest) {
        return false;
      }
    }

    // Spread percentage filter
    if (filter.maxSpreadPct !== undefined && option.spreadPct !== undefined) {
      if (option.spreadPct > filter.maxSpreadPct) return false;
    }

    // Absolute spread filter
    if (filter.maxSpreadAbs !== undefined && option.spread !== undefined) {
      if (option.spread > filter.maxSpreadAbs) return false;
    }

    // IV percentile filter (requires external IV ranking)
    // TODO: Implement IV percentile calculation

    return true;
  }

  /**
   * Calculate liquidity score (0-100).
   */
  private calculateLiquidityScore(option: OptionWithMarketData): number {
    let score = 0;

    // Volume component (0-40 points)
    if (option.volume !== undefined) {
      const volumeScore = Math.min(40, option.volume / 25); // 1000 volume = 40 points
      score += volumeScore;
    }

    // Open interest component (0-40 points)
    if (option.openInterest !== undefined) {
      const oiScore = Math.min(40, option.openInterest / 125); // 5000 OI = 40 points
      score += oiScore;
    }

    // Tight spread component (0-20 points)
    if (option.spreadPct !== undefined) {
      const spreadScore = Math.max(0, 20 - option.spreadPct * 200); // 0% = 20, 10% = 0
      score += spreadScore;
    }

    return score;
  }

  /**
   * Calculate overall score for ranking.
   */
  private calculateOverallScore(
    option: OptionWithMarketData,
    filter: OptionFilterCriteria,
    weights: ScoringWeights
  ): number {
    let score = 0;

    // Liquidity component
    const liquidityScore = this.calculateLiquidityScore(option) / 100;
    score += weights.liquidity * liquidityScore;

    // Spread component (tighter is better)
    if (option.spreadPct !== undefined) {
      const spreadScore = Math.max(0, 1 - option.spreadPct * 10);
      score += weights.spread * spreadScore;
    }

    // Delta component (closer to target range center is better)
    if (option.delta !== undefined && filter.minDelta !== undefined && filter.maxDelta !== undefined) {
      const targetDelta = (filter.minDelta + filter.maxDelta) / 2;
      const deltaDistance = Math.abs(Math.abs(option.delta) - targetDelta);
      const deltaRange = filter.maxDelta - filter.minDelta;
      const deltaScore = Math.max(0, 1 - deltaDistance / (deltaRange || 1));
      score += weights.delta * deltaScore;
    }

    // DTE component (closer to target range center is better)
    if (filter.minDte !== undefined && filter.maxDte !== undefined) {
      const targetDte = (filter.minDte + filter.maxDte) / 2;
      const dteDistance = Math.abs(option.dte - targetDte);
      const dteRange = filter.maxDte - filter.minDte;
      const dteScore = Math.max(0, 1 - dteDistance / (dteRange || 1));
      score += weights.dte * dteScore;
    }

    // IV component
    if (option.iv !== undefined) {
      // Higher IV = higher score for selling, lower for buying
      const ivScore = option.iv / 100; // Normalize 0-1
      score += weights.iv * ivScore;
    }

    return score * 100; // Scale to 0-100
  }
}

// ============================================
// Greeks Provider Type
// ============================================

/**
 * Greeks data for an option.
 */
export interface OptionGreeks {
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  volume?: number;
  openInterest?: number;
}

/**
 * Function to fetch greeks for a list of option tickers.
 */
export type GreeksProvider = (tickers: string[]) => Promise<Map<string, OptionGreeks>>;

// ============================================
// Utilities
// ============================================

/**
 * Calculate days to expiration from date string.
 */
export function calculateDte(expirationDate: string): number {
  const expDate = new Date(expirationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Parse option ticker to components.
 *
 * Standard OCC format: AAPL240119C00150000
 * - Symbol: AAPL
 * - Expiration: 240119 (YYMMDD)
 * - Type: C (call) or P (put)
 * - Strike: 00150000 (price * 1000)
 */
export function parseOptionTicker(ticker: string): {
  underlying: string;
  expiration: string;
  type: OptionType;
  strike: number;
} | undefined {
  // Match OCC format
  const match = ticker.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return undefined;

  const [, underlying, expStr, typeChar, strikeStr] = match;

  const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
  const month = expStr.slice(2, 4);
  const day = expStr.slice(4, 6);
  const expiration = `${year}-${month}-${day}`;

  return {
    underlying,
    expiration,
    type: typeChar === "C" ? "call" : "put",
    strike: Number.parseInt(strikeStr, 10) / 1000,
  };
}

/**
 * Build option ticker from components.
 */
export function buildOptionTicker(
  underlying: string,
  expiration: string, // YYYY-MM-DD
  type: OptionType,
  strike: number
): string {
  const date = new Date(expiration);
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const typeChar = type === "call" ? "C" : "P";
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");

  return `${underlying}${yy}${mm}${dd}${typeChar}${strikeStr}`;
}
