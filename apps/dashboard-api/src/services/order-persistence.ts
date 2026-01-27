/**
 * Order Persistence Service
 *
 * Persists orders to PostgreSQL from Alpaca trade update events.
 * Handles both new orders and updates to existing orders.
 */

import { requireEnv } from "@cream/domain/env";
import {
	type OrderStatus,
	OrdersRepository,
	type OrderType,
	type TimeInForce,
} from "@cream/storage";

import log from "../logger.js";
import type { AlpacaOrder, TradeUpdateEvent } from "./alpaca-streaming.js";

// Proxy order type from gRPC stream (matches OrderDetails protobuf)
interface ProxyOrder {
	id: string;
	clientOrderId: string;
	symbol: string;
	side: number; // OrderSide enum: 1 = buy, 2 = sell
	orderType: number; // OrderType enum: 1 = limit, 2 = market, etc.
	status: string;
	qty: string; // String in protobuf
	filledQty: string; // String in protobuf
	filledAvgPrice: string; // String in protobuf
	limitPrice?: string;
	stopPrice?: string;
	filledAt?: { seconds: bigint };
}

// ============================================
// Type Mappings
// ============================================

function mapAlpacaStatus(alpacaStatus: string): OrderStatus {
	switch (alpacaStatus) {
		case "new":
		case "pending_new":
			return "pending";
		case "accepted":
			return "accepted";
		case "partially_filled":
			return "partial_fill";
		case "filled":
			return "filled";
		case "canceled":
		case "pending_cancel":
			return "cancelled";
		case "rejected":
			return "rejected";
		case "expired":
		case "done_for_day":
			return "expired";
		default:
			return "submitted";
	}
}

function mapAlpacaOrderType(alpacaType: string): OrderType {
	switch (alpacaType) {
		case "limit":
			return "limit";
		case "stop":
			return "stop";
		case "stop_limit":
			return "stop_limit";
		default:
			return "market";
	}
}

function mapAlpacaTimeInForce(tif: string): TimeInForce {
	switch (tif) {
		case "gtc":
			return "gtc";
		case "ioc":
			return "ioc";
		case "fok":
			return "fok";
		default:
			return "day";
	}
}

// ============================================
// Persistence Functions
// ============================================

let ordersRepo: OrdersRepository | null = null;

function getOrdersRepo(): OrdersRepository {
	if (!ordersRepo) {
		ordersRepo = new OrdersRepository();
	}
	return ordersRepo;
}

/**
 * Persist or update an order from an Alpaca trade update event.
 * Creates new orders if they don't exist, updates existing ones.
 */
export async function persistOrderFromTradeUpdate(
	event: TradeUpdateEvent,
	order: AlpacaOrder,
): Promise<void> {
	const brokerOrderId = order.id;
	const environment = requireEnv();
	const repo = getOrdersRepo();

	try {
		const existing = await repo.findByBrokerOrderId(brokerOrderId);

		if (existing) {
			await updateExistingOrder(existing.id, event, order);
		} else {
			await createNewOrder(order, environment);
		}
	} catch (error) {
		log.error(
			{
				brokerOrderId,
				symbol: order.symbol,
				event,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to persist order from trade update",
		);
	}
}

/**
 * Create a new order in the database from an Alpaca order.
 */
async function createNewOrder(order: AlpacaOrder, environment: string): Promise<void> {
	const quantity = order.qty ? Number(order.qty) : 0;
	if (quantity <= 0) {
		log.warn(
			{ brokerOrderId: order.id, symbol: order.symbol },
			"Skipping order with zero quantity",
		);
		return;
	}

	const newOrder = await getOrdersRepo().create({
		symbol: order.symbol,
		side: order.side,
		quantity,
		orderType: mapAlpacaOrderType(order.order_type),
		limitPrice: order.limit_price ? Number(order.limit_price) : null,
		stopPrice: order.stop_price ? Number(order.stop_price) : null,
		timeInForce: mapAlpacaTimeInForce(order.time_in_force),
		environment,
	});

	await getOrdersRepo().updateStatus(newOrder.id, mapAlpacaStatus(order.status), order.id);

	const filledQty = Number(order.filled_qty);
	const avgFillPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;
	if (filledQty > 0 && avgFillPrice !== null) {
		await getOrdersRepo().updateFill(newOrder.id, filledQty, avgFillPrice);
	}

	log.info(
		{
			orderId: newOrder.id,
			brokerOrderId: order.id,
			symbol: order.symbol,
			side: order.side,
			qty: quantity,
			status: order.status,
		},
		"Created order from trade update",
	);
}

/**
 * Update an existing order from an Alpaca trade update.
 */
async function updateExistingOrder(
	orderId: string,
	event: TradeUpdateEvent,
	order: AlpacaOrder,
): Promise<void> {
	const status = mapAlpacaStatus(order.status);

	switch (event) {
		case "fill":
		case "partial_fill": {
			const filledQty = Number(order.filled_qty);
			const avgFillPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;
			if (avgFillPrice !== null) {
				await getOrdersRepo().updateFill(orderId, filledQty, avgFillPrice);
				log.info(
					{
						orderId,
						brokerOrderId: order.id,
						symbol: order.symbol,
						event,
						filledQty,
						avgFillPrice,
					},
					"Updated order fill",
				);
			}
			break;
		}

		case "canceled":
		case "expired":
		case "rejected":
		case "done_for_day": {
			await getOrdersRepo().updateStatus(orderId, status);
			log.info(
				{
					orderId,
					brokerOrderId: order.id,
					symbol: order.symbol,
					event,
					status,
				},
				"Updated order status",
			);
			break;
		}

		case "new":
		case "pending_new": {
			await getOrdersRepo().updateStatus(orderId, status);
			log.debug(
				{
					orderId,
					brokerOrderId: order.id,
					symbol: order.symbol,
					event,
					status,
				},
				"Updated order status",
			);
			break;
		}

		default:
			log.debug(
				{ orderId, brokerOrderId: order.id, event },
				"Ignoring trade update event for order persistence",
			);
	}
}

/**
 * Persist or update an order from a proxy stream update.
 * Handles the protobuf order format from alpaca-stream-proxy.
 */
export async function persistOrderFromProxyUpdate(
	eventType: string,
	order: ProxyOrder,
): Promise<void> {
	const brokerOrderId = order.id;
	const environment = requireEnv();
	const repo = getOrdersRepo();

	try {
		const existing = await repo.findByBrokerOrderId(brokerOrderId);

		if (existing) {
			await updateExistingOrderFromProxy(existing.id, eventType, order);
		} else {
			await createNewOrderFromProxy(order, environment);
		}
	} catch (error) {
		log.error(
			{
				brokerOrderId,
				symbol: order.symbol,
				event: eventType,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to persist order from proxy update",
		);
	}
}

async function createNewOrderFromProxy(order: ProxyOrder, environment: string): Promise<void> {
	const quantity = Number(order.qty);
	if (quantity <= 0) {
		log.warn(
			{ brokerOrderId: order.id, symbol: order.symbol },
			"Skipping proxy order with zero quantity",
		);
		return;
	}

	const side = order.side === 1 ? "buy" : "sell";
	const orderType: OrderType = order.orderType === 1 ? "limit" : "market";

	const newOrder = await getOrdersRepo().create({
		symbol: order.symbol,
		side,
		quantity,
		orderType,
		limitPrice: order.limitPrice ? Number(order.limitPrice) : null,
		stopPrice: order.stopPrice ? Number(order.stopPrice) : null,
		timeInForce: "day",
		environment,
	});

	await getOrdersRepo().updateStatus(newOrder.id, mapAlpacaStatus(order.status), order.id);

	const filledQty = Number(order.filledQty);
	const filledAvgPrice = Number(order.filledAvgPrice);
	if (filledQty > 0 && filledAvgPrice > 0) {
		await getOrdersRepo().updateFill(newOrder.id, filledQty, filledAvgPrice);
	}

	log.info(
		{
			orderId: newOrder.id,
			brokerOrderId: order.id,
			symbol: order.symbol,
			side,
			qty: quantity,
			status: order.status,
		},
		"Created order from proxy update",
	);
}

async function updateExistingOrderFromProxy(
	orderId: string,
	eventType: string,
	order: ProxyOrder,
): Promise<void> {
	const status = mapAlpacaStatus(order.status);

	const filledQty = Number(order.filledQty);
	const filledAvgPrice = Number(order.filledAvgPrice);

	switch (eventType) {
		case "fill":
		case "partial_fill": {
			if (filledAvgPrice > 0) {
				await getOrdersRepo().updateFill(orderId, filledQty, filledAvgPrice);
				log.info(
					{
						orderId,
						brokerOrderId: order.id,
						symbol: order.symbol,
						event: eventType,
						filledQty,
						avgFillPrice: filledAvgPrice,
					},
					"Updated order fill from proxy",
				);
			}
			break;
		}

		case "canceled":
		case "expired":
		case "rejected":
		case "done_for_day": {
			await getOrdersRepo().updateStatus(orderId, status);
			log.info(
				{
					orderId,
					brokerOrderId: order.id,
					symbol: order.symbol,
					event: eventType,
					status,
				},
				"Updated order status from proxy",
			);
			break;
		}

		case "new":
		case "pending_new": {
			await getOrdersRepo().updateStatus(orderId, status);
			break;
		}

		default:
			break;
	}
}
