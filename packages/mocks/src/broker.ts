/**
 * Mock Broker Adapter
 *
 * Simulates broker behavior for testing without real API calls.
 * Supports order lifecycle, configurable delays, and failure injection.
 *
 * @see docs/plans/14-testing.md for mocking strategy
 */

// ============================================
// Types
// ============================================

/**
 * Order status in lifecycle
 */
export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

/**
 * Order side
 */
export type OrderSide = "BUY" | "SELL";

/**
 * Order type
 */
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";

/**
 * Time in force
 */
export type TimeInForce = "DAY" | "GTC" | "IOC" | "FOK";

/**
 * Order submission request
 */
export interface SubmitOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  clientOrderId?: string;
}

/**
 * Order record in mock state
 */
export interface MockOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  filledQuantity: number;
  limitPrice?: number;
  stopPrice?: number;
  avgFillPrice?: number;
  timeInForce: TimeInForce;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  filledAt?: Date;
}

/**
 * Position in mock account
 */
export interface MockPosition {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

/**
 * Mock account state
 */
export interface MockAccount {
  accountId: string;
  cash: number;
  equity: number;
  buyingPower: number;
  portfolioValue: number;
  patternDayTrader: boolean;
  dayTradeCount: number;
}

/**
 * Failure type for injection
 */
export type FailureType =
  | "REJECT"
  | "TIMEOUT"
  | "PARTIAL_FILL"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_SYMBOL";

/**
 * Mock broker configuration
 */
export interface MockBrokerConfig {
  /** Delay before order is accepted (ms) */
  acceptDelay?: number;
  /** Delay before order is filled (ms) */
  fillDelay?: number;
  /** Simulate failures */
  simulateFailure?: boolean;
  /** Type of failure to simulate */
  failureType?: FailureType;
  /** Failure rate (0-1, probability of failure) */
  failureRate?: number;
  /** Slippage percentage for market orders */
  slippagePct?: number;
  /** Use deterministic behavior (no random) */
  deterministic?: boolean;
  /** Market prices for symbols (for market order fills) */
  marketPrices?: Map<string, number>;
}

// ============================================
// Mock Broker Adapter
// ============================================

/**
 * Mock Broker Adapter
 *
 * Simulates broker behavior for testing:
 * - Order lifecycle: PENDING → ACCEPTED → FILLED
 * - Configurable delays for accept and fill
 * - Failure injection (reject, timeout, partial fill)
 * - In-memory order and position tracking
 */
export class MockBrokerAdapter {
  private orders: Map<string, MockOrder> = new Map();
  private positions: Map<string, MockPosition> = new Map();
  private account: MockAccount;
  private config: Required<MockBrokerConfig>;
  private orderCounter = 0;

  constructor(config: MockBrokerConfig = {}) {
    this.config = {
      acceptDelay: config.acceptDelay ?? 10,
      fillDelay: config.fillDelay ?? 50,
      simulateFailure: config.simulateFailure ?? false,
      failureType: config.failureType ?? "REJECT",
      failureRate: config.failureRate ?? 0.1,
      slippagePct: config.slippagePct ?? 0.01,
      deterministic: config.deterministic ?? true,
      marketPrices: config.marketPrices ?? new Map(),
    };

    // Initialize mock account
    this.account = {
      accountId: "mock-account-001",
      cash: 100000,
      equity: 100000,
      buyingPower: 200000,
      portfolioValue: 100000,
      patternDayTrader: false,
      dayTradeCount: 0,
    };
  }

  // ============================================
  // Account Methods
  // ============================================

  /**
   * Get account information
   */
  async getAccount(): Promise<MockAccount> {
    return { ...this.account };
  }

  /**
   * Set account cash (for testing)
   */
  setAccountCash(cash: number): void {
    this.account.cash = cash;
    this.account.equity = cash + this.getPositionsValue();
    this.account.portfolioValue = this.account.equity;
  }

  private getPositionsValue(): number {
    let value = 0;
    for (const position of this.positions.values()) {
      value += position.marketValue;
    }
    return value;
  }

  // ============================================
  // Order Methods
  // ============================================

  /**
   * Submit an order
   */
  async submitOrder(request: SubmitOrderRequest): Promise<MockOrder> {
    // Check for simulated failure
    if (this.shouldFail()) {
      return this.handleFailure(request);
    }

    // Generate order ID
    const orderId = `mock-order-${++this.orderCounter}`;
    const clientOrderId = request.clientOrderId ?? `client-${orderId}`;

    // Create order
    const order: MockOrder = {
      orderId,
      clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      filledQuantity: 0,
      limitPrice: request.limitPrice,
      stopPrice: request.stopPrice,
      timeInForce: request.timeInForce,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(orderId, order);

    // Simulate async order processing
    this.processOrder(orderId);

    return { ...order };
  }

  /**
   * Process order lifecycle asynchronously
   */
  private async processOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    // Wait for accept delay
    await this.delay(this.config.acceptDelay);

    // Update to ACCEPTED
    order.status = "ACCEPTED";
    order.updatedAt = new Date();

    // Wait for fill delay
    await this.delay(this.config.fillDelay);

    // Simulate fill
    this.fillOrder(order);
  }

  /**
   * Fill an order
   */
  private fillOrder(order: MockOrder): void {
    // Check for partial fill simulation
    if (
      this.config.simulateFailure &&
      this.config.failureType === "PARTIAL_FILL"
    ) {
      const fillQuantity = Math.floor(order.quantity / 2);
      order.filledQuantity = fillQuantity;
      order.status = "PARTIALLY_FILLED";
    } else {
      order.filledQuantity = order.quantity;
      order.status = "FILLED";
    }

    // Calculate fill price
    order.avgFillPrice = this.calculateFillPrice(order);
    order.filledAt = new Date();
    order.updatedAt = new Date();

    // Update position
    this.updatePosition(order);
  }

  /**
   * Calculate fill price based on order type
   */
  private calculateFillPrice(order: MockOrder): number {
    let basePrice: number;

    if (order.type === "LIMIT" && order.limitPrice) {
      basePrice = order.limitPrice;
    } else {
      // Market order - use market price if available
      basePrice = this.config.marketPrices.get(order.symbol) ?? 100;
    }

    // Apply slippage for market orders
    if (order.type === "MARKET" && this.config.slippagePct > 0) {
      const slippage = basePrice * this.config.slippagePct;
      if (order.side === "BUY") {
        basePrice += slippage;
      } else {
        basePrice -= slippage;
      }
    }

    return Math.round(basePrice * 100) / 100;
  }

  /**
   * Update position after fill
   */
  private updatePosition(order: MockOrder): void {
    const existing = this.positions.get(order.symbol);
    const fillValue = order.filledQuantity * (order.avgFillPrice ?? 0);

    if (order.side === "BUY") {
      if (existing) {
        // Add to existing position
        const totalQuantity = existing.quantity + order.filledQuantity;
        const totalCost =
          existing.quantity * existing.averageEntryPrice + fillValue;
        existing.quantity = totalQuantity;
        existing.averageEntryPrice = totalCost / totalQuantity;
        existing.marketValue = totalQuantity * (order.avgFillPrice ?? 0);
      } else {
        // New position
        this.positions.set(order.symbol, {
          symbol: order.symbol,
          quantity: order.filledQuantity,
          averageEntryPrice: order.avgFillPrice ?? 0,
          marketValue: fillValue,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
        });
      }
      // Deduct from cash
      this.account.cash -= fillValue;
    } else {
      // SELL
      if (existing) {
        existing.quantity -= order.filledQuantity;
        existing.marketValue =
          existing.quantity * (order.avgFillPrice ?? existing.averageEntryPrice);
        if (existing.quantity <= 0) {
          this.positions.delete(order.symbol);
        }
      }
      // Add to cash
      this.account.cash += fillValue;
    }

    // Update account equity
    this.account.equity = this.account.cash + this.getPositionsValue();
    this.account.portfolioValue = this.account.equity;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<MockOrder | undefined> {
    const order = this.orders.get(orderId);
    return order ? { ...order } : undefined;
  }

  /**
   * Get all orders
   */
  async getOrders(): Promise<MockOrder[]> {
    return Array.from(this.orders.values()).map((o) => ({ ...o }));
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<MockOrder | undefined> {
    const order = this.orders.get(orderId);
    if (!order) return undefined;

    if (order.status === "PENDING" || order.status === "ACCEPTED") {
      order.status = "CANCELLED";
      order.updatedAt = new Date();
      return { ...order };
    }

    return undefined; // Can't cancel filled/cancelled orders
  }

  // ============================================
  // Position Methods
  // ============================================

  /**
   * Get all positions
   */
  async getPositions(): Promise<MockPosition[]> {
    return Array.from(this.positions.values()).map((p) => ({ ...p }));
  }

  /**
   * Get position for a symbol
   */
  async getPosition(symbol: string): Promise<MockPosition | undefined> {
    const position = this.positions.get(symbol);
    return position ? { ...position } : undefined;
  }

  /**
   * Set a position (for testing)
   */
  setPosition(position: MockPosition): void {
    this.positions.set(position.symbol, { ...position });
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Check if we should simulate a failure
   */
  private shouldFail(): boolean {
    if (!this.config.simulateFailure) return false;
    if (this.config.deterministic) return true;
    return Math.random() < this.config.failureRate;
  }

  /**
   * Handle simulated failure
   */
  private handleFailure(request: SubmitOrderRequest): MockOrder {
    const orderId = `mock-order-${++this.orderCounter}`;

    const order: MockOrder = {
      orderId,
      clientOrderId: request.clientOrderId ?? `client-${orderId}`,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      filledQuantity: 0,
      limitPrice: request.limitPrice,
      stopPrice: request.stopPrice,
      timeInForce: request.timeInForce,
      status: "REJECTED",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(orderId, order);
    return { ...order };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set market price for a symbol (for testing)
   */
  setMarketPrice(symbol: string, price: number): void {
    this.config.marketPrices.set(symbol, price);
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.orders.clear();
    this.positions.clear();
    this.orderCounter = 0;
    this.account = {
      accountId: "mock-account-001",
      cash: 100000,
      equity: 100000,
      buyingPower: 200000,
      portfolioValue: 100000,
      patternDayTrader: false,
      dayTradeCount: 0,
    };
  }

  /**
   * Wait for all pending orders to complete
   */
  async waitForOrders(): Promise<void> {
    const totalDelay = this.config.acceptDelay + this.config.fillDelay + 10;
    await this.delay(totalDelay);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a mock broker adapter
 */
export function createMockBroker(config?: MockBrokerConfig): MockBrokerAdapter {
  return new MockBrokerAdapter(config);
}
