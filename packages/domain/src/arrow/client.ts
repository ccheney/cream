/**
 * Arrow Flight Client for TypeScript
 *
 * Provides bulk data retrieval from the Rust execution engine
 * using Apache Arrow Flight RPC.
 *
 * Flight paths:
 * - /candles/{symbol}/{timeframe}: Historical OHLCV data
 * - /ticks/{symbol}: Tick-level market data
 * - /chains/{underlying}/{date}: Historical option chains
 * - /portfolio/history: Portfolio value time series
 * - /market_data: Real-time market data snapshots (currently implemented)
 */

import { createFlightServiceClient, type FlightServiceClient } from "./flight-client.js";
import {
  type CandleRow,
  DEFAULT_FLIGHT_CONFIG,
  type FlightClientConfig,
  FlightError,
  FlightPaths,
  type FlightResult,
  type OptionContractRow,
  type PortfolioHistoryRow,
  type TickRow,
} from "./types.js";

/**
 * Market data snapshot from Arrow Flight
 */
export interface MarketDataRow {
  symbol: string;
  bid_price: number;
  ask_price: number;
  last_price: number;
  volume: bigint;
  timestamp: bigint;
}

/**
 * Arrow Flight client for bulk data retrieval
 *
 * This client wraps the low-level FlightServiceClient and provides
 * a high-level API for retrieving market data and historical data.
 *
 * Currently implemented endpoints (from Rust server):
 * - market_data: Real-time market data snapshots
 *
 * Planned endpoints (require server-side implementation):
 * - candles/{symbol}/{timeframe}: Historical OHLCV
 * - ticks/{symbol}: Tick-level data
 * - chains/{underlying}/{date}: Historical option chains
 * - portfolio/history: Portfolio value history
 */
export class ArrowFlightClient {
  private connected = false;
  private config: FlightClientConfig;
  private flightClient: FlightServiceClient | null = null;

  constructor(config: FlightClientConfig) {
    this.config = {
      ...DEFAULT_FLIGHT_CONFIG,
      ...config,
    };
  }

  /**
   * Connect to the Flight server
   */
  async connect(): Promise<void> {
    // Create the gRPC Flight client
    // Convert "grpc://host:port" to "http://host:port" for Connect-ES
    const baseUrl = this.config.endpoint.replace(/^grpc:\/\//, "http://");

    this.flightClient = createFlightServiceClient(baseUrl, {
      maxRetries: 3,
      enableLogging: false,
    });

    // Verify connection with health check
    try {
      await this.flightClient.healthCheck();
      this.connected = true;
    } catch {
      // If health check fails, still mark as connected but warn
      // The server may not support the health_check action
      this.connected = true;
    }
  }

  /**
   * Disconnect from the Flight server
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.flightClient = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get real-time market data snapshots
   *
   * This is the primary endpoint currently supported by the Rust server.
   *
   * @returns Market data rows
   */
  async getMarketData(): Promise<FlightResult<MarketDataRow>> {
    const client = this.ensureConnected();

    const startTime = Date.now();

    try {
      const result = await client.doGetAndDecode<MarketDataRow>("market_data");

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    } catch (error) {
      throw FlightError.fromGrpcError(error);
    }
  }

  /**
   * Get historical candle data
   *
   * Note: Requires server-side implementation of /candles/{symbol}/{timeframe} endpoint.
   * Currently returns empty result until the Rust server is extended.
   *
   * @param symbol - Instrument symbol (e.g., "AAPL")
   * @param timeframe - Bar timeframe (e.g., "1m", "5m", "1h", "1d")
   * @param options - Query options
   * @returns Candle rows
   */
  async getCandles(
    symbol: string,
    timeframe: string,
    options?: {
      from?: Date;
      to?: Date;
      limit?: number;
    }
  ): Promise<FlightResult<CandleRow>> {
    const client = this.ensureConnected();

    const startTime = Date.now();
    const path = FlightPaths.candles(symbol, timeframe);
    const ticketPath = path.join("/");

    try {
      // Try to get data from the server
      const result = await client.doGetAndDecode<CandleRow>(ticketPath);

      // Apply options filtering if needed
      let rows = result.rows;
      if (options?.from || options?.to || options?.limit) {
        rows = rows.filter((row) => {
          const ts = new Date(row.timestamp);
          if (options.from && ts < options.from) {
            return false;
          }
          if (options.to && ts > options.to) {
            return false;
          }
          return true;
        });
        if (options.limit) {
          rows = rows.slice(0, options.limit);
        }
      }

      return {
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    } catch {
      // Endpoint may not be implemented yet - return empty result
      return {
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    }
  }

  /**
   * Get tick-level market data
   *
   * Note: Requires server-side implementation of /ticks/{symbol} endpoint.
   * Currently returns empty result until the Rust server is extended.
   *
   * @param symbol - Instrument symbol
   * @param options - Query options
   * @returns Tick rows
   */
  async getTicks(
    symbol: string,
    options?: {
      from?: Date;
      to?: Date;
      limit?: number;
    }
  ): Promise<FlightResult<TickRow>> {
    const client = this.ensureConnected();

    const startTime = Date.now();
    const path = FlightPaths.ticks(symbol);
    const ticketPath = path.join("/");

    try {
      const result = await client.doGetAndDecode<TickRow>(ticketPath);

      let rows = result.rows;
      if (options?.from || options?.to || options?.limit) {
        rows = rows.filter((row) => {
          const ts = new Date(row.timestamp);
          if (options.from && ts < options.from) {
            return false;
          }
          if (options.to && ts > options.to) {
            return false;
          }
          return true;
        });
        if (options.limit) {
          rows = rows.slice(0, options.limit);
        }
      }

      return {
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    } catch {
      return {
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    }
  }

  /**
   * Get historical option chain
   *
   * Note: Requires server-side implementation of /chains/{underlying}/{date} endpoint.
   * Currently returns empty result until the Rust server is extended.
   *
   * @param underlying - Underlying symbol
   * @param date - Date in YYYY-MM-DD format
   * @param options - Query options
   * @returns Option contract rows
   */
  async getOptionChain(
    underlying: string,
    date: string,
    options?: {
      minStrike?: number;
      maxStrike?: number;
      expirations?: string[];
    }
  ): Promise<FlightResult<OptionContractRow>> {
    const client = this.ensureConnected();

    const startTime = Date.now();
    const path = FlightPaths.chains(underlying, date);
    const ticketPath = path.join("/");

    try {
      const result = await client.doGetAndDecode<OptionContractRow>(ticketPath);

      let rows = result.rows;
      if (options?.minStrike || options?.maxStrike || options?.expirations) {
        rows = rows.filter((row) => {
          if (options.minStrike && row.strike < options.minStrike) {
            return false;
          }
          if (options.maxStrike && row.strike > options.maxStrike) {
            return false;
          }
          if (options.expirations && !options.expirations.includes(row.expiration)) {
            return false;
          }
          return true;
        });
      }

      return {
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    } catch {
      return {
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    }
  }

  /**
   * Get portfolio value history
   *
   * Note: Requires server-side implementation of /portfolio/history endpoint.
   * Currently returns empty result until the Rust server is extended.
   *
   * @param options - Query options
   * @returns Portfolio history rows
   */
  async getPortfolioHistory(options?: {
    from?: Date;
    to?: Date;
    resolution?: "minute" | "hour" | "day";
  }): Promise<FlightResult<PortfolioHistoryRow>> {
    const client = this.ensureConnected();

    const startTime = Date.now();
    const path = FlightPaths.portfolioHistory();
    const ticketPath = path.join("/");

    try {
      const result = await client.doGetAndDecode<PortfolioHistoryRow>(ticketPath);

      let rows = result.rows;
      if (options?.from || options?.to) {
        rows = rows.filter((row) => {
          const ts = new Date(row.timestamp);
          if (options.from && ts < options.from) {
            return false;
          }
          if (options.to && ts > options.to) {
            return false;
          }
          return true;
        });
      }

      return {
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    } catch {
      return {
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
        hasMore: false,
      };
    }
  }

  /**
   * List available Flight paths
   */
  async listFlights(): Promise<string[][]> {
    const client = this.ensureConnected();

    try {
      const result = await client.listFlights();

      // Extract paths from FlightInfo
      const paths: string[][] = [];
      for (const flight of result.data) {
        if (flight.flightDescriptor?.path) {
          paths.push(flight.flightDescriptor.path);
        }
      }

      return paths;
    } catch {
      // Return known paths if listFlights fails
      return [
        ["market_data"],
        ["candles", "{symbol}", "{timeframe}"],
        ["ticks", "{symbol}"],
        ["chains", "{underlying}", "{date}"],
        ["portfolio", "history"],
      ];
    }
  }

  /**
   * Execute a server action
   *
   * @param actionType - Action type (e.g., "health_check", "clear_cache")
   * @returns Action result as string
   */
  async doAction(actionType: string): Promise<string> {
    const client = this.ensureConnected();

    try {
      const result = await client.doAction(actionType);
      return new TextDecoder().decode(result.data[0] ?? new Uint8Array());
    } catch (error) {
      throw FlightError.fromGrpcError(error);
    }
  }

  /**
   * Ensure the client is connected and return the flight client
   */
  private ensureConnected(): FlightServiceClient {
    if (!this.connected || !this.flightClient) {
      throw new FlightError(
        "Not connected to Flight server. Call connect() first.",
        "NOT_CONNECTED",
        false
      );
    }
    return this.flightClient;
  }
}

/**
 * Create an Arrow Flight client with default configuration
 */
export function createFlightClient(
  endpoint: string,
  options?: Partial<Omit<FlightClientConfig, "endpoint">>
): ArrowFlightClient {
  return new ArrowFlightClient({ endpoint, ...options });
}
