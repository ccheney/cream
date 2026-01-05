/**
 * Polygon.io (Massive.com) API Client
 *
 * Provides cognitive-grade market data:
 * - Historical candles
 * - Option chains
 * - Aggregates
 *
 * Note: Polygon.io rebranded to Massive.com in Oct 2025.
 * API endpoints remain compatible at api.massive.com.
 *
 * @see https://polygon.io/docs (or massive.com/docs)
 */

import { z } from "zod";
import {
  RestClient,
  createRestClient,
  type RateLimitConfig,
} from "../client";

// ============================================
// API Configuration
// ============================================

const POLYGON_BASE_URL = "https://api.polygon.io";
// Alternative: const MASSIVE_BASE_URL = "https://api.massive.com";

/**
 * Polygon rate limits by subscription.
 */
export const POLYGON_RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: { maxRequests: 5, intervalMs: 60000 }, // 5/min
  starter: { maxRequests: 100, intervalMs: 60000 }, // 100/min
  developer: { maxRequests: 1000, intervalMs: 60000 }, // 1000/min
  advanced: { maxRequests: 5000, intervalMs: 60000 }, // 5000/min
};

// ============================================
// Response Schemas
// ============================================

/**
 * Aggregate bar (candle) schema.
 */
export const AggregateBarSchema = z.object({
  o: z.number(), // open
  h: z.number(), // high
  l: z.number(), // low
  c: z.number(), // close
  v: z.number(), // volume
  vw: z.number().optional(), // VWAP
  t: z.number(), // timestamp (ms)
  n: z.number().optional(), // number of trades
});
export type AggregateBar = z.infer<typeof AggregateBarSchema>;

/**
 * Aggregates response schema.
 */
export const AggregatesResponseSchema = z.object({
  ticker: z.string(),
  queryCount: z.number(),
  resultsCount: z.number(),
  adjusted: z.boolean(),
  results: z.array(AggregateBarSchema).optional(),
  status: z.string(),
  request_id: z.string().optional(),
});
export type AggregatesResponse = z.infer<typeof AggregatesResponseSchema>;

/**
 * Option contract schema.
 */
export const OptionContractSchema = z.object({
  ticker: z.string(),
  underlying_ticker: z.string(),
  contract_type: z.enum(["call", "put"]),
  expiration_date: z.string(),
  strike_price: z.number(),
  cfi: z.string().optional(),
  shares_per_contract: z.number().optional(),
  exercise_style: z.string().optional(),
});
export type OptionContract = z.infer<typeof OptionContractSchema>;

/**
 * Option chain response schema.
 */
export const OptionChainResponseSchema = z.object({
  results: z.array(OptionContractSchema).optional(),
  status: z.string(),
  request_id: z.string().optional(),
  next_url: z.string().optional(),
});
export type OptionChainResponse = z.infer<typeof OptionChainResponseSchema>;

/**
 * Snapshot schema.
 */
export const SnapshotSchema = z.object({
  ticker: z.string(),
  day: z.object({
    o: z.number(),
    h: z.number(),
    l: z.number(),
    c: z.number(),
    v: z.number(),
    vw: z.number().optional(),
  }).optional(),
  lastTrade: z.object({
    p: z.number(),
    s: z.number(),
    t: z.number(),
  }).optional(),
  lastQuote: z.object({
    P: z.number(), // ask
    S: z.number(), // ask size
    p: z.number(), // bid
    s: z.number(), // bid size
    t: z.number(),
  }).optional(),
  todaysChange: z.number().optional(),
  todaysChangePerc: z.number().optional(),
  updated: z.number().optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/**
 * Tickers snapshot response.
 */
export const TickersSnapshotResponseSchema = z.object({
  tickers: z.array(SnapshotSchema).optional(),
  status: z.string(),
  count: z.number().optional(),
});
export type TickersSnapshotResponse = z.infer<typeof TickersSnapshotResponseSchema>;

// ============================================
// Polygon Client
// ============================================

/**
 * Polygon API client configuration.
 */
export interface PolygonClientConfig {
  /** Polygon API key */
  apiKey: string;
  /** Subscription tier for rate limiting */
  tier?: "free" | "starter" | "developer" | "advanced";
  /** Use Massive.com endpoints instead of Polygon */
  useMassive?: boolean;
}

/**
 * Timespan for aggregates.
 */
export type Timespan =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

/**
 * Polygon.io API client.
 */
export class PolygonClient {
  private client: RestClient;
  private apiKey: string;

  constructor(config: PolygonClientConfig) {
    const rateLimit = POLYGON_RATE_LIMITS[config.tier ?? "starter"];
    const baseUrl = config.useMassive
      ? "https://api.massive.com"
      : POLYGON_BASE_URL;

    this.client = createRestClient({
      baseUrl,
      rateLimit,
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });

    this.apiKey = config.apiKey;
  }

  /**
   * Get aggregate bars (candles) for a ticker.
   */
  async getAggregates(
    ticker: string,
    multiplier: number,
    timespan: Timespan,
    from: string, // YYYY-MM-DD
    to: string, // YYYY-MM-DD
    options: {
      adjusted?: boolean;
      sort?: "asc" | "desc";
      limit?: number;
    } = {}
  ): Promise<AggregatesResponse> {
    return this.client.get(
      `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
      {
        adjusted: options.adjusted ?? true,
        sort: options.sort ?? "asc",
        limit: options.limit ?? 50000,
        apiKey: this.apiKey,
      },
      AggregatesResponseSchema
    );
  }

  /**
   * Get previous day's aggregates.
   */
  async getPreviousClose(
    ticker: string,
    adjusted = true
  ): Promise<AggregatesResponse> {
    return this.client.get(
      `/v2/aggs/ticker/${ticker}/prev`,
      { adjusted, apiKey: this.apiKey },
      AggregatesResponseSchema
    );
  }

  /**
   * Get option contracts for an underlying.
   */
  async getOptionContracts(
    underlyingTicker: string,
    options: {
      contractType?: "call" | "put";
      expirationDate?: string;
      strikePrice?: number;
      limit?: number;
    } = {}
  ): Promise<OptionChainResponse> {
    return this.client.get(
      "/v3/reference/options/contracts",
      {
        underlying_ticker: underlyingTicker,
        contract_type: options.contractType,
        expiration_date: options.expirationDate,
        strike_price: options.strikePrice,
        limit: options.limit ?? 1000,
        apiKey: this.apiKey,
      },
      OptionChainResponseSchema
    );
  }

  /**
   * Get snapshot for all tickers.
   */
  async getAllTickersSnapshot(
    tickers?: string[]
  ): Promise<TickersSnapshotResponse> {
    const params: Record<string, string | number | boolean | undefined> = {
      apiKey: this.apiKey,
    };

    if (tickers && tickers.length > 0) {
      params.tickers = tickers.join(",");
    }

    return this.client.get(
      "/v2/snapshot/locale/us/markets/stocks/tickers",
      params,
      TickersSnapshotResponseSchema
    );
  }

  /**
   * Get snapshot for a single ticker.
   */
  async getTickerSnapshot(ticker: string): Promise<Snapshot | undefined> {
    const response = await this.getAllTickersSnapshot([ticker]);
    return response.tickers?.[0];
  }

  /**
   * Convert aggregate bars to standard candle format.
   */
  static toCandles(bars: AggregateBar[]): Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;
  }> {
    return bars.map((bar) => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      vwap: bar.vw,
    }));
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create a Polygon client from environment variables.
 */
export function createPolygonClientFromEnv(): PolygonClient {
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    throw new Error("POLYGON_KEY environment variable is required");
  }

  const tier =
    (process.env.POLYGON_TIER as PolygonClientConfig["tier"]) ?? "starter";

  return new PolygonClient({ apiKey, tier });
}
