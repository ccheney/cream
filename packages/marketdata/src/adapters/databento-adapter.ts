/**
 * Databento Market Data Adapter
 *
 * Implements the MarketDataAdapter interface using Databento's WebSocket client
 * for real-time market data. Provides execution-grade quotes and candles.
 *
 * @see docs/plans/02-data-layer.md
 */

import type { AdapterCandle, AdapterQuote, MarketDataAdapter } from "../factory";
import {
  ConnectionState,
  createDatabentoClientFromEnv,
  type DatabentoClient,
  type DatabentoDataset,
  type DatabentoEvent,
  type DatabentoMessage,
  type QuoteMessage,
  type TradeMessage,
} from "../providers/databento";

// ============================================
// Types
// ============================================

/**
 * Configuration for the Databento adapter.
 */
export interface DatabentoAdapterConfig {
  /** Cache TTL in milliseconds for quotes. Default: 100ms */
  quoteCacheTtlMs?: number;
  /** Stale threshold in milliseconds. Default: 5000ms */
  staleThresholdMs?: number;
}

/**
 * Cached quote with timestamp.
 */
interface CachedQuote {
  quote: AdapterQuote;
  timestamp: number;
}

// ============================================
// Databento Market Data Adapter
// ============================================

/**
 * Market data adapter that uses Databento for real-time data.
 *
 * Wraps the DatabentoClient WebSocket for streaming quotes and trades.
 * Provides quote caching with configurable TTL for performance.
 *
 * @example
 * ```ts
 * const adapter = createDatabentoAdapter();
 * await adapter.connect(["AAPL", "MSFT"]);
 *
 * const quote = await adapter.getQuote("AAPL");
 * const quotes = await adapter.getQuotes(["AAPL", "MSFT"]);
 * ```
 */
export class DatabentoMarketDataAdapter implements MarketDataAdapter {
  private readonly client: DatabentoClient;
  private readonly quoteCache: Map<string, CachedQuote> = new Map();
  private readonly lastTrade: Map<string, number> = new Map();
  private readonly quoteCacheTtlMs: number;
  private readonly staleThresholdMs: number;
  private connected = false;

  constructor(client: DatabentoClient, config?: DatabentoAdapterConfig) {
    this.client = client;
    this.quoteCacheTtlMs = config?.quoteCacheTtlMs ?? 100;
    this.staleThresholdMs = config?.staleThresholdMs ?? 5000;

    // Register event handler for incoming messages
    this.client.on(this.handleEvent.bind(this));
  }

  /**
   * Connect to Databento and subscribe to symbols.
   *
   * @param symbols - Symbols to subscribe to
   * @param dataset - Databento dataset (default: XNAS.ITCH)
   */
  async connect(symbols: string[], dataset: DatabentoDataset = "XNAS.ITCH"): Promise<void> {
    await this.client.connect();

    // Subscribe to BBO quotes and trades
    await this.client.subscribe({
      dataset,
      schema: "mbp-1",
      symbols,
    });

    await this.client.subscribe({
      dataset,
      schema: "trades",
      symbols,
    });

    this.connected = true;
  }

  /**
   * Disconnect from Databento.
   */
  disconnect(): void {
    this.client.disconnect();
    this.connected = false;
    this.quoteCache.clear();
    this.lastTrade.clear();
  }

  /**
   * Handle incoming events from Databento.
   */
  private handleEvent(event: DatabentoEvent): void {
    if (event.type === "message") {
      this.handleMessage(event.message, event.schema);
    } else if (event.type === "disconnected") {
      this.connected = false;
    } else if (event.type === "connected" || event.type === "authenticated") {
      // Connection events - state managed by client
    }
  }

  /**
   * Handle an incoming message.
   */
  private handleMessage(message: DatabentoMessage, schema: string): void {
    if (schema === "mbp-1" || schema === "tbbo") {
      this.handleQuote(message as QuoteMessage);
    } else if (schema === "trades") {
      this.handleTrade(message as TradeMessage);
    }
  }

  /**
   * Handle a quote message.
   */
  private handleQuote(quote: QuoteMessage): void {
    const symbol = quote.symbol;
    if (!symbol) {
      return;
    }

    const now = Date.now();
    const lastPrice = this.lastTrade.get(symbol) ?? 0;

    const cachedQuote: CachedQuote = {
      quote: {
        symbol,
        bid: quote.bid_px,
        ask: quote.ask_px,
        bidSize: quote.bid_sz,
        askSize: quote.ask_sz,
        last: lastPrice,
        timestamp: Math.floor(quote.ts_event / 1_000_000), // ns to ms
      },
      timestamp: now,
    };

    this.quoteCache.set(symbol, cachedQuote);
  }

  /**
   * Handle a trade message.
   */
  private handleTrade(trade: TradeMessage): void {
    const symbol = trade.symbol;
    if (!symbol) {
      return;
    }

    this.lastTrade.set(symbol, trade.price);

    // Update cached quote's last price if exists
    const cached = this.quoteCache.get(symbol);
    if (cached) {
      cached.quote.last = trade.price;
    }
  }

  // ============================================
  // MarketDataAdapter Implementation
  // ============================================

  async getCandles(
    symbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    from: string,
    to: string
  ): Promise<AdapterCandle[]> {
    // Databento historical API for candles
    // For now, return empty - implement when needed
    void symbol;
    void timeframe;
    void from;
    void to;
    return [];
  }

  async getQuote(symbol: string): Promise<AdapterQuote | null> {
    const cached = this.quoteCache.get(symbol);
    if (!cached) {
      return null;
    }

    // Check staleness
    const age = Date.now() - cached.timestamp;
    if (age > this.staleThresholdMs) {
      return null;
    }

    return cached.quote;
  }

  async getQuotes(symbols: string[]): Promise<Map<string, AdapterQuote>> {
    const result = new Map<string, AdapterQuote>();

    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) {
        result.set(symbol, quote);
      }
    }

    return result;
  }

  isReady(): boolean {
    return this.connected && this.client.getState() === ConnectionState.SUBSCRIBED;
  }

  getType(): "databento" {
    return "databento";
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a Databento adapter from environment configuration.
 *
 * @param config - Optional adapter configuration
 * @returns Databento market data adapter (not yet connected)
 */
export function createDatabentoAdapter(
  config?: DatabentoAdapterConfig
): DatabentoMarketDataAdapter {
  const client = createDatabentoClientFromEnv();
  return new DatabentoMarketDataAdapter(client, config);
}

/**
 * Create and connect a Databento adapter.
 *
 * @param symbols - Symbols to subscribe to
 * @param config - Optional adapter configuration
 * @param dataset - Databento dataset (default: XNAS.ITCH)
 * @returns Connected Databento adapter
 */
export async function createConnectedDatabentoAdapter(
  symbols: string[],
  config?: DatabentoAdapterConfig,
  dataset?: DatabentoDataset
): Promise<DatabentoMarketDataAdapter> {
  const adapter = createDatabentoAdapter(config);
  await adapter.connect(symbols, dataset);
  return adapter;
}
