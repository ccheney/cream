/**
 * Polymarket CLOB Client
 *
 * Client for interacting with the Polymarket prediction market APIs.
 * Uses the Gamma API for market metadata and the CLOB API for prices.
 *
 * We implement read-only access using REST APIs directly, avoiding the
 * heavy ethereum wallet dependencies in @polymarket/clob-client.
 *
 * @see https://docs.polymarket.com/developers/clob-api/overview
 * @see https://docs.polymarket.com/developers/gamma-markets-api/overview
 */

import type { PolymarketConfig } from "@cream/config";
import type {
  PredictionMarketEvent,
  PredictionMarketScores,
  PredictionMarketType,
} from "@cream/domain";
import { z } from "zod";
import { AuthenticationError, type PredictionMarketProvider, RateLimitError } from "../../types";

/**
 * Rate limits for Polymarket APIs (requests per 10 seconds)
 * @see https://docs.polymarket.com/getting-started/rate-limits
 */
export const POLYMARKET_RATE_LIMITS = {
  general: 15000, // 15,000 req/10s
  clob_book_price: 1500, // 1,500 req/10s
  data_trades: 200, // 200 req/10s
  gamma_markets: 300, // 300 req/10s
  gamma_events: 500, // 500 req/10s
};

/**
 * Polymarket market response schema (from Gamma API)
 */
export const PolymarketMarketSchema = z.object({
  id: z.string(),
  question: z.string(),
  slug: z.string().optional(),
  outcomes: z.array(z.string()).optional(),
  outcomePrices: z.array(z.string()).optional(),
  volume: z.string().optional(),
  volume24hr: z.string().optional(),
  liquidity: z.string().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  endDate: z.string().optional(),
  createdAt: z.string().optional(),
  // Token IDs for CLOB API queries
  clobTokenIds: z.array(z.string()).optional(),
});
export type PolymarketMarket = z.infer<typeof PolymarketMarketSchema>;

/**
 * Polymarket event response schema (from Gamma API)
 */
export const PolymarketEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  markets: z.array(PolymarketMarketSchema).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().optional(),
});
export type PolymarketEvent = z.infer<typeof PolymarketEventSchema>;

/**
 * CLOB price response schema
 */
export const ClobPriceSchema = z.object({
  price: z.string(),
  side: z.string().optional(),
});
export type ClobPrice = z.infer<typeof ClobPriceSchema>;

/**
 * CLOB orderbook response schema
 */
export const ClobOrderbookSchema = z.object({
  market: z.string().optional(),
  asset_id: z.string().optional(),
  hash: z.string().optional(),
  bids: z
    .array(
      z.object({
        price: z.string(),
        size: z.string(),
      })
    )
    .optional(),
  asks: z
    .array(
      z.object({
        price: z.string(),
        size: z.string(),
      })
    )
    .optional(),
});
export type ClobOrderbook = z.infer<typeof ClobOrderbookSchema>;

/**
 * Default search queries for relevant market types
 */
export const DEFAULT_SEARCH_QUERIES: Record<string, string[]> = {
  FED_RATE: ["Federal Reserve", "Fed rate", "interest rate", "FOMC"],
  ECONOMIC_DATA: ["inflation", "CPI", "GDP", "unemployment", "jobs"],
  RECESSION: ["recession", "economic downturn"],
  GEOPOLITICAL: ["tariff", "trade war", "sanctions"],
  REGULATORY: ["SEC", "regulation", "antitrust"],
  ELECTION: ["election", "president", "congress"],
};

export interface PolymarketClientOptions {
  /** CLOB API base URL */
  clobEndpoint?: string;
  /** Gamma API base URL */
  gammaEndpoint?: string;
  /** Search queries to use for fetching markets */
  searchQueries?: string[];
}

/**
 * Client for the Polymarket prediction markets APIs
 *
 * Uses REST APIs directly for read-only access, avoiding ethereum dependencies.
 */
export class PolymarketClient implements PredictionMarketProvider {
  readonly platform = "POLYMARKET" as const;

  private readonly clobEndpoint: string;
  private readonly gammaEndpoint: string;
  private readonly searchQueries: string[];

  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly rateLimit = POLYMARKET_RATE_LIMITS.gamma_markets;

  constructor(options: PolymarketClientOptions = {}) {
    this.clobEndpoint = options.clobEndpoint ?? "https://clob.polymarket.com";
    this.gammaEndpoint = options.gammaEndpoint ?? "https://gamma-api.polymarket.com";
    this.searchQueries = options.searchQueries ?? ["Federal Reserve", "inflation", "recession"];
  }

  /**
   * Fetch markets by market types
   */
  async fetchMarkets(
    marketTypes: (typeof PredictionMarketType.options)[number][]
  ): Promise<PredictionMarketEvent[]> {
    const events: PredictionMarketEvent[] = [];

    const queries = new Set<string>();
    for (const type of marketTypes) {
      const typeQueries = DEFAULT_SEARCH_QUERIES[type] ?? [];
      for (const q of typeQueries) {
        queries.add(q);
      }
    }

    if (queries.size === 0) {
      for (const q of this.searchQueries) {
        queries.add(q);
      }
    }

    for (const query of queries) {
      await this.enforceRateLimit();
      try {
        const searchResults = await this.searchMarkets(query);
        for (const event of searchResults) {
          const transformed = this.transformEvent(event, this.getMarketType(query));
          if (transformed) {
            events.push(transformed);
          }
        }
      } catch (error) {
        this.handleApiError(error);
      }
    }

    const seen = new Set<string>();
    return events.filter((e) => {
      if (seen.has(e.eventId)) {
        return false;
      }
      seen.add(e.eventId);
      return true;
    });
  }

  /**
   * Fetch a specific market by ID (token ID for CLOB)
   */
  async fetchMarketByTicker(marketId: string): Promise<PredictionMarketEvent | null> {
    await this.enforceRateLimit();

    try {
      const response = await fetch(`${this.gammaEndpoint}/markets/${marketId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const parsed = PolymarketMarketSchema.safeParse(data);
      if (!parsed.success) {
        return null;
      }

      return this.transformMarket(parsed.data, "ECONOMIC_DATA");
    } catch (error) {
      this.handleApiError(error);
      return null;
    }
  }

  /**
   * Calculate aggregated scores from prediction market events
   */
  calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores {
    const scores: PredictionMarketScores = {};

    const fedMarkets = events.filter((e) => e.payload.marketType === "FED_RATE");
    if (fedMarkets.length > 0) {
      for (const market of fedMarkets) {
        for (const outcome of market.payload.outcomes) {
          const outcomeLower = outcome.outcome.toLowerCase();
          if (outcomeLower.includes("cut") || outcomeLower.includes("decrease")) {
            scores.fedCutProbability = Math.max(scores.fedCutProbability ?? 0, outcome.probability);
          }
          if (outcomeLower.includes("hike") || outcomeLower.includes("increase")) {
            scores.fedHikeProbability = Math.max(
              scores.fedHikeProbability ?? 0,
              outcome.probability
            );
          }
        }
      }
    }

    const recessionMarkets = events.filter((e) =>
      e.payload.marketQuestion.toLowerCase().includes("recession")
    );
    if (recessionMarkets.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: length check ensures element exists
      const market = recessionMarkets[0]!;
      const yesOutcome = market.payload.outcomes.find((o) => o.outcome.toLowerCase() === "yes");
      if (yesOutcome) {
        scores.recessionProbability12m = yesOutcome.probability;
      }
    }

    const uncertaintySignals: number[] = [];
    if (scores.fedCutProbability !== undefined && scores.fedHikeProbability !== undefined) {
      const maxProb = Math.max(scores.fedCutProbability, scores.fedHikeProbability);
      const minProb = Math.min(scores.fedCutProbability, scores.fedHikeProbability);
      if (maxProb > 0) {
        uncertaintySignals.push(minProb / maxProb);
      }
    }

    if (uncertaintySignals.length > 0) {
      scores.macroUncertaintyIndex =
        uncertaintySignals.reduce((a, b) => a + b, 0) / uncertaintySignals.length;
    }

    return scores;
  }

  async searchMarkets(query: string): Promise<PolymarketEvent[]> {
    await this.enforceRateLimit();

    try {
      const params = new URLSearchParams({
        _q: query,
        active: "true",
      });

      const response = await fetch(`${this.gammaEndpoint}/events?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        return [];
      }

      const events: PolymarketEvent[] = [];
      for (const item of data) {
        const parsed = PolymarketEventSchema.safeParse(item);
        if (parsed.success) {
          events.push(parsed.data);
        }
      }

      return events;
    } catch (error) {
      this.handleApiError(error);
      return [];
    }
  }

  async getMidpoint(tokenId: string): Promise<number | null> {
    await this.enforceRateLimit();

    try {
      const response = await fetch(`${this.clobEndpoint}/midpoint?token_id=${tokenId}`);
      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { mid?: string };
      if (typeof data.mid === "string") {
        return Number.parseFloat(data.mid);
      }

      return null;
    } catch {
      return null;
    }
  }

  async getOrderbook(tokenId: string): Promise<ClobOrderbook | null> {
    await this.enforceRateLimit();

    try {
      const response = await fetch(`${this.clobEndpoint}/book?token_id=${tokenId}`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const parsed = ClobOrderbookSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private transformEvent(
    event: PolymarketEvent,
    marketType: (typeof PredictionMarketType.options)[number]
  ): PredictionMarketEvent | null {
    const market = event.markets?.[0];
    if (!market) {
      return null;
    }

    return this.transformMarket(market, marketType, event);
  }

  private transformMarket(
    market: PolymarketMarket,
    marketType: (typeof PredictionMarketType.options)[number],
    _event?: PolymarketEvent
  ): PredictionMarketEvent {
    const outcomes: PredictionMarketEvent["payload"]["outcomes"] = [];

    const outcomeNames = market.outcomes ?? ["Yes", "No"];
    const outcomePrices = market.outcomePrices ?? [];

    for (let i = 0; i < outcomeNames.length; i++) {
      const name = outcomeNames[i] ?? `Outcome ${i + 1}`;
      const priceStr = outcomePrices[i];
      const price = priceStr ? Number.parseFloat(priceStr) : 0;

      outcomes.push({
        outcome: name,
        probability: price,
        price: price,
        volume24h: market.volume24hr ? Number.parseFloat(market.volume24hr) : undefined,
      });
    }

    return {
      eventId: `pm_polymarket_${market.id}`,
      eventType: "PREDICTION_MARKET",
      eventTime: market.endDate ?? new Date().toISOString(),
      payload: {
        platform: "POLYMARKET",
        marketType,
        marketTicker: market.id,
        marketQuestion: market.question,
        outcomes,
        lastUpdated: new Date().toISOString(),
        volume24h: market.volume24hr ? Number.parseFloat(market.volume24hr) : undefined,
        liquidityScore: this.calculateLiquidityScore(market),
      },
      relatedInstrumentIds: this.getRelatedInstruments(marketType),
    };
  }

  /**
   * Get market type from search query
   */
  private getMarketType(query: string): (typeof PredictionMarketType.options)[number] {
    const queryLower = query.toLowerCase();

    for (const [type, queries] of Object.entries(DEFAULT_SEARCH_QUERIES)) {
      for (const q of queries) {
        if (queryLower.includes(q.toLowerCase())) {
          return type as (typeof PredictionMarketType.options)[number];
        }
      }
    }

    return "ECONOMIC_DATA";
  }

  private calculateLiquidityScore(market: PolymarketMarket): number {
    let score = 0;

    if (market.volume24hr) {
      const volume = Number.parseFloat(market.volume24hr);
      // $100k volume considered high liquidity
      score += Math.min(volume / 100000, 0.5);
    }

    if (market.liquidity) {
      const liquidity = Number.parseFloat(market.liquidity);
      // $50k liquidity considered high
      score += Math.min(liquidity / 50000, 0.5);
    }

    return Math.min(score, 1);
  }

  private getRelatedInstruments(marketType: string): string[] {
    switch (marketType) {
      case "FED_RATE":
        return ["XLF", "TLT", "IYR", "SHY"];
      case "ECONOMIC_DATA":
        return ["SPY", "QQQ", "TLT"];
      case "RECESSION":
        return ["SPY", "VIX", "TLT", "GLD"];
      default:
        return [];
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < 10000) {
      this.requestCount++;
      if (this.requestCount >= this.rateLimit) {
        const waitTime = 10000 - elapsed;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.requestCount = 0;
      }
    } else {
      this.requestCount = 1;
    }

    this.lastRequestTime = Date.now();
  }

  private handleApiError(error: unknown): never {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("401") || message.includes("unauthorized")) {
        throw new AuthenticationError(
          "POLYMARKET",
          "Authentication failed - check API credentials"
        );
      }

      if (message.includes("429") || message.includes("rate limit")) {
        throw new RateLimitError("POLYMARKET", 10000);
      }
    }

    throw error;
  }
}

export function createPolymarketClient(config: PolymarketConfig): PolymarketClient {
  return new PolymarketClient({
    clobEndpoint: config.clob_endpoint,
    gammaEndpoint: config.gamma_endpoint,
    searchQueries: config.search_queries,
  });
}

export function createPolymarketClientFromEnv(): PolymarketClient {
  const clobEndpoint =
    process.env.POLYMARKET_CLOB_ENDPOINT ??
    Bun.env.POLYMARKET_CLOB_ENDPOINT ??
    "https://clob.polymarket.com";
  const gammaEndpoint =
    process.env.POLYMARKET_GAMMA_ENDPOINT ??
    Bun.env.POLYMARKET_GAMMA_ENDPOINT ??
    "https://gamma-api.polymarket.com";

  return new PolymarketClient({
    clobEndpoint,
    gammaEndpoint,
  });
}
