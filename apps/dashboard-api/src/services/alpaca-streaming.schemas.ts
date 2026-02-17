import { z } from "zod";

/**
 * Order object within trade_updates messages.
 * Mirrors the REST API order object.
 */
export const AlpacaOrderSchema = z.object({
	id: z.string().describe("Unique order identifier"),
	client_order_id: z.string().describe("Client-provided order ID"),
	created_at: z.string().describe("Order creation timestamp"),
	updated_at: z.string().describe("Last update timestamp"),
	submitted_at: z.string().nullable().describe("When order was submitted to exchange"),
	filled_at: z.string().nullable().describe("When order was fully filled"),
	expired_at: z.string().nullable().describe("When order expired"),
	canceled_at: z.string().nullable().describe("When order was canceled"),
	failed_at: z.string().nullable().describe("When order failed"),
	replaced_at: z.string().nullable().optional().describe("When order was replaced"),
	replaced_by: z.string().nullable().optional().describe("ID of replacing order"),
	replaces: z.string().nullable().optional().describe("ID of order this replaces"),
	asset_id: z.string().optional().describe("Asset UUID"),
	symbol: z.string().describe("Ticker symbol"),
	asset_class: z.string().optional().describe("Asset class (us_equity, crypto, etc)"),
	notional: z.string().nullable().optional().describe("Notional value for fractional orders"),
	qty: z.string().nullable().describe("Order quantity"),
	filled_qty: z.string().describe("Quantity filled so far"),
	filled_avg_price: z.string().nullable().describe("Average fill price"),
	order_class: z.string().optional().describe("Order class (simple, bracket, oco, oto)"),
	order_type: z.string().describe("Order type (market, limit, stop, stop_limit, trailing_stop)"),
	type: z.string().describe("Alias for order_type"),
	side: z.enum(["buy", "sell"]).describe("Order side"),
	time_in_force: z.string().describe("Time in force (day, gtc, opg, cls, ioc, fok)"),
	limit_price: z.string().nullable().describe("Limit price for limit orders"),
	stop_price: z.string().nullable().describe("Stop price for stop orders"),
	status: z.string().describe("Order status"),
	extended_hours: z.boolean().optional().describe("Whether order executes in extended hours"),
	legs: z.array(z.unknown()).nullable().optional().describe("Legs for multi-leg orders"),
	trail_percent: z.string().nullable().optional().describe("Trailing stop percent"),
	trail_price: z.string().nullable().optional().describe("Trailing stop price"),
	hwm: z.string().nullable().optional().describe("High water mark for trailing stop"),
});
export type AlpacaOrder = z.infer<typeof AlpacaOrderSchema>;

/**
 * Trade update event types.
 */
export const TradeUpdateEventSchema = z.enum([
	"new", // Order has been received
	"fill", // Order has been completely filled
	"partial_fill", // Order has been partially filled
	"canceled", // Order has been canceled
	"expired", // Order has expired
	"done_for_day", // Order is done for the day
	"replaced", // Order has been replaced
	"rejected", // Order was rejected
	"pending_new", // Order is pending
	"stopped", // Order has been stopped
	"pending_cancel", // Order cancel is pending
	"pending_replace", // Order replace is pending
	"calculated", // Order has been calculated
	"suspended", // Order has been suspended
	"order_replace_rejected", // Order replace was rejected
	"order_cancel_rejected", // Order cancel was rejected
]);
export type TradeUpdateEvent = z.infer<typeof TradeUpdateEventSchema>;

/**
 * Trade update message from Alpaca trading stream.
 */
export const AlpacaTradeUpdateMessageSchema = z.object({
	stream: z.literal("trade_updates"),
	data: z.object({
		event: TradeUpdateEventSchema,
		order: AlpacaOrderSchema,
		timestamp: z.string().optional().describe("Event timestamp"),
		position_qty: z.string().optional().describe("Current position quantity after fill"),
		price: z.string().optional().describe("Fill price for fill events"),
		qty: z.string().optional().describe("Fill quantity for fill events"),
	}),
});
export type AlpacaTradeUpdateMessage = z.infer<typeof AlpacaTradeUpdateMessageSchema>;

/**
 * Listening acknowledgment message.
 */
export const AlpacaListeningMessageSchema = z.object({
	stream: z.literal("listening"),
	data: z.object({
		streams: z.array(z.string()),
	}),
});
export type AlpacaListeningMessage = z.infer<typeof AlpacaListeningMessageSchema>;

/**
 * Authorization success message.
 */
export const AlpacaAuthSuccessMessageSchema = z.object({
	stream: z.literal("authorization"),
	data: z.object({
		status: z.literal("authorized"),
		action: z.literal("authenticate"),
	}),
});
export type AlpacaAuthSuccessMessage = z.infer<typeof AlpacaAuthSuccessMessageSchema>;

/**
 * Authorization failure message.
 */
export const AlpacaAuthFailureMessageSchema = z.object({
	stream: z.literal("authorization"),
	data: z.object({
		status: z.literal("unauthorized"),
		action: z.literal("authenticate"),
	}),
});
export type AlpacaAuthFailureMessage = z.infer<typeof AlpacaAuthFailureMessageSchema>;

/**
 * All possible stream messages.
 */
export type AlpacaStreamMessage =
	| AlpacaTradeUpdateMessage
	| AlpacaListeningMessage
	| AlpacaAuthSuccessMessage
	| AlpacaAuthFailureMessage;
