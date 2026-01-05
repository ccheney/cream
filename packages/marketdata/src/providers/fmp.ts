/**
 * Financial Modeling Prep (FMP) API Client
 *
 * Provides access to:
 * - Earnings transcripts
 * - SEC filings
 * - Sentiment data
 * - Index constituents
 *
 * @see https://site.financialmodelingprep.com/developer/docs
 */

import { z } from "zod";
import {
  RestClient,
  createRestClient,
  type ClientConfig,
  type RateLimitConfig,
} from "../client";

// ============================================
// API Configuration
// ============================================

const FMP_BASE_URL = "https://financialmodelingprep.com/api";
const FMP_VERSION = "v3";

/**
 * FMP rate limits (based on subscription tier).
 */
export const FMP_RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: { maxRequests: 250, intervalMs: 86400000 }, // 250/day
  starter: { maxRequests: 300, intervalMs: 60000 }, // 300/min
  professional: { maxRequests: 750, intervalMs: 60000 }, // 750/min
  enterprise: { maxRequests: 3000, intervalMs: 60000 }, // 3000/min
};

// ============================================
// Response Schemas
// ============================================

/**
 * Earnings transcript schema.
 */
export const EarningsTranscriptSchema = z.object({
  symbol: z.string(),
  quarter: z.number(),
  year: z.number(),
  date: z.string(),
  content: z.string(),
});
export type EarningsTranscript = z.infer<typeof EarningsTranscriptSchema>;

/**
 * SEC filing schema.
 */
export const SecFilingSchema = z.object({
  symbol: z.string(),
  cik: z.string(),
  type: z.string(),
  link: z.string(),
  finalLink: z.string(),
  acceptedDate: z.string(),
  fillingDate: z.string(),
});
export type SecFiling = z.infer<typeof SecFilingSchema>;

/**
 * Sentiment rating schema.
 */
export const SentimentRatingSchema = z.object({
  symbol: z.string(),
  date: z.string(),
  rating: z.string(),
  ratingScore: z.number(),
  ratingRecommendation: z.string(),
});
export type SentimentRating = z.infer<typeof SentimentRatingSchema>;

/**
 * Stock news schema.
 */
export const StockNewsSchema = z.object({
  symbol: z.string(),
  publishedDate: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  site: z.string(),
  image: z.string().optional(),
});
export type StockNews = z.infer<typeof StockNewsSchema>;

/**
 * Index constituent schema.
 */
export const IndexConstituentSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: z.string(),
  subSector: z.string().optional(),
  headQuarter: z.string().optional(),
  dateFirstAdded: z.string().optional(),
  cik: z.string().optional(),
  founded: z.string().optional(),
});
export type IndexConstituent = z.infer<typeof IndexConstituentSchema>;

/**
 * Quote schema.
 */
export const QuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  changesPercentage: z.number(),
  change: z.number(),
  dayLow: z.number(),
  dayHigh: z.number(),
  yearHigh: z.number(),
  yearLow: z.number(),
  marketCap: z.number().nullable(),
  priceAvg50: z.number().nullable(),
  priceAvg200: z.number().nullable(),
  volume: z.number(),
  avgVolume: z.number(),
  exchange: z.string(),
  open: z.number(),
  previousClose: z.number(),
  eps: z.number().nullable(),
  pe: z.number().nullable(),
  earningsAnnouncement: z.string().nullable(),
  sharesOutstanding: z.number().nullable(),
  timestamp: z.number(),
});
export type Quote = z.infer<typeof QuoteSchema>;

// ============================================
// FMP Client
// ============================================

/**
 * FMP API client configuration.
 */
export interface FmpClientConfig {
  /** FMP API key */
  apiKey: string;
  /** Subscription tier for rate limiting */
  tier?: "free" | "starter" | "professional" | "enterprise";
}

/**
 * Financial Modeling Prep API client.
 */
export class FmpClient {
  private client: RestClient;

  constructor(config: FmpClientConfig) {
    const rateLimit = FMP_RATE_LIMITS[config.tier ?? "starter"];

    this.client = createRestClient({
      baseUrl: FMP_BASE_URL,
      rateLimit,
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });

    // Store API key for query params (FMP uses query param auth)
    this.apiKey = config.apiKey;
  }

  private apiKey: string;

  /**
   * Get earnings transcript for a company.
   */
  async getEarningsTranscript(
    symbol: string,
    quarter: number,
    year: number
  ): Promise<EarningsTranscript[]> {
    return this.client.get(
      `/${FMP_VERSION}/earning_call_transcript/${symbol}`,
      { quarter, year, apikey: this.apiKey },
      z.array(EarningsTranscriptSchema)
    );
  }

  /**
   * Get SEC filings for a company.
   */
  async getSecFilings(
    symbol: string,
    type?: string,
    limit = 100
  ): Promise<SecFiling[]> {
    return this.client.get(
      `/${FMP_VERSION}/sec_filings/${symbol}`,
      { type, limit, apikey: this.apiKey },
      z.array(SecFilingSchema)
    );
  }

  /**
   * Get analyst ratings/sentiment for a company.
   */
  async getSentimentRatings(
    symbol: string,
    limit = 100
  ): Promise<SentimentRating[]> {
    return this.client.get(
      `/${FMP_VERSION}/historical-rating/${symbol}`,
      { limit, apikey: this.apiKey },
      z.array(SentimentRatingSchema)
    );
  }

  /**
   * Get stock news for symbols.
   */
  async getStockNews(
    symbols: string[],
    limit = 50
  ): Promise<StockNews[]> {
    return this.client.get(
      `/${FMP_VERSION}/stock_news`,
      { tickers: symbols.join(","), limit, apikey: this.apiKey },
      z.array(StockNewsSchema)
    );
  }

  /**
   * Get S&P 500 constituents.
   */
  async getSP500Constituents(): Promise<IndexConstituent[]> {
    return this.client.get(
      `/${FMP_VERSION}/sp500_constituent`,
      { apikey: this.apiKey },
      z.array(IndexConstituentSchema)
    );
  }

  /**
   * Get NASDAQ 100 constituents.
   */
  async getNasdaq100Constituents(): Promise<IndexConstituent[]> {
    return this.client.get(
      `/${FMP_VERSION}/nasdaq_constituent`,
      { apikey: this.apiKey },
      z.array(IndexConstituentSchema)
    );
  }

  /**
   * Get Dow Jones constituents.
   */
  async getDowJonesConstituents(): Promise<IndexConstituent[]> {
    return this.client.get(
      `/${FMP_VERSION}/dowjones_constituent`,
      { apikey: this.apiKey },
      z.array(IndexConstituentSchema)
    );
  }

  /**
   * Get real-time quotes for symbols.
   */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return this.client.get(
      `/${FMP_VERSION}/quote/${symbols.join(",")}`,
      { apikey: this.apiKey },
      z.array(QuoteSchema)
    );
  }

  /**
   * Get full quote for a single symbol.
   */
  async getQuote(symbol: string): Promise<Quote | undefined> {
    const quotes = await this.getQuotes([symbol]);
    return quotes[0];
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create an FMP client from environment variables.
 */
export function createFmpClientFromEnv(): FmpClient {
  const apiKey = process.env.FMP_KEY ?? Bun.env.FMP_KEY;
  if (!apiKey) {
    throw new Error("FMP_KEY environment variable is required");
  }

  const tier =
    (process.env.FMP_TIER as FmpClientConfig["tier"]) ?? "starter";

  return new FmpClient({ apiKey, tier });
}
