/**
 * Alpaca API Types
 *
 * Wire format types for Alpaca Markets API responses and requests.
 * These are internal types that map to/from our domain types.
 */

export interface AlpacaAccountResponse {
  id: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
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

export interface AlpacaPositionResponse {
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

export interface AlpacaOrderLeg {
  symbol: string;
  ratio: number;
  side: string;
}

export interface AlpacaOrderRequest {
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
  legs?: AlpacaOrderLeg[];
}

export interface AlpacaOrderResponseLeg {
  symbol: string;
  ratio: number;
}

export interface AlpacaOrderResponse {
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
  legs?: AlpacaOrderResponseLeg[];
}

export interface AlpacaClockResponse {
  /** Whether the market is currently open */
  is_open: boolean;
  /** Current timestamp (ISO 8601) */
  timestamp: string;
  /** Next market open time (ISO 8601) */
  next_open: string;
  /** Next market close time (ISO 8601) */
  next_close: string;
}
