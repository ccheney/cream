/**
 * Alpaca API Mappers
 *
 * Functions to convert between Alpaca wire format and domain types.
 */

import type { Account, BrokerError, Order, Position } from "../types.js";
import type {
  AlpacaAccountResponse,
  AlpacaOrderResponse,
  AlpacaPositionResponse,
} from "./alpaca-types.js";

export function mapAccount(data: AlpacaAccountResponse): Account {
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

export function mapPosition(data: AlpacaPositionResponse): Position {
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

export function mapOrder(data: AlpacaOrderResponse): Order {
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

export function mapHttpStatusToErrorCode(status: number, message: string): BrokerError["code"] {
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
