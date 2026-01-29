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
		cash: Number.parseFloat(data.cash),
		portfolioValue: Number.parseFloat(data.portfolio_value),
		buyingPower: Number.parseFloat(data.buying_power),
		regtBuyingPower: Number.parseFloat(data.regt_buying_power),
		daytradingBuyingPower: Number.parseFloat(data.daytrading_buying_power),
		daytradeCount: data.daytrade_count,
		patternDayTrader: data.pattern_day_trader,
		tradingBlocked: data.trading_blocked,
		transfersBlocked: data.transfers_blocked,
		accountBlocked: data.account_blocked,
		shortingEnabled: data.shorting_enabled,
		longMarketValue: Number.parseFloat(data.long_market_value),
		shortMarketValue: Number.parseFloat(data.short_market_value),
		equity: Number.parseFloat(data.equity),
		lastEquity: Number.parseFloat(data.last_equity),
		multiplier: Number.parseFloat(data.multiplier),
		initialMargin: Number.parseFloat(data.initial_margin),
		maintenanceMargin: Number.parseFloat(data.maintenance_margin),
		sma: Number.parseFloat(data.sma),
		createdAt: data.created_at,
		cashWithdrawable: Number.parseFloat(data.cash_withdrawable),
		cashTransferable: Number.parseFloat(data.cash_transferable),
		pendingTransferIn: Number.parseFloat(data.pending_transfer_in),
		pendingTransferOut: Number.parseFloat(data.pending_transfer_out),
		nonMarginableBuyingPower: Number.parseFloat(data.non_marginable_buying_power),
		accruedFees: Number.parseFloat(data.accrued_fees),
	};
}

export function mapPosition(data: AlpacaPositionResponse): Position {
	return {
		symbol: data.symbol,
		qty: Number.parseFloat(data.qty),
		side: data.side as "long" | "short",
		avgEntryPrice: Number.parseFloat(data.avg_entry_price),
		marketValue: Number.parseFloat(data.market_value),
		costBasis: Number.parseFloat(data.cost_basis),
		unrealizedPl: Number.parseFloat(data.unrealized_pl),
		unrealizedPlpc: Number.parseFloat(data.unrealized_plpc),
		currentPrice: Number.parseFloat(data.current_price),
		lastdayPrice: Number.parseFloat(data.lastday_price),
		changeToday: Number.parseFloat(data.change_today),
	};
}

export function mapOrder(data: AlpacaOrderResponse): Order {
	const order: Order = {
		id: data.id,
		clientOrderId: data.client_order_id,
		symbol: data.symbol,
		qty: Number.parseFloat(data.qty),
		filledQty: Number.parseFloat(data.filled_qty),
		side: data.side as "buy" | "sell",
		type: data.type as Order["type"],
		timeInForce: data.time_in_force as Order["timeInForce"],
		status: data.status as Order["status"],
		createdAt: data.created_at,
		updatedAt: data.updated_at,
		submittedAt: data.submitted_at,
	};

	if (data.limit_price) {
		order.limitPrice = Number.parseFloat(data.limit_price);
	}
	if (data.stop_price) {
		order.stopPrice = Number.parseFloat(data.stop_price);
	}
	if (data.filled_avg_price) {
		order.filledAvgPrice = Number.parseFloat(data.filled_avg_price);
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
