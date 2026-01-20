/**
 * Trading Updates Streaming
 *
 * Connects to Alpaca's trade_updates WebSocket to receive real-time
 * order fills and position changes, then broadcasts to dashboard clients.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { createAlpacaClient } from "@cream/broker";
import { requireEnv } from "@cream/domain";
import log from "../logger.js";
import {
	AlpacaTradingStreamService,
	type TradingStreamEvent,
} from "../services/alpaca-streaming.js";
import { broadcastOrderUpdate, broadcastPositionUpdate } from "../websocket/channels.js";

let tradingStream: AlpacaTradingStreamService | null = null;

/**
 * Check if Alpaca credentials are configured.
 */
function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}

type OrderEventType =
	| "new"
	| "fill"
	| "partial_fill"
	| "canceled"
	| "expired"
	| "done_for_day"
	| "replaced"
	| "rejected"
	| "pending_new"
	| "stopped"
	| "pending_cancel"
	| "pending_replace"
	| "calculated"
	| "suspended"
	| "order_replace_rejected"
	| "order_cancel_rejected";

const ORDER_EVENT_MAP: Record<string, OrderEventType> = {
	new: "new",
	fill: "fill",
	partial_fill: "partial_fill",
	canceled: "canceled",
	expired: "expired",
	done_for_day: "done_for_day",
	replaced: "replaced",
	rejected: "rejected",
	pending_new: "pending_new",
	stopped: "stopped",
	pending_cancel: "pending_cancel",
	pending_replace: "pending_replace",
	calculated: "calculated",
	suspended: "suspended",
	order_replace_rejected: "order_replace_rejected",
	order_cancel_rejected: "order_cancel_rejected",
};

/**
 * Map Alpaca event type to our schema event type.
 */
function mapEventType(alpacaEvent: string): OrderEventType {
	return ORDER_EVENT_MAP[alpacaEvent] ?? "new";
}

/**
 * Handle trade update events from Alpaca.
 * Broadcasts position and order updates to WebSocket clients.
 */
async function handleTradeUpdate(event: TradingStreamEvent): Promise<void> {
	if (event.type !== "trade_update") {
		return;
	}

	const { data } = event;
	const { event: eventType, order } = data;

	log.debug(
		{ event: eventType, symbol: order.symbol, orderId: order.id },
		"Received trade update from Alpaca"
	);

	// Broadcast order update using proper schema
	broadcastOrderUpdate({
		type: "order_update",
		data: {
			orderId: order.id,
			clientOrderId: order.client_order_id,
			symbol: order.symbol,
			side: order.side,
			orderType: order.order_type,
			status: order.status,
			qty: order.qty,
			filledQty: order.filled_qty,
			filledAvgPrice: order.filled_avg_price,
			event: mapEventType(eventType),
			timestamp: order.updated_at,
		},
		invalidates: ["portfolio.positions", "portfolio.orders"],
	});

	// On fill events, fetch updated position from Alpaca and broadcast
	if (eventType === "fill" || eventType === "partial_fill") {
		try {
			const environment = requireEnv();
			const client = createAlpacaClient({
				apiKey: Bun.env.ALPACA_KEY as string,
				apiSecret: Bun.env.ALPACA_SECRET as string,
				environment,
			});

			// Fetch the updated position
			const position = await client.getPosition(order.symbol);

			if (position) {
				broadcastPositionUpdate({
					type: "position_update",
					data: {
						symbol: position.symbol,
						side: position.side === "long" ? "LONG" : "SHORT",
						qty: position.qty,
						avgEntry: position.avgEntryPrice,
						marketValue: position.marketValue,
						unrealizedPnl: position.unrealizedPl,
						event: eventType === "fill" ? "fill" : "partial_fill",
						orderId: order.id,
						timestamp: new Date().toISOString(),
					},
					invalidates: ["portfolio.positions", "portfolio.summary"],
				});

				log.info(
					{
						symbol: order.symbol,
						event: eventType,
						qty: position.qty,
						avgEntry: position.avgEntryPrice,
					},
					"Broadcasted position update"
				);
			} else if (eventType === "fill") {
				// Position closed - broadcast as close event
				broadcastPositionUpdate({
					type: "position_update",
					data: {
						symbol: order.symbol,
						side: "LONG", // Side doesn't matter for close
						qty: 0,
						avgEntry: 0,
						marketValue: 0,
						unrealizedPnl: 0,
						event: "close",
						orderId: order.id,
						timestamp: new Date().toISOString(),
					},
					invalidates: ["portfolio.positions", "portfolio.summary"],
				});

				log.info({ symbol: order.symbol }, "Position closed, broadcasted removal");
			}
		} catch (error) {
			log.warn(
				{
					symbol: order.symbol,
					error: error instanceof Error ? error.message : String(error),
				},
				"Failed to fetch position after fill"
			);
		}
	}
}

/**
 * Initialize trading updates streaming.
 * Connects to Alpaca's trade_updates WebSocket.
 */
export async function initTradingUpdatesStreaming(): Promise<void> {
	if (!isAlpacaConfigured()) {
		log.info("Alpaca not configured, skipping trading updates streaming");
		return;
	}

	if (tradingStream) {
		log.warn("Trading updates streaming already initialized");
		return;
	}

	try {
		const isPaper = Bun.env.CREAM_ENV !== "LIVE";

		tradingStream = new AlpacaTradingStreamService({
			apiKey: Bun.env.ALPACA_KEY as string,
			apiSecret: Bun.env.ALPACA_SECRET as string,
			paper: isPaper,
		});

		// Register event handler
		tradingStream.on((event) => {
			switch (event.type) {
				case "connected":
					log.debug("Connected to Alpaca trading stream");
					break;
				case "authenticated":
					log.debug("Authenticated with Alpaca trading stream");
					break;
				case "listening":
					log.debug({ streams: event.streams }, "Subscribed to Alpaca trading streams");
					break;
				case "trade_update":
					handleTradeUpdate(event).catch((error) => {
						log.error(
							{ error: error instanceof Error ? error.message : String(error) },
							"Error handling trade update"
						);
					});
					break;
				case "error":
					log.error({ message: event.message }, "Alpaca trading stream error");
					break;
				case "disconnected":
					// Code 1000 is normal close (server idle timeout) - log at debug level
					if (event.reason.includes("code 1000")) {
						log.debug(
							{ reason: event.reason },
							"Alpaca trading stream disconnected (idle timeout)"
						);
					} else {
						log.warn({ reason: event.reason }, "Alpaca trading stream disconnected");
					}
					break;
				case "reconnecting":
					// First few reconnect attempts are expected after idle timeout
					if (event.attempt <= 2) {
						log.debug({ attempt: event.attempt }, "Reconnecting to Alpaca trading stream");
					} else {
						log.info({ attempt: event.attempt }, "Reconnecting to Alpaca trading stream");
					}
					break;
			}
		});

		// Connect to the stream
		await tradingStream.connect();
		log.info({ paper: isPaper }, "Trading updates streaming initialized");
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to initialize trading updates streaming"
		);
		tradingStream = null;
	}
}

/**
 * Check if trading updates streaming is connected.
 */
export function isTradingUpdatesConnected(): boolean {
	return tradingStream?.isConnected() ?? false;
}

/**
 * Shutdown trading updates streaming.
 */
export function shutdownTradingUpdatesStreaming(): void {
	if (tradingStream) {
		tradingStream.disconnect();
		tradingStream = null;
		log.info("Trading updates streaming shutdown");
	}
}
