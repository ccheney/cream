export type TradingEnvironment = "BACKTEST" | "PAPER" | "LIVE";

export type OrderSide = "buy" | "sell";

export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";

export type TimeInForce = "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";

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

export type PositionSide = "long" | "short";

export type OptionType = "call" | "put";

export interface OrderLeg {
  symbol: string;
  /** Signed: positive for buy, negative for sell */
  ratio: number;
  optionType?: OptionType;
  strike?: number;
  expiration?: string;
}

export interface OrderRequest {
  /** Must be unique per order */
  clientOrderId: string;
  symbol?: string;
  legs?: OrderLeg[];
  qty: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  extendedHours?: boolean;
}

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  qty: number;
  filledQty: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  status: OrderStatus;
  limitPrice?: number;
  stopPrice?: number;
  filledAvgPrice?: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  filledAt?: string;
  legs?: OrderLeg[];
}

export interface Position {
  symbol: string;
  qty: number;
  side: PositionSide;
  avgEntryPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  currentPrice: number;
  lastdayPrice: number;
  changeToday: number;
}

export interface Account {
  id: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  daytradeCount: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  accountBlocked: boolean;
  shortingEnabled: boolean;
  longMarketValue: number;
  shortMarketValue: number;
  equity: number;
  lastEquity: number;
  multiplier: number;
  initialMargin: number;
  maintenanceMargin: number;
  /** Special Memorandum Account */
  sma: number;
  createdAt: string;
}

export class BrokerError extends Error {
  constructor(
    message: string,
    public readonly code: BrokerErrorCode,
    public readonly symbol?: string,
    public readonly orderId?: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

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
