/**
 * Alpaca Markets API Client
 *
 * Unified market data provider for stocks, options, and crypto.
 * Uses the official @alpacahq/typescript-sdk for REST API access.
 *
 * Features:
 * - Stock quotes, bars, and trades
 * - Options contracts, snapshots with Greeks
 * - Corporate actions (splits, dividends)
 * - Built-in rate limiting via SDK
 *
 * @see https://docs.alpaca.markets/docs/about-market-data-api
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { createClient } from "@alpacahq/typescript-sdk";
import { z } from "zod";

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

export interface AlpacaClientConfig {
  apiKey: string;
  apiSecret: string;
  paper?: boolean;
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

type AlpacaSDKClient = ReturnType<typeof createClient>;

/**
 * Alpaca Markets API client for REST endpoints.
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
 *   paper: process.env.CREAM_ENV !== "LIVE",
 * });
 *
 * const quotes = await client.getQuotes(["AAPL", "MSFT"]);
 * const bars = await client.getBars("AAPL", "1Hour", "2026-01-01", "2026-01-10");
 * ```
 */
export class AlpacaMarketDataClient {
  private client: AlpacaSDKClient;

  constructor(config: AlpacaClientConfig) {
    this.client = createClient({
      key: config.apiKey,
      secret: config.apiSecret,
      paper: config.paper ?? true,
    });
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
      const response = await this.client.getStocksQuotesLatest({
        symbols: symbols.join(","),
      });

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
      const response = await this.client.getStocksBars({
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
      const response = await this.client.getStocksSnapshots({
        symbols: symbols.join(","),
      });

      if (response?.snapshots) {
        for (const [symbol, snapshot] of Object.entries(response.snapshots)) {
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
      const response = await this.client.getStocksTradesLatest({
        symbols: symbols.join(","),
      });

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
   */
  async getOptionContracts(
    underlying: string,
    params?: OptionContractParams
  ): Promise<AlpacaOptionContract[]> {
    const contracts: AlpacaOptionContract[] = [];

    try {
      // Check if the SDK has the method
      const clientAny = this.client as Record<string, unknown>;
      const getOptionsContractsMethod = clientAny.getOptionsContracts;

      if (typeof getOptionsContractsMethod !== "function") {
        // SDK doesn't have this method yet, return empty array
        return contracts;
      }

      const response = (await getOptionsContractsMethod.call(this.client, {
        underlying_symbols: underlying,
        expiration_date_gte: params?.expirationDateGte,
        expiration_date_lte: params?.expirationDateLte,
        root_symbol: params?.rootSymbol,
        type: params?.type,
        strike_price_gte: params?.strikePriceGte,
        strike_price_lte: params?.strikePriceLte,
        limit: params?.limit ?? 1000,
      })) as { option_contracts?: unknown[] } | undefined;

      if (response?.option_contracts && Array.isArray(response.option_contracts)) {
        for (const contract of response.option_contracts) {
          const c = contract as Record<string, unknown>;

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
            strikePrice: (c.strike_price as number) ?? 0,
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
   * Get option snapshots with Greeks.
   */
  async getOptionSnapshots(symbols: string[]): Promise<Map<string, AlpacaOptionSnapshot>> {
    const result = new Map<string, AlpacaOptionSnapshot>();

    try {
      const response = await this.client.getOptionsSnapshots({
        symbols: symbols.join(","),
      });

      if (response?.snapshots) {
        for (const [symbol, snapshot] of Object.entries(response.snapshots)) {
          const s = snapshot as Record<string, unknown>;

          const quote = s.latestQuote as Record<string, unknown> | undefined;
          const trade = s.latestTrade as Record<string, unknown> | undefined;
          const greeks = s.greeks as Record<string, unknown> | undefined;

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
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  /**
   * Get unique expiration dates for an underlying symbol.
   */
  async getOptionExpirations(underlying: string): Promise<string[]> {
    const expirations = new Set<string>();

    const contracts = await this.getOptionContracts(underlying, { limit: 1000 });

    for (const contract of contracts) {
      if (contract.expirationDate) {
        expirations.add(contract.expirationDate);
      }
    }

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
      const response = await this.client.getStocksCorporateActions({
        symbols: symbol,
        types: "forward_split,reverse_split",
      });

      if (response?.corporate_actions) {
        const actions = response.corporate_actions as Record<string, unknown>;

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
      const response = await this.client.getStocksCorporateActions({
        symbols: symbol,
        types: "cash_dividend",
      });

      if (response?.corporate_actions) {
        const actions = response.corporate_actions as Record<string, unknown>;
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
 */
export function createAlpacaClientFromEnv(): AlpacaMarketDataClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  const env = process.env.CREAM_ENV ?? Bun.env.CREAM_ENV ?? "BACKTEST";
  const paper = env !== "LIVE";

  return new AlpacaMarketDataClient({ apiKey, apiSecret, paper });
}

/**
 * Check if Alpaca credentials are available.
 */
export function isAlpacaConfigured(): boolean {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
  return Boolean(apiKey && apiSecret);
}
