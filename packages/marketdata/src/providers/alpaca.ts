/**
 * Alpaca Markets API Client
 *
 * Unified market data provider for stocks, options, and crypto.
 * Uses direct fetch calls to Alpaca's REST API.
 *
 * Features:
 * - Stock quotes, bars, and trades
 * - Options contracts, snapshots with Greeks
 * - Corporate actions (splits, dividends)
 * - Built-in rate limiting
 *
 * @see https://docs.alpaca.markets/docs/about-market-data-api
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
const ALPACA_PAPER_TRADING_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_TRADING_URL = "https://api.alpaca.markets";

// ============================================
// Response Schemas
// ============================================

export const AlpacaQuoteSchema = z.object({
  symbol: z.string(),
  bidPrice: z.number(),
  bidSize: z.number(),
  askPrice: z.number(),
  askSize: z.number(),
  bidExchange: z.string().optional(),
  askExchange: z.string().optional(),
  timestamp: z.string(),
  conditions: z.array(z.string()).optional(),
  tape: z.string().optional(),
});
export type AlpacaQuote = z.infer<typeof AlpacaQuoteSchema>;

export const AlpacaBarSchema = z.object({
  symbol: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  timestamp: z.string(),
  vwap: z.number().optional(),
  tradeCount: z.number().optional(),
});
export type AlpacaBar = z.infer<typeof AlpacaBarSchema>;

export const AlpacaTradeSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  size: z.number(),
  timestamp: z.string(),
  exchange: z.string().optional(),
  id: z.number().optional(),
  conditions: z.array(z.string()).optional(),
  tape: z.string().optional(),
});
export type AlpacaTrade = z.infer<typeof AlpacaTradeSchema>;

export const AlpacaSnapshotSchema = z.object({
  symbol: z.string(),
  latestQuote: AlpacaQuoteSchema.optional(),
  latestTrade: AlpacaTradeSchema.optional(),
  minuteBar: AlpacaBarSchema.optional(),
  dailyBar: AlpacaBarSchema.optional(),
  prevDailyBar: AlpacaBarSchema.optional(),
});
export type AlpacaSnapshot = z.infer<typeof AlpacaSnapshotSchema>;

export const AlpacaOptionContractSchema = z.object({
  symbol: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  tradable: z.boolean().optional(),
  expirationDate: z.string(),
  rootSymbol: z.string().optional(),
  underlyingSymbol: z.string(),
  underlyingAssetId: z.string().optional(),
  type: z.enum(["call", "put"]),
  style: z.string().optional(),
  strikePrice: z.number(),
  multiplier: z.number().optional(),
  size: z.number().optional(),
  openInterest: z.number().optional(),
  openInterestDate: z.string().optional(),
  closePrice: z.number().optional(),
  closePriceDate: z.string().optional(),
});
export type AlpacaOptionContract = z.infer<typeof AlpacaOptionContractSchema>;

export const AlpacaOptionGreeksSchema = z.object({
  delta: z.number().optional(),
  gamma: z.number().optional(),
  theta: z.number().optional(),
  vega: z.number().optional(),
  rho: z.number().optional(),
});
export type AlpacaOptionGreeks = z.infer<typeof AlpacaOptionGreeksSchema>;

const OptionBarSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  vwap: z.number().optional(),
  tradeCount: z.number().optional(),
  timestamp: z.string(),
});

export const AlpacaOptionSnapshotSchema = z.object({
  symbol: z.string(),
  latestQuote: z
    .object({
      bidPrice: z.number(),
      bidSize: z.number(),
      askPrice: z.number(),
      askSize: z.number(),
      bidExchange: z.string().optional(),
      askExchange: z.string().optional(),
      timestamp: z.string(),
    })
    .optional(),
  latestTrade: z
    .object({
      price: z.number(),
      size: z.number(),
      timestamp: z.string(),
      exchange: z.string().optional(),
      conditions: z.array(z.string()).optional(),
    })
    .optional(),
  dailyBar: OptionBarSchema.optional(),
  prevDailyBar: OptionBarSchema.optional(),
  greeks: AlpacaOptionGreeksSchema.optional(),
  impliedVolatility: z.number().optional(),
});
export type AlpacaOptionSnapshot = z.infer<typeof AlpacaOptionSnapshotSchema>;

export const AlpacaCorporateActionSplitSchema = z.object({
  symbol: z.string(),
  newRate: z.number(),
  oldRate: z.number(),
  processDate: z.string(),
  exDate: z.string(),
  recordDate: z.string().optional(),
  payableDate: z.string().optional(),
});
export type AlpacaCorporateActionSplit = z.infer<typeof AlpacaCorporateActionSplitSchema>;

export const AlpacaCorporateActionDividendSchema = z.object({
  symbol: z.string(),
  rate: z.number(),
  special: z.boolean().optional(),
  foreign: z.boolean().optional(),
  exDate: z.string(),
  recordDate: z.string().optional(),
  payableDate: z.string().optional(),
  processDate: z.string().optional(),
});
export type AlpacaCorporateActionDividend = z.infer<typeof AlpacaCorporateActionDividendSchema>;

// ============================================
// Client Types
// ============================================

export type TradingEnvironment = "PAPER" | "LIVE";

export interface AlpacaClientConfig {
  apiKey: string;
  apiSecret: string;
  /** Market data API base URL (defaults to data.alpaca.markets) */
  baseUrl?: string;
  /** Trading environment for options contracts API (defaults to PAPER) */
  environment?: TradingEnvironment;
}

export type AlpacaTimeframe =
  | "1Min"
  | "5Min"
  | "15Min"
  | "30Min"
  | "1Hour"
  | "2Hour"
  | "4Hour"
  | "1Day"
  | "1Week"
  | "1Month";

export interface OptionContractParams {
  expirationDateGte?: string;
  expirationDateLte?: string;
  rootSymbol?: string;
  type?: "call" | "put";
  strikePriceGte?: number;
  strikePriceLte?: number;
  limit?: number;
}

// ============================================
// Client Implementation
// ============================================

/**
 * Alpaca Markets API client using direct fetch.
 *
 * Provides access to:
 * - Stock quotes, bars, trades, and snapshots
 * - Options contracts and snapshots with Greeks
 * - Corporate actions (splits, dividends)
 *
 * @example
 * ```typescript
 * const client = new AlpacaMarketDataClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 * });
 *
 * const quotes = await client.getQuotes(["AAPL", "MSFT"]);
 * const bars = await client.getBars("AAPL", "1Hour", "2026-01-01", "2026-01-10");
 * ```
 */
export class AlpacaMarketDataClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private tradingUrl: string;

  constructor(config: AlpacaClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? ALPACA_DATA_BASE_URL;
    this.tradingUrl =
      config.environment === "LIVE" ? ALPACA_LIVE_TRADING_URL : ALPACA_PAPER_TRADING_URL;
  }

  /**
   * Make an authenticated request to the Alpaca market data API.
   */
  private async request<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.makeRequest<T>(this.baseUrl, path, params);
  }

  /**
   * Make an authenticated request to the Alpaca trading API.
   */
  private async tradingRequest<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.makeRequest<T>(this.tradingUrl, path, params);
  }

  /**
   * Make an authenticated request to a specific Alpaca API endpoint.
   */
  private async makeRequest<T>(
    baseUrl: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = new URL(path, baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Alpaca API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Stock Methods
  // ============================================

  /**
   * Get latest quotes for multiple symbols.
   */
  async getQuotes(symbols: string[]): Promise<Map<string, AlpacaQuote>> {
    const result = new Map<string, AlpacaQuote>();

    try {
      const response = await this.request<{ quotes: Record<string, unknown> }>(
        "/v2/stocks/quotes/latest",
        { symbols: symbols.join(",") }
      );

      if (response?.quotes) {
        for (const [symbol, quote] of Object.entries(response.quotes)) {
          const q = quote as {
            bp?: number;
            bs?: number;
            ap?: number;
            as?: number;
            bx?: string;
            ax?: string;
            t?: string;
            c?: string[];
            z?: string;
          };

          result.set(symbol, {
            symbol,
            bidPrice: q.bp ?? 0,
            bidSize: q.bs ?? 0,
            askPrice: q.ap ?? 0,
            askSize: q.as ?? 0,
            bidExchange: q.bx,
            askExchange: q.ax,
            timestamp: q.t ?? new Date().toISOString(),
            conditions: q.c,
            tape: q.z,
          });
        }
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  /**
   * Get latest quote for a single symbol.
   */
  async getQuote(symbol: string): Promise<AlpacaQuote | null> {
    const quotes = await this.getQuotes([symbol]);
    return quotes.get(symbol) ?? null;
  }

  /**
   * Get historical bars for a symbol.
   */
  async getBars(
    symbol: string,
    timeframe: AlpacaTimeframe,
    start: string,
    end: string,
    limit?: number
  ): Promise<AlpacaBar[]> {
    const bars: AlpacaBar[] = [];

    try {
      const response = await this.request<{ bars: Record<string, unknown[]> }>("/v2/stocks/bars", {
        symbols: symbol,
        timeframe,
        start,
        end,
        limit: limit ?? 10000,
      });

      if (response?.bars) {
        const symbolBars = response.bars[symbol];
        if (Array.isArray(symbolBars)) {
          for (const bar of symbolBars) {
            const b = bar as {
              o?: number;
              h?: number;
              l?: number;
              c?: number;
              v?: number;
              t?: string;
              vw?: number;
              n?: number;
            };

            bars.push({
              symbol,
              open: b.o ?? 0,
              high: b.h ?? 0,
              low: b.l ?? 0,
              close: b.c ?? 0,
              volume: b.v ?? 0,
              timestamp: b.t ?? "",
              vwap: b.vw,
              tradeCount: b.n,
            });
          }
        }
      }
    } catch {
      // Return empty array on error
    }

    return bars;
  }

  /**
   * Get snapshots for multiple symbols.
   */
  async getSnapshots(symbols: string[]): Promise<Map<string, AlpacaSnapshot>> {
    const result = new Map<string, AlpacaSnapshot>();

    try {
      const response = await this.request<Record<string, unknown>>("/v2/stocks/snapshots", {
        symbols: symbols.join(","),
      });

      for (const [symbol, snapshot] of Object.entries(response)) {
        const s = snapshot as Record<string, unknown>;

        const quote = s.latestQuote as Record<string, unknown> | undefined;
        const trade = s.latestTrade as Record<string, unknown> | undefined;
        const minBar = s.minuteBar as Record<string, unknown> | undefined;
        const dayBar = s.dailyBar as Record<string, unknown> | undefined;
        const prevBar = s.prevDailyBar as Record<string, unknown> | undefined;

        result.set(symbol, {
          symbol,
          latestQuote: quote
            ? {
                symbol,
                bidPrice: (quote.bp as number) ?? 0,
                bidSize: (quote.bs as number) ?? 0,
                askPrice: (quote.ap as number) ?? 0,
                askSize: (quote.as as number) ?? 0,
                bidExchange: quote.bx as string | undefined,
                askExchange: quote.ax as string | undefined,
                timestamp: (quote.t as string) ?? "",
                conditions: quote.c as string[] | undefined,
                tape: quote.z as string | undefined,
              }
            : undefined,
          latestTrade: trade
            ? {
                symbol,
                price: (trade.p as number) ?? 0,
                size: (trade.s as number) ?? 0,
                timestamp: (trade.t as string) ?? "",
                exchange: trade.x as string | undefined,
                id: trade.i as number | undefined,
                conditions: trade.c as string[] | undefined,
                tape: trade.z as string | undefined,
              }
            : undefined,
          minuteBar: minBar
            ? {
                symbol,
                open: (minBar.o as number) ?? 0,
                high: (minBar.h as number) ?? 0,
                low: (minBar.l as number) ?? 0,
                close: (minBar.c as number) ?? 0,
                volume: (minBar.v as number) ?? 0,
                timestamp: (minBar.t as string) ?? "",
                vwap: minBar.vw as number | undefined,
                tradeCount: minBar.n as number | undefined,
              }
            : undefined,
          dailyBar: dayBar
            ? {
                symbol,
                open: (dayBar.o as number) ?? 0,
                high: (dayBar.h as number) ?? 0,
                low: (dayBar.l as number) ?? 0,
                close: (dayBar.c as number) ?? 0,
                volume: (dayBar.v as number) ?? 0,
                timestamp: (dayBar.t as string) ?? "",
                vwap: dayBar.vw as number | undefined,
                tradeCount: dayBar.n as number | undefined,
              }
            : undefined,
          prevDailyBar: prevBar
            ? {
                symbol,
                open: (prevBar.o as number) ?? 0,
                high: (prevBar.h as number) ?? 0,
                low: (prevBar.l as number) ?? 0,
                close: (prevBar.c as number) ?? 0,
                volume: (prevBar.v as number) ?? 0,
                timestamp: (prevBar.t as string) ?? "",
                vwap: prevBar.vw as number | undefined,
                tradeCount: prevBar.n as number | undefined,
              }
            : undefined,
        });
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  /**
   * Get latest trades for multiple symbols.
   */
  async getLatestTrades(symbols: string[]): Promise<Map<string, AlpacaTrade>> {
    const result = new Map<string, AlpacaTrade>();

    try {
      const response = await this.request<{ trades: Record<string, unknown> }>(
        "/v2/stocks/trades/latest",
        { symbols: symbols.join(",") }
      );

      if (response?.trades) {
        for (const [symbol, trade] of Object.entries(response.trades)) {
          const t = trade as {
            p?: number;
            s?: number;
            t?: string;
            x?: string;
            i?: number;
            c?: string[];
            z?: string;
          };

          result.set(symbol, {
            symbol,
            price: t.p ?? 0,
            size: t.s ?? 0,
            timestamp: t.t ?? "",
            exchange: t.x,
            id: t.i,
            conditions: t.c,
            tape: t.z,
          });
        }
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  // ============================================
  // Options Methods
  // ============================================

  /**
   * Get option contracts for an underlying symbol.
   *
   * Note: Uses the trading API (/v2/options/contracts) as the market data API
   * doesn't have this endpoint. This returns contract metadata, not real-time quotes.
   */
  async getOptionContracts(
    underlying: string,
    params?: OptionContractParams
  ): Promise<AlpacaOptionContract[]> {
    const contracts: AlpacaOptionContract[] = [];

    try {
      const response = await this.tradingRequest<{ option_contracts?: unknown[] }>(
        "/v2/options/contracts",
        {
          underlying_symbols: underlying,
          expiration_date_gte: params?.expirationDateGte,
          expiration_date_lte: params?.expirationDateLte,
          root_symbol: params?.rootSymbol,
          type: params?.type,
          strike_price_gte: params?.strikePriceGte,
          strike_price_lte: params?.strikePriceLte,
          limit: params?.limit ?? 1000,
        }
      );

      if (response?.option_contracts && Array.isArray(response.option_contracts)) {
        for (const contract of response.option_contracts) {
          const c = contract as Record<string, unknown>;

          // Parse strike_price - it comes as a string from the trading API
          let strikePrice = 0;
          if (typeof c.strike_price === "string") {
            strikePrice = Number.parseFloat(c.strike_price);
          } else if (typeof c.strike_price === "number") {
            strikePrice = c.strike_price;
          }

          contracts.push({
            symbol: (c.symbol as string) ?? "",
            name: c.name as string | undefined,
            status: c.status as string | undefined,
            tradable: c.tradable as boolean | undefined,
            expirationDate: (c.expiration_date as string) ?? "",
            rootSymbol: c.root_symbol as string | undefined,
            underlyingSymbol: (c.underlying_symbol as string) ?? underlying,
            underlyingAssetId: c.underlying_asset_id as string | undefined,
            type: (c.type as "call" | "put") ?? "call",
            style: c.style as string | undefined,
            strikePrice,
            multiplier: c.multiplier as number | undefined,
            size: c.size as number | undefined,
            openInterest: c.open_interest as number | undefined,
            openInterestDate: c.open_interest_date as string | undefined,
            closePrice: c.close_price as number | undefined,
            closePriceDate: c.close_price_date as string | undefined,
          });
        }
      }
    } catch {
      // Return empty array on error
    }

    return contracts;
  }

  /**
   * Get the trading day to use for volume data.
   * Returns today during market hours, or the last trading day when closed.
   */
  private getTradingDayForVolume(): string {
    const now = new Date();
    const day = now.getDay();

    // Convert to ET (approximate: UTC-5 for EST, UTC-4 for EDT)
    // Using UTC-5 as conservative estimate
    const etHour = (now.getUTCHours() - 5 + 24) % 24;
    const etMinute = now.getUTCMinutes();

    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = etHour > 9 || (etHour === 9 && etMinute >= 30);
    const marketClose = etHour < 16;
    const isWeekday = day >= 1 && day <= 5;
    const isMarketOpen = isWeekday && marketOpen && marketClose;

    if (isMarketOpen) {
      // During market hours, use today
      return now.toISOString().slice(0, 10);
    }

    // Market is closed - find last trading day
    let daysBack = 0;

    if (day === 0) {
      // Sunday -> Friday
      daysBack = 2;
    } else if (day === 6) {
      // Saturday -> Friday
      daysBack = 1;
    } else if (day === 1 && !marketOpen) {
      // Monday before open -> Friday
      daysBack = 3;
    } else if (!marketOpen) {
      // Weekday before open -> previous day
      daysBack = 1;
    } else {
      // Weekday after close -> today (use today's final volume)
      daysBack = 0;
    }

    const tradingDay = new Date(now);
    tradingDay.setDate(tradingDay.getDate() - daysBack);
    return tradingDay.toISOString().slice(0, 10);
  }

  /**
   * Get option snapshots with Greeks.
   * Also fetches the last trading day's bars to get accurate volume data.
   * Batches requests to respect Alpaca's 100 symbol limit.
   */
  async getOptionSnapshots(symbols: string[]): Promise<Map<string, AlpacaOptionSnapshot>> {
    const result = new Map<string, AlpacaOptionSnapshot>();
    if (symbols.length === 0) {
      return result;
    }

    const BATCH_SIZE = 100;
    const tradingDay = this.getTradingDayForVolume();

    try {
      // Split symbols into batches of 100
      const batches: string[][] = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        batches.push(symbols.slice(i, i + BATCH_SIZE));
      }

      // Fetch all batches in parallel
      const batchPromises = batches.map(async (batch) => {
        const [snapshotRes, barsRes] = await Promise.all([
          this.request<{ snapshots: Record<string, unknown> }>("/v1beta1/options/snapshots", {
            symbols: batch.join(","),
          }),
          this.request<{ bars: Record<string, unknown[]> }>("/v1beta1/options/bars", {
            symbols: batch.join(","),
            timeframe: "1Day",
            start: tradingDay,
            limit: batch.length,
          }).catch(() => ({ bars: {} })),
        ]);
        return { snapshots: snapshotRes?.snapshots ?? {}, bars: barsRes?.bars ?? {} };
      });

      const batchResults = await Promise.all(batchPromises);

      // Merge all batch results
      const allSnapshots: Record<string, unknown> = {};
      const allBars: Record<string, unknown[]> = {};
      for (const { snapshots, bars } of batchResults) {
        Object.assign(allSnapshots, snapshots);
        Object.assign(allBars, bars);
      }

      // Build a map of symbol -> last trading day's volume from bars
      const volumeMap = new Map<string, number>();
      for (const [symbol, bars] of Object.entries(allBars)) {
        if (Array.isArray(bars) && bars.length > 0) {
          const bar = bars[0] as Record<string, unknown>;
          volumeMap.set(symbol, (bar.v as number) ?? 0);
        }
      }

      for (const [symbol, snapshot] of Object.entries(allSnapshots)) {
        const s = snapshot as Record<string, unknown>;

        const quote = s.latestQuote as Record<string, unknown> | undefined;
        const trade = s.latestTrade as Record<string, unknown> | undefined;
        const greeks = s.greeks as Record<string, unknown> | undefined;

        // Get volume from bars response
        const dailyVolume = volumeMap.get(symbol) ?? 0;

        result.set(symbol, {
          symbol,
          latestQuote: quote
            ? {
                bidPrice: (quote.bp as number) ?? 0,
                bidSize: (quote.bs as number) ?? 0,
                askPrice: (quote.ap as number) ?? 0,
                askSize: (quote.as as number) ?? 0,
                bidExchange: quote.bx as string | undefined,
                askExchange: quote.ax as string | undefined,
                timestamp: (quote.t as string) ?? "",
              }
            : undefined,
          latestTrade: trade
            ? {
                price: (trade.p as number) ?? 0,
                size: (trade.s as number) ?? 0,
                timestamp: (trade.t as string) ?? "",
                exchange: trade.x as string | undefined,
                conditions: trade.c as string[] | undefined,
              }
            : undefined,
          dailyBar: {
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: dailyVolume,
            timestamp: tradingDay,
          },
          greeks: greeks
            ? {
                delta: greeks.delta as number | undefined,
                gamma: greeks.gamma as number | undefined,
                theta: greeks.theta as number | undefined,
                vega: greeks.vega as number | undefined,
                rho: greeks.rho as number | undefined,
              }
            : undefined,
          impliedVolatility: s.impliedVolatility as number | undefined,
        });
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  /**
   * Get unique expiration dates for an underlying symbol.
   *
   * For high-volume symbols like TSLA, the API may only return near-term contracts
   * by default. This method queries multiple date ranges and uses pagination to
   * discover all available expirations up to 12 months out.
   */
  async getOptionExpirations(underlying: string): Promise<string[]> {
    const expirations = new Set<string>();

    // Generate date ranges to query (weekly intervals for 3 months, then monthly)
    const today = new Date();
    const dateRanges: Array<{ gte: string; lte: string }> = [];

    // First 3 months: query weekly to catch all weeklies
    for (let week = 0; week < 12; week++) {
      const start = new Date(today);
      start.setDate(start.getDate() + week * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      dateRanges.push({
        gte: start.toISOString().slice(0, 10),
        lte: end.toISOString().slice(0, 10),
      });
    }

    // Months 4-12: query monthly for monthlies/LEAPs
    for (let month = 3; month < 12; month++) {
      const start = new Date(today);
      start.setMonth(start.getMonth() + month);
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // Last day of month

      dateRanges.push({
        gte: start.toISOString().slice(0, 10),
        lte: end.toISOString().slice(0, 10),
      });
    }

    // Query each date range (can run in parallel for speed)
    const promises = dateRanges.map(async (range) => {
      try {
        const response = await this.tradingRequest<{ option_contracts?: unknown[] }>(
          "/v2/options/contracts",
          {
            underlying_symbols: underlying,
            expiration_date_gte: range.gte,
            expiration_date_lte: range.lte,
            limit: 10, // We only need 1 contract per expiration to discover it
          }
        );

        if (response?.option_contracts && Array.isArray(response.option_contracts)) {
          for (const contract of response.option_contracts) {
            const c = contract as Record<string, unknown>;
            const expDate = c.expiration_date as string | undefined;
            if (expDate) {
              expirations.add(expDate);
            }
          }
        }
      } catch {
        // Ignore errors for individual date ranges
      }
    });

    await Promise.all(promises);

    return Array.from(expirations).sort();
  }

  // ============================================
  // Corporate Actions Methods
  // ============================================

  /**
   * Get stock splits for a symbol.
   */
  async getStockSplits(symbol: string): Promise<AlpacaCorporateActionSplit[]> {
    const splits: AlpacaCorporateActionSplit[] = [];

    try {
      const response = await this.request<{ corporate_actions: Record<string, unknown> }>(
        "/v1beta1/corporate-actions",
        {
          symbols: symbol,
          types: "forward_split,reverse_split",
        }
      );

      if (response?.corporate_actions) {
        const actions = response.corporate_actions;

        const forwardSplits = actions.forward_splits as unknown[] | undefined;
        const reverseSplits = actions.reverse_splits as unknown[] | undefined;

        for (const split of [...(forwardSplits ?? []), ...(reverseSplits ?? [])]) {
          const s = split as Record<string, unknown>;

          splits.push({
            symbol: (s.symbol as string) ?? symbol,
            newRate: (s.new_rate as number) ?? 1,
            oldRate: (s.old_rate as number) ?? 1,
            processDate: (s.process_date as string) ?? "",
            exDate: (s.ex_date as string) ?? "",
            recordDate: s.record_date as string | undefined,
            payableDate: s.payable_date as string | undefined,
          });
        }
      }
    } catch {
      // Return empty array on error
    }

    return splits;
  }

  /**
   * Get dividends for a symbol.
   */
  async getDividends(symbol: string): Promise<AlpacaCorporateActionDividend[]> {
    const dividends: AlpacaCorporateActionDividend[] = [];

    try {
      const response = await this.request<{ corporate_actions: Record<string, unknown> }>(
        "/v1beta1/corporate-actions",
        {
          symbols: symbol,
          types: "cash_dividend",
        }
      );

      if (response?.corporate_actions) {
        const actions = response.corporate_actions;
        const cashDividends = actions.cash_dividends as unknown[] | undefined;

        for (const dividend of cashDividends ?? []) {
          const d = dividend as Record<string, unknown>;

          dividends.push({
            symbol: (d.symbol as string) ?? symbol,
            rate: (d.rate as number) ?? 0,
            special: d.special as boolean | undefined,
            foreign: d.foreign as boolean | undefined,
            exDate: (d.ex_date as string) ?? "",
            recordDate: d.record_date as string | undefined,
            payableDate: d.payable_date as string | undefined,
            processDate: d.process_date as string | undefined,
          });
        }
      }
    } catch {
      // Return empty array on error
    }

    return dividends;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an Alpaca client from environment variables.
 *
 * Uses CREAM_ENV to determine trading environment (PAPER/LIVE).
 */
export function createAlpacaClientFromEnv(): AlpacaMarketDataClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
  const creamEnv = process.env.CREAM_ENV ?? Bun.env.CREAM_ENV;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  // Default to PAPER for safety, only use LIVE if explicitly set
  const environment: TradingEnvironment = creamEnv === "LIVE" ? "LIVE" : "PAPER";

  return new AlpacaMarketDataClient({ apiKey, apiSecret, environment });
}

/**
 * Check if Alpaca credentials are available.
 */
export function isAlpacaConfigured(): boolean {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
  return Boolean(apiKey && apiSecret);
}
