/**
 * Mock Market Data Adapters
 *
 * Simulates market data providers (Polygon, Databento) for testing.
 * Loads data from JSON fixtures or generates deterministic test data.
 *
 * @see docs/plans/14-testing.md for mocking strategy
 */

import {
  type Candle,
  createBearTrendSnapshot,
  createBullTrendSnapshot,
  createHighVolSnapshot,
  createRangeBoundSnapshot,
  type Indicators,
  type SymbolSnapshot,
} from "@cream/test-fixtures";

// ============================================
// Types
// ============================================

/**
 * Timeframe for candle data
 */
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

/**
 * Quote data
 */
export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  timestamp: string;
}

/**
 * Trade data (tick)
 */
export interface Trade {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange?: string;
}

/**
 * Option chain entry
 */
export interface OptionChainEntry {
  contractId: string;
  underlying: string;
  expiration: string;
  strike: number;
  optionType: "CALL" | "PUT";
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

/**
 * Failure type for injection
 */
export type MarketDataFailureType =
  | "API_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "INVALID_SYMBOL";

/**
 * Mock market data configuration
 */
export interface MockMarketDataConfig {
  /** Simulated API response delay (ms) */
  responseDelay?: number;
  /** Simulate failures */
  simulateFailure?: boolean;
  /** Type of failure to simulate */
  failureType?: MarketDataFailureType;
  /** Pre-loaded snapshots by symbol */
  snapshots?: Map<string, SymbolSnapshot>;
  /** Pre-loaded candles by symbol and timeframe */
  candles?: Map<string, Map<Timeframe, Candle[]>>;
  /** Pre-loaded quotes by symbol */
  quotes?: Map<string, Quote>;
  /** Use deterministic behavior */
  deterministic?: boolean;
}

// ============================================
// Mock Polygon Adapter
// ============================================

/**
 * Mock Polygon/Massive Market Data Adapter
 *
 * Simulates Polygon API for testing:
 * - Candle data (OHLCV)
 * - Quotes (bid/ask)
 * - Option chains
 * - Technical indicators
 */
export class MockPolygonAdapter {
  private config: Required<MockMarketDataConfig>;
  private snapshots: Map<string, SymbolSnapshot>;
  private candles: Map<string, Map<Timeframe, Candle[]>>;
  private quotes: Map<string, Quote>;

  constructor(config: MockMarketDataConfig = {}) {
    this.config = {
      responseDelay: config.responseDelay ?? 10,
      simulateFailure: config.simulateFailure ?? false,
      failureType: config.failureType ?? "API_ERROR",
      snapshots: config.snapshots ?? new Map(),
      candles: config.candles ?? new Map(),
      quotes: config.quotes ?? new Map(),
      deterministic: config.deterministic ?? true,
    };

    this.snapshots = new Map(config.snapshots ?? []);
    this.candles = new Map(config.candles ?? []);
    this.quotes = new Map(config.quotes ?? []);

    // Load default fixtures if no data provided
    if (this.snapshots.size === 0) {
      this.loadDefaultFixtures();
    }
  }

  /**
   * Load default test fixtures
   */
  private loadDefaultFixtures(): void {
    const bullSnapshot = createBullTrendSnapshot();
    const bearSnapshot = createBearTrendSnapshot();
    const highVolSnapshot = createHighVolSnapshot();
    const rangeSnapshot = createRangeBoundSnapshot();

    for (const symbol of bullSnapshot.symbols) {
      this.snapshots.set(symbol.symbol, symbol);
    }
    for (const symbol of bearSnapshot.symbols) {
      this.snapshots.set(symbol.symbol, symbol);
    }
    for (const symbol of highVolSnapshot.symbols) {
      this.snapshots.set(symbol.symbol, symbol);
    }
    for (const symbol of rangeSnapshot.symbols) {
      this.snapshots.set(symbol.symbol, symbol);
    }
  }

  // ============================================
  // Candle Methods
  // ============================================

  /**
   * Get candle data for a symbol
   */
  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<Candle[]> {
    await this.simulateDelay();
    this.checkFailure();

    // Check pre-loaded candles
    const symbolCandles = this.candles.get(symbol);
    if (symbolCandles) {
      const tfCandles = symbolCandles.get(timeframe);
      if (tfCandles) {
        return tfCandles.slice(-limit);
      }
    }

    // Check snapshot for candles
    const snapshot = this.snapshots.get(symbol);
    if (snapshot?.candles) {
      return snapshot.candles.slice(-limit);
    }

    // Generate default candles
    return this.generateCandles(symbol, limit);
  }

  /**
   * Generate synthetic candles for testing
   */
  private generateCandles(_symbol: string, count: number): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = new Date(now - i * 60 * 60 * 1000).toISOString();
      const change = this.config.deterministic ? 0 : (Math.random() - 0.5) * 2;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.abs(change) * 0.5;

      candles.push({
        timestamp,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: 1000000,
      });

      price = close;
    }

    return candles;
  }

  // ============================================
  // Quote Methods
  // ============================================

  /**
   * Get current quote for a symbol
   */
  async getQuote(symbol: string): Promise<Quote> {
    await this.simulateDelay();
    this.checkFailure();

    // Check pre-loaded quotes
    const quote = this.quotes.get(symbol);
    if (quote) {
      return { ...quote };
    }

    // Check snapshot
    const snapshot = this.snapshots.get(symbol);
    if (snapshot) {
      return {
        symbol,
        bid: snapshot.bid ?? snapshot.lastPrice - 0.05,
        ask: snapshot.ask ?? snapshot.lastPrice + 0.05,
        bidSize: snapshot.bidSize ?? 500,
        askSize: snapshot.askSize ?? 500,
        timestamp: new Date().toISOString(),
      };
    }

    // Generate default quote
    return {
      symbol,
      bid: 99.95,
      ask: 100.05,
      bidSize: 500,
      askSize: 500,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get quotes for multiple symbols
   */
  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();
    for (const symbol of symbols) {
      quotes.set(symbol, await this.getQuote(symbol));
    }
    return quotes;
  }

  // ============================================
  // Snapshot Methods
  // ============================================

  /**
   * Get market snapshot for a symbol
   */
  async getSnapshot(symbol: string): Promise<SymbolSnapshot | undefined> {
    await this.simulateDelay();
    this.checkFailure();

    const snapshot = this.snapshots.get(symbol);
    return snapshot ? { ...snapshot } : undefined;
  }

  /**
   * Get market snapshot with indicators
   */
  async getSnapshotWithIndicators(
    symbol: string
  ): Promise<{ snapshot: SymbolSnapshot; indicators: Indicators } | undefined> {
    const snapshot = await this.getSnapshot(symbol);
    if (!snapshot) {
      return undefined;
    }

    return {
      snapshot,
      indicators: snapshot.indicators,
    };
  }

  // ============================================
  // Option Chain Methods
  // ============================================

  /**
   * Get option chain for a symbol
   */
  async getOptionChain(symbol: string, expirationDate?: string): Promise<OptionChainEntry[]> {
    await this.simulateDelay();
    this.checkFailure();

    // Generate synthetic option chain
    const snapshot = this.snapshots.get(symbol);
    const underlyingPrice = snapshot?.lastPrice ?? 100;
    const expiration = expirationDate ?? this.getNextExpiration();

    return this.generateOptionChain(symbol, underlyingPrice, expiration);
  }

  /**
   * Generate synthetic option chain
   */
  private generateOptionChain(
    underlying: string,
    underlyingPrice: number,
    expiration: string
  ): OptionChainEntry[] {
    const chain: OptionChainEntry[] = [];
    const strikes = [
      underlyingPrice * 0.9,
      underlyingPrice * 0.95,
      underlyingPrice,
      underlyingPrice * 1.05,
      underlyingPrice * 1.1,
    ];

    for (const strike of strikes) {
      const roundedStrike = Math.round(strike);

      // CALL
      chain.push({
        contractId: `${underlying}${expiration.replace(/-/g, "")}C${roundedStrike.toString().padStart(8, "0")}`,
        underlying,
        expiration,
        strike: roundedStrike,
        optionType: "CALL",
        bid: 2.5,
        ask: 2.75,
        lastPrice: 2.6,
        volume: 1000,
        openInterest: 5000,
        impliedVolatility: 0.3,
        delta: 0.5,
        gamma: 0.05,
        theta: -0.02,
        vega: 0.1,
      });

      // PUT
      chain.push({
        contractId: `${underlying}${expiration.replace(/-/g, "")}P${roundedStrike.toString().padStart(8, "0")}`,
        underlying,
        expiration,
        strike: roundedStrike,
        optionType: "PUT",
        bid: 2.3,
        ask: 2.55,
        lastPrice: 2.4,
        volume: 800,
        openInterest: 4000,
        impliedVolatility: 0.32,
        delta: -0.5,
        gamma: 0.05,
        theta: -0.02,
        vega: 0.1,
      });
    }

    return chain;
  }

  /**
   * Get next monthly expiration
   */
  private getNextExpiration(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 21);
    return nextMonth.toISOString().slice(0, 10);
  }

  // ============================================
  // Configuration Methods
  // ============================================

  /**
   * Set snapshot data for a symbol
   */
  setSnapshot(symbol: string, snapshot: SymbolSnapshot): void {
    this.snapshots.set(symbol, snapshot);
  }

  /**
   * Set candle data for a symbol
   */
  setCandles(symbol: string, timeframe: Timeframe, candles: Candle[]): void {
    if (!this.candles.has(symbol)) {
      this.candles.set(symbol, new Map());
    }
    this.candles.get(symbol)?.set(timeframe, candles);
  }

  /**
   * Set quote data for a symbol
   */
  setQuote(symbol: string, quote: Quote): void {
    this.quotes.set(symbol, quote);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.snapshots.clear();
    this.candles.clear();
    this.quotes.clear();
    this.loadDefaultFixtures();
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Simulate API delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.responseDelay));
    }
  }

  /**
   * Check and throw failure if configured
   */
  private checkFailure(): void {
    if (this.config.simulateFailure) {
      throw new Error(`MockPolygon: ${this.config.failureType}`);
    }
  }
}

// ============================================
// Mock Databento Adapter
// ============================================

/**
 * Mock Databento Market Data Adapter
 *
 * Simulates Databento tick data feed for testing:
 * - Real-time quotes
 * - Trade ticks
 * - Order book snapshots
 */
export class MockDatabentoAdapter {
  private config: Required<MockMarketDataConfig>;
  private trades: Map<string, Trade[]>;
  private quotes: Map<string, Quote>;

  constructor(config: MockMarketDataConfig = {}) {
    this.config = {
      responseDelay: config.responseDelay ?? 5,
      simulateFailure: config.simulateFailure ?? false,
      failureType: config.failureType ?? "API_ERROR",
      snapshots: config.snapshots ?? new Map(),
      candles: config.candles ?? new Map(),
      quotes: config.quotes ?? new Map(),
      deterministic: config.deterministic ?? true,
    };

    this.trades = new Map();
    this.quotes = new Map(config.quotes ?? []);
  }

  /**
   * Get recent trades for a symbol
   */
  async getTrades(symbol: string, limit = 100): Promise<Trade[]> {
    await this.simulateDelay();
    this.checkFailure();

    const trades = this.trades.get(symbol);
    if (trades) {
      return trades.slice(-limit);
    }

    // Generate synthetic trades
    return this.generateTrades(symbol, limit);
  }

  /**
   * Generate synthetic trade data
   */
  private generateTrades(symbol: string, count: number): Trade[] {
    const trades: Trade[] = [];
    let price = 100;
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = new Date(now - i * 1000).toISOString();
      const change = this.config.deterministic ? 0 : (Math.random() - 0.5) * 0.1;
      price += change;

      trades.push({
        symbol,
        price: Math.round(price * 100) / 100,
        size: 100,
        timestamp,
        exchange: "XNAS",
      });
    }

    return trades;
  }

  /**
   * Get current quote
   */
  async getQuote(symbol: string): Promise<Quote> {
    await this.simulateDelay();
    this.checkFailure();

    const quote = this.quotes.get(symbol);
    if (quote) {
      return { ...quote };
    }

    return {
      symbol,
      bid: 99.95,
      ask: 100.05,
      bidSize: 500,
      askSize: 500,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Set trade data for testing
   */
  setTrades(symbol: string, trades: Trade[]): void {
    this.trades.set(symbol, trades);
  }

  /**
   * Set quote data for testing
   */
  setQuote(symbol: string, quote: Quote): void {
    this.quotes.set(symbol, quote);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.trades.clear();
    this.quotes.clear();
  }

  /**
   * Simulate API delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.responseDelay));
    }
  }

  /**
   * Check and throw failure if configured
   */
  private checkFailure(): void {
    if (this.config.simulateFailure) {
      throw new Error(`MockDatabento: ${this.config.failureType}`);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a mock Polygon adapter
 */
export function createMockPolygon(config?: MockMarketDataConfig): MockPolygonAdapter {
  return new MockPolygonAdapter(config);
}

/**
 * Create a mock Databento adapter
 */
export function createMockDatabento(config?: MockMarketDataConfig): MockDatabentoAdapter {
  return new MockDatabentoAdapter(config);
}
