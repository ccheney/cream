/**
 * Backtest Broker Adapter
 *
 * Simulated broker for backtesting with configurable fill behavior.
 * Maintains in-memory state for positions and orders.
 *
 * @see docs/plans/14-testing.md
 */

import type { Account, Order, OrderRequest, Position, OrderStatus } from "../types.js";
import { BrokerError } from "../types.js";
import { generateOrderId } from "../utils.js";
import type { AlpacaClient } from "../client.js";

/**
 * Backtest adapter configuration.
 */
export interface BacktestAdapterConfig {
  /** Initial cash balance */
  initialCash?: number;
  /** Fill mode: immediate fills all orders instantly, delayed simulates market hours */
  fillMode?: "immediate" | "delayed";
  /** Slippage in basis points (e.g., 5 = 0.05%) */
  slippageBps?: number;
  /** Commission per trade */
  commission?: number;
  /** Order ID prefix */
  orderIdPrefix?: string;
  /** Price provider function (symbol -> price) */
  priceProvider?: (symbol: string) => number | undefined;
}

/**
 * Internal order state with additional tracking.
 */
interface InternalOrder extends Order {
  /** Original request for reference */
  request: OrderRequest;
}

/**
 * Create a backtest broker adapter.
 *
 * @param config - Adapter configuration
 * @returns AlpacaClient-compatible adapter
 *
 * @example
 * ```typescript
 * const backtest = createBacktestAdapter({
 *   initialCash: 100000,
 *   fillMode: "immediate",
 *   slippageBps: 5,
 * });
 *
 * // Submit order (fills immediately in backtest)
 * const order = await backtest.submitOrder({
 *   clientOrderId: backtest.generateOrderId(),
 *   symbol: "AAPL",
 *   qty: 10,
 *   side: "buy",
 *   type: "market",
 *   timeInForce: "day",
 * });
 * ```
 */
export function createBacktestAdapter(config: BacktestAdapterConfig = {}): AlpacaClient {
  const {
    initialCash = 100000,
    fillMode = "immediate",
    slippageBps = 0,
    commission = 0,
    orderIdPrefix = "backtest",
    priceProvider,
  } = config;

  // In-memory state
  let cash = initialCash;
  const positions = new Map<string, Position>();
  const orders = new Map<string, InternalOrder>();
  let orderCounter = 0;

  /**
   * Get price for a symbol.
   */
  function getPrice(symbol: string): number {
    if (priceProvider) {
      const price = priceProvider(symbol);
      if (price !== undefined) {
        return price;
      }
    }
    // Default price for testing (should be overridden by priceProvider)
    return 100;
  }

  /**
   * Apply slippage to a price.
   */
  function applySlippage(price: number, side: "buy" | "sell"): number {
    const slippageMultiplier = 1 + (slippageBps / 10000) * (side === "buy" ? 1 : -1);
    return price * slippageMultiplier;
  }

  /**
   * Execute a fill for an order.
   */
  function executeFill(order: InternalOrder): void {
    const price = applySlippage(getPrice(order.symbol), order.side);
    const fillValue = price * order.qty;

    if (order.side === "buy") {
      // Check sufficient funds
      if (cash < fillValue + commission) {
        order.status = "rejected";
        return;
      }

      cash -= fillValue + commission;

      // Update or create position
      const existing = positions.get(order.symbol);
      if (existing) {
        const totalQty = existing.qty + order.qty;
        const totalCost = existing.costBasis + fillValue;
        existing.qty = totalQty;
        existing.avgEntryPrice = totalCost / totalQty;
        existing.costBasis = totalCost;
        existing.currentPrice = price;
        existing.marketValue = totalQty * price;
        existing.unrealizedPl = existing.marketValue - existing.costBasis;
        existing.unrealizedPlpc = existing.unrealizedPl / existing.costBasis;
      } else {
        positions.set(order.symbol, {
          symbol: order.symbol,
          qty: order.qty,
          side: "long",
          avgEntryPrice: price,
          marketValue: fillValue,
          costBasis: fillValue,
          unrealizedPl: 0,
          unrealizedPlpc: 0,
          currentPrice: price,
          lastdayPrice: price,
          changeToday: 0,
        });
      }
    } else {
      // Sell
      const existing = positions.get(order.symbol);
      if (!existing || existing.qty < order.qty) {
        order.status = "rejected";
        return;
      }

      cash += fillValue - commission;

      const newQty = existing.qty - order.qty;
      if (newQty === 0) {
        positions.delete(order.symbol);
      } else {
        existing.qty = newQty;
        existing.marketValue = newQty * price;
        existing.unrealizedPl = existing.marketValue - (existing.avgEntryPrice * newQty);
        existing.unrealizedPlpc = existing.unrealizedPl / (existing.avgEntryPrice * newQty);
      }
    }

    // Update order
    order.status = "filled";
    order.filledQty = order.qty;
    order.filledAvgPrice = price;
    order.filledAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
  }

  /**
   * Calculate total portfolio value.
   */
  function getPortfolioValue(): number {
    let positionValue = 0;
    for (const position of positions.values()) {
      positionValue += position.marketValue;
    }
    return cash + positionValue;
  }

  return {
    async getAccount(): Promise<Account> {
      const portfolioValue = getPortfolioValue();
      let longMarketValue = 0;
      let shortMarketValue = 0;

      for (const position of positions.values()) {
        if (position.side === "long") {
          longMarketValue += position.marketValue;
        } else {
          shortMarketValue += position.marketValue;
        }
      }

      return {
        id: "backtest-account",
        status: "ACTIVE",
        currency: "USD",
        cash,
        portfolioValue,
        buyingPower: cash * 4, // 4x margin
        daytradeCount: 0,
        patternDayTrader: false,
        tradingBlocked: false,
        transfersBlocked: false,
        accountBlocked: false,
        shortingEnabled: true,
        longMarketValue,
        shortMarketValue,
        equity: portfolioValue,
        lastEquity: portfolioValue,
        multiplier: 4,
        initialMargin: longMarketValue * 0.25,
        maintenanceMargin: longMarketValue * 0.25,
        sma: 0,
        createdAt: new Date().toISOString(),
      };
    },

    async getPositions(): Promise<Position[]> {
      return Array.from(positions.values());
    },

    async getPosition(symbol: string): Promise<Position | null> {
      return positions.get(symbol) ?? null;
    },

    async submitOrder(request: OrderRequest): Promise<Order> {
      orderCounter++;
      const now = new Date().toISOString();

      const order: InternalOrder = {
        id: `backtest-${orderCounter}`,
        clientOrderId: request.clientOrderId,
        symbol: request.symbol ?? request.legs?.[0]?.symbol ?? "UNKNOWN",
        qty: request.qty,
        filledQty: 0,
        side: request.side,
        type: request.type,
        timeInForce: request.timeInForce,
        status: "new" as OrderStatus,
        limitPrice: request.limitPrice,
        stopPrice: request.stopPrice,
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
        request,
      };

      orders.set(order.id, order);

      // Handle fill based on mode
      if (fillMode === "immediate") {
        // Market and limit orders fill immediately
        if (request.type === "market" || request.type === "limit") {
          executeFill(order);
        } else if (request.type === "stop" || request.type === "stop_limit") {
          // Stop orders stay pending until triggered
          order.status = "accepted";
        }
      } else {
        // Delayed mode - orders accepted but not filled
        order.status = "accepted";
      }

      // Return order without internal request field
      const { request: _req, ...orderResult } = order;
      return orderResult;
    },

    async cancelOrder(orderId: string): Promise<void> {
      const order = orders.get(orderId);
      if (!order) {
        // Try by client order ID
        for (const o of orders.values()) {
          if (o.clientOrderId === orderId) {
            o.status = "canceled";
            o.updatedAt = new Date().toISOString();
            return;
          }
        }
        throw new BrokerError("Order not found", "ORDER_NOT_FOUND", undefined, orderId);
      }

      if (order.status === "filled" || order.status === "canceled") {
        throw new BrokerError("Cannot cancel completed order", "INVALID_ORDER", undefined, orderId);
      }

      order.status = "canceled";
      order.updatedAt = new Date().toISOString();
    },

    async getOrder(orderId: string): Promise<Order | null> {
      const order = orders.get(orderId);
      if (order) {
        const { request: _req, ...orderResult } = order;
        return orderResult;
      }

      // Try by client order ID
      for (const o of orders.values()) {
        if (o.clientOrderId === orderId) {
          const { request: _req, ...orderResult } = o;
          return orderResult;
        }
      }

      return null;
    },

    async getOrders(status: "open" | "closed" | "all" = "open"): Promise<Order[]> {
      const results: Order[] = [];
      const openStatuses: OrderStatus[] = ["new", "accepted", "pending_new", "partially_filled"];
      const closedStatuses: OrderStatus[] = ["filled", "canceled", "expired", "rejected"];

      for (const order of orders.values()) {
        let include = false;

        if (status === "all") {
          include = true;
        } else if (status === "open") {
          include = openStatuses.includes(order.status);
        } else if (status === "closed") {
          include = closedStatuses.includes(order.status);
        }

        if (include) {
          const { request: _req, ...orderResult } = order;
          results.push(orderResult);
        }
      }

      return results;
    },

    async closePosition(symbol: string, qty?: number): Promise<Order> {
      const position = positions.get(symbol);
      if (!position) {
        throw new BrokerError("Position not found", "ORDER_NOT_FOUND", symbol);
      }

      const closeQty = qty ?? position.qty;
      if (closeQty > position.qty) {
        throw new BrokerError("Cannot close more than held", "INSUFFICIENT_SHARES", symbol);
      }

      return this.submitOrder({
        clientOrderId: generateOrderId(orderIdPrefix),
        symbol,
        qty: closeQty,
        side: "sell",
        type: "market",
        timeInForce: "day",
      });
    },

    async closeAllPositions(): Promise<Order[]> {
      const closeOrders: Order[] = [];
      for (const position of positions.values()) {
        const order = await this.closePosition(position.symbol);
        closeOrders.push(order);
      }
      return closeOrders;
    },

    async isMarketOpen(): Promise<boolean> {
      // Always open in backtest
      return true;
    },

    getEnvironment() {
      return "BACKTEST" as const;
    },

    generateOrderId(): string {
      return generateOrderId(orderIdPrefix);
    },
  };
}

/**
 * Backtest-specific utilities.
 */
export interface BacktestUtils {
  /**
   * Set the cash balance directly.
   */
  setCash(amount: number): void;

  /**
   * Trigger fills for pending orders (for delayed mode).
   */
  triggerFills(): void;

  /**
   * Update prices and recalculate positions.
   */
  updatePrices(prices: Record<string, number>): void;

  /**
   * Reset all state to initial values.
   */
  reset(): void;

  /**
   * Get current cash balance.
   */
  getCash(): number;
}

/**
 * Create a backtest adapter with extended utilities.
 */
export function createBacktestAdapterWithUtils(
  config: BacktestAdapterConfig = {}
): AlpacaClient & BacktestUtils {
  const { initialCash = 100000, priceProvider: _initialPriceProvider, ...restConfig } = config;

  let currentCash = initialCash;
  const priceOverrides = new Map<string, number>();
  const pendingOrders: InternalOrder[] = [];

  const priceProvider = (symbol: string): number | undefined => {
    return priceOverrides.get(symbol) ?? config.priceProvider?.(symbol);
  };

  // Create base adapter with our price provider
  const baseAdapter = createBacktestAdapter({
    ...restConfig,
    initialCash,
    priceProvider,
  });

  return {
    ...baseAdapter,

    setCash(amount: number): void {
      currentCash = amount;
    },

    triggerFills(): void {
      // In a more complete implementation, this would iterate pending orders
      // and fill them based on current prices and order types
    },

    updatePrices(prices: Record<string, number>): void {
      for (const [symbol, price] of Object.entries(prices)) {
        priceOverrides.set(symbol, price);
      }
    },

    reset(): void {
      currentCash = initialCash;
      priceOverrides.clear();
      pendingOrders.length = 0;
    },

    getCash(): number {
      return currentCash;
    },
  };
}
