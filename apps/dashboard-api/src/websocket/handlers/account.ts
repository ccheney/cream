/**
 * Account Handlers
 *
 * Handlers for Alpaca trade stream events (account/position/order updates).
 * Wires up the AlpacaTradingStreamService to broadcast to dashboard clients.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import log from "../../logger.js";
import type { TradingStreamEvent } from "../../services/alpaca-streaming.js";
import {
	getTradingStreamService,
	shutdownTradingStreamService,
} from "../../services/alpaca-streaming.js";
import { persistOrderFromTradeUpdate } from "../../services/order-persistence.js";
import { broadcastOrderUpdate, broadcastPositionUpdate } from "../channels.js";

let isInitialized = false;

const FILL_EVENTS = new Set(["fill", "partial_fill"]);

function isFillEvent(eventType: string): boolean {
	return FILL_EVENTS.has(eventType);
}

function getOrderInvalidates(eventType: string): string[] {
	const invalidates = ["orders", "orders.recent"];
	if (isFillEvent(eventType)) {
		invalidates.push("portfolio.positions", "portfolio.summary", "portfolio.account");
	}
	return invalidates;
}

function createPositionUpdateData(event: TradingStreamEvent, timestamp: string) {
	const { order } = event.data;
	const fillPrice = event.data.price ? Number.parseFloat(event.data.price) : null;
	const fillQty = event.data.qty ? Number.parseFloat(event.data.qty) : null;
	const positionQty = event.data.position_qty ? Number.parseFloat(event.data.position_qty) : 0;
	const side = positionQty >= 0 ? "LONG" : "SHORT";
	const qty = Math.abs(positionQty);
	const avgEntry = order.filled_avg_price ? Number.parseFloat(order.filled_avg_price) : 0;
	const marketValue = qty * (fillPrice ?? avgEntry);

	return {
		payload: {
			type: "position_update" as const,
			data: {
				symbol: order.symbol,
				side,
				qty,
				avgEntry,
				marketValue,
				unrealizedPnl: 0,
				event: event.data.event === "fill" ? "fill" : "partial_fill",
				orderId: order.id,
				timestamp,
			},
			invalidates: [
				"portfolio.positions",
				"portfolio.summary",
				"portfolio.account",
				`portfolio.positions.${order.symbol}`,
			],
		},
		fillPrice,
		fillQty,
		qty,
	};
}

/**
 * Handle trade update events from Alpaca.
 * Maps Alpaca trade_updates to dashboard WebSocket messages.
 * Also persists orders to the database.
 */
async function handleTradeUpdate(event: TradingStreamEvent): Promise<void> {
	if (event.type !== "trade_update") {
		return;
	}

	const { order } = event.data;
	const eventType = event.data.event;
	const timestamp = new Date().toISOString();

	await persistOrderFromTradeUpdate(event.data.event, order);
	const orderUpdateSent = broadcastOrderUpdate({
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
			event: event.data.event,
			timestamp,
		},
		invalidates: getOrderInvalidates(eventType),
	});

	log.debug(
		{
			orderId: order.id,
			symbol: order.symbol,
			event: event.data.event,
			clientsSent: orderUpdateSent,
		},
		"Broadcasted order update",
	);

	if (!isFillEvent(eventType)) {
		return;
	}

	const positionUpdate = createPositionUpdateData(event, timestamp);
	const positionUpdateSent = broadcastPositionUpdate(positionUpdate.payload);
	log.debug(
		{
			symbol: order.symbol,
			event: eventType,
			qty: positionUpdate.qty,
			fillPrice: positionUpdate.fillPrice,
			fillQty: positionUpdate.fillQty,
			clientsSent: positionUpdateSent,
		},
		"Broadcasted position update",
	);
}

/**
 * Initialize the Alpaca trade stream integration.
 * Connects to Alpaca trading stream and sets up event handlers.
 *
 * @param paper - Use paper trading endpoint (default: true)
 */
export async function initAlpacaTradeStream(paper = true): Promise<void> {
	if (isInitialized) {
		log.warn("Alpaca trade stream already initialized");
		return;
	}

	try {
		const service = await getTradingStreamService(paper);

		service.on(async (event) => {
			switch (event.type) {
				case "connected":
					log.info("Alpaca trading stream connected");
					break;
				case "authenticated":
					log.info("Alpaca trading stream authenticated");
					break;
				case "listening": {
					log.info({ streams: event.streams }, "Alpaca trading stream listening");
					break;
				}
				case "trade_update":
					await handleTradeUpdate(event);
					break;
				case "error":
					log.error({ message: event.message }, "Alpaca trading stream error");
					break;
				case "disconnected":
					log.warn({ reason: event.reason }, "Alpaca trading stream disconnected");
					break;
				case "reconnecting":
					log.info({ attempt: event.attempt }, "Alpaca trading stream reconnecting");
					break;
				case "heartbeat_sent":
					log.trace("Alpaca trading stream heartbeat sent");
					break;
				case "heartbeat_timeout":
					log.warn("Alpaca trading stream heartbeat timeout - forcing reconnect");
					break;
			}
		});

		isInitialized = true;
		log.info({ paper }, "Alpaca trade stream integration initialized");
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to initialize Alpaca trade stream",
		);
		throw error;
	}
}

/**
 * Shutdown the Alpaca trade stream integration.
 */
export function shutdownAlpacaTradeStream(): void {
	if (!isInitialized) {
		return;
	}

	shutdownTradingStreamService();
	isInitialized = false;
	log.info("Alpaca trade stream integration shutdown");
}

/**
 * Check if the Alpaca trade stream is initialized.
 */
export function isAlpacaTradeStreamInitialized(): boolean {
	return isInitialized;
}
