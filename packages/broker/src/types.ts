/**
 * Broker Types
 *
 * Type definitions for order and position management.
 */

/**
 * Trading environment.
 */
export type TradingEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Order side.
 */
export type OrderSide = "buy" | "sell";

/**
 * Order type.
 */
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";

/**
 * Order time in force.
 */
export type TimeInForce = "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";

/**
 * Order status.
 */
export type OrderStatus =
  | "new"
  | "partially_filled"
  | "filled"
  | "done_for_day"
  | "canceled"
  | "expired"
  | "replaced"
  | "pending_cancel"
  | "pending_replace"
  | "pending_new"
  | "accepted"
  | "stopped"
  | "rejected"
  | "suspended"
  | "calculated";

/**
 * Position side.
 */
export type PositionSide = "long" | "short";

/**
 * Options contract type.
 */
export type OptionType = "call" | "put";

/**
 * Order leg for multi-leg options.
 */
export interface OrderLeg {
  /** Symbol (e.g., "AAPL", or option symbol) */
  symbol: string;
  /** Ratio (signed: positive for buy, negative for sell) */
  ratio: number;
  /** Option type (for options legs) */
  optionType?: OptionType;
  /** Strike price (for options legs) */
  strike?: number;
  /** Expiration date (for options legs) */
  expiration?: string;
}

/**
 * Order request.
 */
export interface OrderRequest {
  /** Client order ID (must be unique) */
  clientOrderId: string;
  /** Symbol or legs for multi-leg */
  symbol?: string;
  /** Order legs for multi-leg orders */
  legs?: OrderLeg[];
  /** Quantity */
  qty: number;
  /** Order side */
  side: OrderSide;
  /** Order type */
  type: OrderType;
  /** Time in force */
  timeInForce: TimeInForce;
  /** Limit price (for limit orders) */
  limitPrice?: number;
  /** Stop price (for stop orders) */
  stopPrice?: number;
  /** Trail percent (for trailing stop) */
  trailPercent?: number;
  /** Trail price (for trailing stop) */
  trailPrice?: number;
  /** Extended hours trading */
  extendedHours?: boolean;
}

/**
 * Order response.
 */
export interface Order {
  /** Alpaca order ID */
  id: string;
  /** Client order ID */
  clientOrderId: string;
  /** Symbol */
  symbol: string;
  /** Quantity */
  qty: number;
  /** Filled quantity */
  filledQty: number;
  /** Side */
  side: OrderSide;
  /** Type */
  type: OrderType;
  /** Time in force */
  timeInForce: TimeInForce;
  /** Order status */
  status: OrderStatus;
  /** Limit price */
  limitPrice?: number;
  /** Stop price */
  stopPrice?: number;
  /** Average fill price */
  filledAvgPrice?: number;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** Submitted timestamp */
  submittedAt: string;
  /** Filled timestamp */
  filledAt?: string;
  /** Order legs (for multi-leg) */
  legs?: OrderLeg[];
}

/**
 * Position.
 */
export interface Position {
  /** Symbol */
  symbol: string;
  /** Quantity */
  qty: number;
  /** Side */
  side: PositionSide;
  /** Average entry price */
  avgEntryPrice: number;
  /** Market value */
  marketValue: number;
  /** Cost basis */
  costBasis: number;
  /** Unrealized P&L */
  unrealizedPl: number;
  /** Unrealized P&L percent */
  unrealizedPlpc: number;
  /** Current price */
  currentPrice: number;
  /** Last day price */
  lastdayPrice: number;
  /** Change today */
  changeToday: number;
}

/**
 * Account information.
 */
export interface Account {
  /** Account ID */
  id: string;
  /** Account status */
  status: string;
  /** Account currency */
  currency: string;
  /** Cash balance */
  cash: number;
  /** Portfolio value */
  portfolioValue: number;
  /** Buying power */
  buyingPower: number;
  /** Day trade count */
  daytradeCount: number;
  /** Pattern day trader status */
  patternDayTrader: boolean;
  /** Trading blocked status */
  tradingBlocked: boolean;
  /** Transfers blocked status */
  transfersBlocked: boolean;
  /** Account blocked status */
  accountBlocked: boolean;
  /** Shorting enabled */
  shortingEnabled: boolean;
  /** Long market value */
  longMarketValue: number;
  /** Short market value */
  shortMarketValue: number;
  /** Equity */
  equity: number;
  /** Last equity */
  lastEquity: number;
  /** Multiplier */
  multiplier: number;
  /** Initial margin */
  initialMargin: number;
  /** Maintenance margin */
  maintenanceMargin: number;
  /** SMA (Special Memorandum Account) */
  sma: number;
  /** Created timestamp */
  createdAt: string;
}

/**
 * Broker error with specific code.
 */
export class BrokerError extends Error {
  constructor(
    message: string,
    public readonly code: BrokerErrorCode,
    public readonly symbol?: string,
    public readonly orderId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

/**
 * Broker error codes.
 */
export type BrokerErrorCode =
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_SHARES"
  | "INVALID_ORDER"
  | "ORDER_NOT_FOUND"
  | "MARKET_CLOSED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "ENVIRONMENT_MISMATCH"
  | "LIVE_PROTECTION"
  | "UNKNOWN";
