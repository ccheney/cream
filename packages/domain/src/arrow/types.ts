/**
 * Arrow Flight Client Types
 *
 * Type definitions for Arrow Flight data transport.
 */

/**
 * Arrow Flight endpoint configuration
 */
export interface FlightClientConfig {
  /** Flight server URL (e.g., "grpc://localhost:50052") */
  endpoint: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Enable TLS (default: false for development) */
  useTls?: boolean;

  /** TLS certificate path (required if useTls=true) */
  tlsCertPath?: string;

  /** Custom headers for authentication */
  headers?: Record<string, string>;
}

/**
 * Default Flight client configuration
 */
export const DEFAULT_FLIGHT_CONFIG: Required<Omit<FlightClientConfig, "endpoint" | "tlsCertPath">> = {
  timeoutMs: 30000,
  useTls: false,
  headers: {},
};

/**
 * Flight path descriptors for available data streams
 */
export const FlightPaths = {
  /** Historical OHLCV candles: /candles/{symbol}/{timeframe} */
  candles: (symbol: string, timeframe: string) => ["candles", symbol, timeframe],

  /** Tick-level market data: /ticks/{symbol} */
  ticks: (symbol: string) => ["ticks", symbol],

  /** Historical option chains: /chains/{underlying}/{date} */
  chains: (underlying: string, date: string) => ["chains", underlying, date],

  /** Portfolio value time series: /portfolio/history */
  portfolioHistory: () => ["portfolio", "history"],
} as const;

/**
 * Candle data row from Arrow Flight
 */
export interface CandleRow {
  /** Symbol */
  symbol: string;
  /** Bar open timestamp (ISO 8601) */
  timestamp: string;
  /** Timeframe in minutes */
  timeframeMinutes: number;
  /** Open price */
  open: number;
  /** High price */
  high: number;
  /** Low price */
  low: number;
  /** Close price */
  close: number;
  /** Volume */
  volume: number;
  /** VWAP (optional) */
  vwap?: number;
}

/**
 * Tick data row from Arrow Flight
 */
export interface TickRow {
  /** Symbol */
  symbol: string;
  /** Tick timestamp (ISO 8601) */
  timestamp: string;
  /** Bid price */
  bid: number;
  /** Ask price */
  ask: number;
  /** Bid size */
  bidSize: number;
  /** Ask size */
  askSize: number;
  /** Last trade price */
  last: number;
  /** Last trade size */
  lastSize: number;
}

/**
 * Option contract row from Arrow Flight
 */
export interface OptionContractRow {
  /** Option symbol (OCC format) */
  symbol: string;
  /** Underlying symbol */
  underlying: string;
  /** Strike price */
  strike: number;
  /** Expiration date (YYYY-MM-DD) */
  expiration: string;
  /** Option type (call/put) */
  type: "call" | "put";
  /** Bid price */
  bid: number;
  /** Ask price */
  ask: number;
  /** Last price */
  last: number;
  /** Volume */
  volume: number;
  /** Open interest */
  openInterest: number;
  /** Implied volatility */
  impliedVolatility?: number;
  /** Delta */
  delta?: number;
  /** Gamma */
  gamma?: number;
  /** Theta */
  theta?: number;
  /** Vega */
  vega?: number;
}

/**
 * Portfolio history row from Arrow Flight
 */
export interface PortfolioHistoryRow {
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Total equity */
  equity: number;
  /** Cash balance */
  cash: number;
  /** Buying power */
  buyingPower: number;
  /** Day P&L */
  dayPnl: number;
  /** Total unrealized P&L */
  unrealizedPnl: number;
  /** Total realized P&L */
  realizedPnl: number;
}

/**
 * Flight data stream result
 */
export interface FlightResult<T> {
  /** Data rows */
  rows: T[];
  /** Number of rows returned */
  rowCount: number;
  /** Retrieval duration in milliseconds */
  durationMs: number;
  /** Whether more data is available (pagination) */
  hasMore: boolean;
}

/**
 * Flight error
 */
export class FlightError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = "FlightError";
    this.code = code;
    this.retryable = retryable;
  }

  /**
   * Create from a gRPC error
   */
  static fromGrpcError(error: unknown): FlightError {
    if (error instanceof Error) {
      // Check for known gRPC error codes
      const message = error.message.toLowerCase();
      if (message.includes("unavailable") || message.includes("deadline")) {
        return new FlightError(error.message, "UNAVAILABLE", true);
      }
      return new FlightError(error.message, "UNKNOWN", false);
    }
    return new FlightError(String(error), "UNKNOWN", false);
  }
}
