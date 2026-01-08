/**
 * Alpaca Broker Client
 *
 * Type-safe client for Alpaca Markets API with environment-aware
 * safety checks and multi-leg options support.
 *
 * @see docs/plans/07-execution.md
 */

import type { Account, Order, OrderRequest, Position, TradingEnvironment } from "./types.js";
import { BrokerError } from "./types.js";
import { generateOrderId, validateLegRatios } from "./utils.js";

/**
 * Alpaca client configuration.
 */
export interface AlpacaClientConfig {
  /** API key (ALPACA_KEY env var) */
  apiKey: string;
  /** API secret (ALPACA_SECRET env var) */
  apiSecret: string;
  /** Trading environment */
  environment: TradingEnvironment;
  /** Order ID prefix for namespacing (default: environment prefix) */
  orderIdPrefix?: string;
  /** Require explicit confirmation for LIVE orders (default: true) */
  requireLiveConfirmation?: boolean;
}

/**
 * Alpaca API endpoints.
 */
const ENDPOINTS = {
  PAPER: "https://paper-api.alpaca.markets",
  LIVE: "https://api.alpaca.markets",
  DATA: "https://data.alpaca.markets",
} as const;

/**
 * Alpaca broker client interface.
 */
export interface AlpacaClient {
  /**
   * Get account information.
   */
  getAccount(): Promise<Account>;

  /**
   * Get all positions.
   */
  getPositions(): Promise<Position[]>;

  /**
   * Get a specific position by symbol.
   */
  getPosition(symbol: string): Promise<Position | null>;

  /**
   * Submit an order.
   *
   * @param request - Order request
   * @returns Submitted order
   * @throws BrokerError on failure
   */
  submitOrder(request: OrderRequest): Promise<Order>;

  /**
   * Cancel an order.
   *
   * @param orderId - Alpaca order ID or client order ID
   */
  cancelOrder(orderId: string): Promise<void>;

  /**
   * Get an order by ID.
   */
  getOrder(orderId: string): Promise<Order | null>;

  /**
   * Get all orders (optionally filtered by status).
   */
  getOrders(status?: "open" | "closed" | "all"): Promise<Order[]>;

  /**
   * Close a position.
   *
   * @param symbol - Symbol to close
   * @param qty - Quantity to close (undefined = all)
   */
  closePosition(symbol: string, qty?: number): Promise<Order>;

  /**
   * Close all positions.
   */
  closeAllPositions(): Promise<Order[]>;

  /**
   * Check if the market is open.
   */
  isMarketOpen(): Promise<boolean>;

  /**
   * Get the trading environment.
   */
  getEnvironment(): TradingEnvironment;

  /**
   * Generate a unique client order ID with environment prefix.
   */
  generateOrderId(): string;
}

/**
 * Create an Alpaca broker client.
 *
 * @param config - Client configuration
 * @returns Alpaca client instance
 *
 * @example
 * ```typescript
 * const client = createAlpacaClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   environment: "PAPER",
 * });
 *
 * // Submit an order
 * const order = await client.submitOrder({
 *   clientOrderId: client.generateOrderId(),
 *   symbol: "AAPL",
 *   qty: 10,
 *   side: "buy",
 *   type: "limit",
 *   timeInForce: "day",
 *   limitPrice: 150.00,
 * });
 * ```
 */
export function createAlpacaClient(config: AlpacaClientConfig): AlpacaClient {
  const {
    apiKey,
    apiSecret,
    environment,
    orderIdPrefix = environment.toLowerCase(),
    requireLiveConfirmation = true,
  } = config;

  // Validate credentials
  if (!apiKey || !apiSecret) {
    throw new BrokerError("API key and secret are required", "INVALID_CREDENTIALS");
  }

  // Get base URL based on environment
  // BACKTEST uses paper endpoint but marks orders differently
  const baseUrl = environment === "LIVE" ? ENDPOINTS.LIVE : ENDPOINTS.PAPER;

  /**
   * Make an authenticated API request.
   */
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Alpaca API error: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorBody || errorMessage;
        }

        // Map HTTP status to error code
        const errorCode = mapHttpStatusToErrorCode(response.status, errorMessage);
        throw new BrokerError(errorMessage, errorCode);
      }

      // Handle empty responses (e.g., DELETE)
      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof BrokerError) {
        throw error;
      }

      throw new BrokerError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "NETWORK_ERROR",
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Confirm LIVE environment order if required.
   */
  function confirmLiveOrder(request: OrderRequest): void {
    if (environment === "LIVE" && requireLiveConfirmation) {
      // Check for explicit confirmation flag in client order ID
      if (!request.clientOrderId.includes("-LIVE-CONFIRMED-")) {
        throw new BrokerError(
          'LIVE orders require explicit confirmation. Include "-LIVE-CONFIRMED-" in clientOrderId or set requireLiveConfirmation: false',
          "LIVE_PROTECTION"
        );
      }
    }
  }

  return {
    async getAccount(): Promise<Account> {
      const data = await request<AlpacaAccountResponse>("GET", "/v2/account");
      return mapAccount(data);
    },

    async getPositions(): Promise<Position[]> {
      const data = await request<AlpacaPositionResponse[]>("GET", "/v2/positions");
      return data.map(mapPosition);
    },

    async getPosition(symbol: string): Promise<Position | null> {
      try {
        const data = await request<AlpacaPositionResponse>("GET", `/v2/positions/${symbol}`);
        return mapPosition(data);
      } catch (error) {
        if (error instanceof BrokerError && error.code === "ORDER_NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },

    async submitOrder(orderRequest: OrderRequest): Promise<Order> {
      // Validate LIVE protection
      confirmLiveOrder(orderRequest);

      // Validate multi-leg order ratios
      if (orderRequest.legs && orderRequest.legs.length > 0) {
        if (orderRequest.legs.length > 4) {
          throw new BrokerError("Multi-leg orders support a maximum of 4 legs", "VALIDATION_ERROR");
        }

        if (!validateLegRatios(orderRequest.legs)) {
          throw new BrokerError("Leg ratios must be simplified (GCD = 1)", "VALIDATION_ERROR");
        }
      }

      // Build Alpaca order payload
      const payload: AlpacaOrderRequest = {
        client_order_id: orderRequest.clientOrderId,
        qty: String(orderRequest.qty),
        side: orderRequest.side,
        type: orderRequest.type,
        time_in_force: orderRequest.timeInForce,
      };

      if (orderRequest.symbol !== undefined) {
        payload.symbol = orderRequest.symbol;
      }

      if (orderRequest.limitPrice !== undefined) {
        payload.limit_price = String(orderRequest.limitPrice);
      }
      if (orderRequest.stopPrice !== undefined) {
        payload.stop_price = String(orderRequest.stopPrice);
      }
      if (orderRequest.trailPercent !== undefined) {
        payload.trail_percent = String(orderRequest.trailPercent);
      }
      if (orderRequest.trailPrice !== undefined) {
        payload.trail_price = String(orderRequest.trailPrice);
      }
      if (orderRequest.extendedHours !== undefined) {
        payload.extended_hours = orderRequest.extendedHours;
      }

      // Handle multi-leg orders
      if (orderRequest.legs && orderRequest.legs.length > 0) {
        payload.legs = orderRequest.legs.map((leg) => ({
          symbol: leg.symbol,
          ratio: leg.ratio,
          side: leg.ratio > 0 ? "buy" : "sell",
        }));
      }

      const data = await request<AlpacaOrderResponse>("POST", "/v2/orders", payload);
      return mapOrder(data);
    },

    async cancelOrder(orderId: string): Promise<void> {
      await request<void>("DELETE", `/v2/orders/${orderId}`);
    },

    async getOrder(orderId: string): Promise<Order | null> {
      try {
        const data = await request<AlpacaOrderResponse>("GET", `/v2/orders/${orderId}`);
        return mapOrder(data);
      } catch (error) {
        if (error instanceof BrokerError && error.code === "ORDER_NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },

    async getOrders(status: "open" | "closed" | "all" = "open"): Promise<Order[]> {
      const data = await request<AlpacaOrderResponse[]>("GET", `/v2/orders?status=${status}`);
      return data.map(mapOrder);
    },

    async closePosition(symbol: string, qty?: number): Promise<Order> {
      const path =
        qty !== undefined ? `/v2/positions/${symbol}?qty=${qty}` : `/v2/positions/${symbol}`;
      const data = await request<AlpacaOrderResponse>("DELETE", path);
      return mapOrder(data);
    },

    async closeAllPositions(): Promise<Order[]> {
      const data = await request<AlpacaOrderResponse[]>("DELETE", "/v2/positions");
      return data.map(mapOrder);
    },

    async isMarketOpen(): Promise<boolean> {
      const data = await request<{ is_open: boolean }>("GET", "/v2/clock");
      return data.is_open;
    },

    getEnvironment(): TradingEnvironment {
      return environment;
    },

    generateOrderId(): string {
      return generateOrderId(orderIdPrefix);
    },
  };
}

// ============================================================================
// Alpaca API Response Types
// ============================================================================

interface AlpacaAccountResponse {
  id: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  shorting_enabled: boolean;
  long_market_value: string;
  short_market_value: string;
  equity: string;
  last_equity: string;
  multiplier: string;
  initial_margin: string;
  maintenance_margin: string;
  sma: string;
  created_at: string;
}

interface AlpacaPositionResponse {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

interface AlpacaOrderRequest {
  client_order_id: string;
  symbol?: string;
  qty: string;
  side: string;
  type: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  trail_percent?: string;
  trail_price?: string;
  extended_hours?: boolean;
  legs?: Array<{
    symbol: string;
    ratio: number;
    side: string;
  }>;
}

interface AlpacaOrderResponse {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  time_in_force: string;
  status: string;
  limit_price?: string;
  stop_price?: string;
  filled_avg_price?: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  legs?: Array<{
    symbol: string;
    ratio: number;
  }>;
}

// ============================================================================
// Mappers
// ============================================================================

function mapAccount(data: AlpacaAccountResponse): Account {
  return {
    id: data.id,
    status: data.status,
    currency: data.currency,
    cash: parseFloat(data.cash),
    portfolioValue: parseFloat(data.portfolio_value),
    buyingPower: parseFloat(data.buying_power),
    daytradeCount: data.daytrade_count,
    patternDayTrader: data.pattern_day_trader,
    tradingBlocked: data.trading_blocked,
    transfersBlocked: data.transfers_blocked,
    accountBlocked: data.account_blocked,
    shortingEnabled: data.shorting_enabled,
    longMarketValue: parseFloat(data.long_market_value),
    shortMarketValue: parseFloat(data.short_market_value),
    equity: parseFloat(data.equity),
    lastEquity: parseFloat(data.last_equity),
    multiplier: parseFloat(data.multiplier),
    initialMargin: parseFloat(data.initial_margin),
    maintenanceMargin: parseFloat(data.maintenance_margin),
    sma: parseFloat(data.sma),
    createdAt: data.created_at,
  };
}

function mapPosition(data: AlpacaPositionResponse): Position {
  return {
    symbol: data.symbol,
    qty: parseFloat(data.qty),
    side: data.side as "long" | "short",
    avgEntryPrice: parseFloat(data.avg_entry_price),
    marketValue: parseFloat(data.market_value),
    costBasis: parseFloat(data.cost_basis),
    unrealizedPl: parseFloat(data.unrealized_pl),
    unrealizedPlpc: parseFloat(data.unrealized_plpc),
    currentPrice: parseFloat(data.current_price),
    lastdayPrice: parseFloat(data.lastday_price),
    changeToday: parseFloat(data.change_today),
  };
}

function mapOrder(data: AlpacaOrderResponse): Order {
  const order: Order = {
    id: data.id,
    clientOrderId: data.client_order_id,
    symbol: data.symbol,
    qty: parseFloat(data.qty),
    filledQty: parseFloat(data.filled_qty),
    side: data.side as "buy" | "sell",
    type: data.type as Order["type"],
    timeInForce: data.time_in_force as Order["timeInForce"],
    status: data.status as Order["status"],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    submittedAt: data.submitted_at,
  };

  if (data.limit_price) {
    order.limitPrice = parseFloat(data.limit_price);
  }
  if (data.stop_price) {
    order.stopPrice = parseFloat(data.stop_price);
  }
  if (data.filled_avg_price) {
    order.filledAvgPrice = parseFloat(data.filled_avg_price);
  }
  if (data.filled_at) {
    order.filledAt = data.filled_at;
  }
  if (data.legs) {
    order.legs = data.legs.map((leg) => ({
      symbol: leg.symbol,
      ratio: leg.ratio,
    }));
  }

  return order;
}

function mapHttpStatusToErrorCode(status: number, message: string): BrokerError["code"] {
  switch (status) {
    case 401:
    case 403:
      return "INVALID_CREDENTIALS";
    case 404:
      return "ORDER_NOT_FOUND";
    case 422:
      if (message.includes("insufficient")) {
        return message.includes("shares") ? "INSUFFICIENT_SHARES" : "INSUFFICIENT_FUNDS";
      }
      return "INVALID_ORDER";
    case 429:
      return "RATE_LIMITED";
    default:
      return "UNKNOWN";
  }
}
