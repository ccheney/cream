/**
 * Trading Updates Streaming
 *
 * Connects to alpaca-stream-proxy via gRPC to receive real-time
 * order fills and position changes, then broadcasts to dashboard clients
 * and persists position changes to the database.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { type Position as AlpacaPosition, createAlpacaClient } from "@cream/broker";
import { requireEnv } from "@cream/domain";
import { DecisionsRepository, PositionsRepository } from "@cream/storage";
import log from "../logger.js";
import { broadcastOrderUpdate, broadcastPositionUpdate } from "../websocket/channels.js";
import { type OrderUpdate, streamOrderUpdates } from "./proxy-client.js";

// Proxy state
let proxyAbortController: AbortController | null = null;
let proxyStreamRunning = false;

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

/**
 * Sync position from Alpaca to database.
 * Creates new position or updates existing one, linking to the most recent decision.
 */
async function syncPositionToDb(
	position: AlpacaPosition,
	environment: string,
	filledAt?: string | null,
): Promise<void> {
	const positionsRepo = new PositionsRepository();
	const existing = await positionsRepo.findBySymbol(position.symbol, environment);

	if (existing) {
		await positionsRepo.updatePrice(existing.id, position.currentPrice);
		log.debug({ symbol: position.symbol, id: existing.id }, "Updated position in database");
	} else {
		const decisionsRepo = new DecisionsRepository();
		const recentDecisions = await decisionsRepo.findMany(
			{ symbol: position.symbol },
			{ limit: 1, offset: 0 },
		);
		const decisionId = recentDecisions.data[0]?.id ?? null;

		const created = await positionsRepo.create({
			symbol: position.symbol,
			side: position.side as "long" | "short",
			quantity: Math.abs(position.qty),
			avgEntryPrice: position.avgEntryPrice,
			currentPrice: position.currentPrice,
			decisionId,
			environment,
			openedAt: filledAt ? new Date(filledAt) : undefined,
		});
		log.info(
			{
				symbol: position.symbol,
				id: created.id,
				qty: position.qty,
				decisionId,
				openedAt: filledAt,
			},
			"Created position in database",
		);
	}
}

/**
 * Close position in database when it no longer exists in Alpaca.
 */
async function closePositionInDb(symbol: string, environment: string): Promise<void> {
	const positionsRepo = new PositionsRepository();
	const existing = await positionsRepo.findBySymbol(symbol, environment);

	if (existing) {
		await positionsRepo.close(existing.id, existing.currentPrice ?? existing.avgEntryPrice);
		log.info({ symbol, id: existing.id }, "Closed position in database");
	}
}

// ============================================
// Proxy Mode Handlers
// ============================================

/**
 * Map proxy OrderEvent enum to string event type.
 */
function mapProxyEventType(event: number): OrderEventType {
	const eventMap: Record<number, OrderEventType> = {
		1: "new",
		2: "fill",
		3: "partial_fill",
		4: "canceled",
		5: "expired",
		6: "rejected",
		7: "pending_new",
		8: "stopped",
		9: "replaced",
		10: "suspended",
		11: "pending_cancel",
		12: "pending_replace",
		13: "calculated",
		14: "done_for_day",
	};
	return eventMap[event] ?? "new";
}

/**
 * Handle an order update from the proxy stream.
 */
async function handleProxyOrderUpdate(update: OrderUpdate): Promise<void> {
	const order = update.order;
	if (!order) {
		log.warn("Received proxy order update without order details");
		return;
	}

	const eventType = mapProxyEventType(update.event);

	log.debug(
		{ event: eventType, symbol: order.symbol, orderId: order.id },
		"Received trade update from proxy",
	);

	// Broadcast order update
	broadcastOrderUpdate({
		type: "order_update",
		data: {
			orderId: order.id,
			clientOrderId: order.clientOrderId,
			symbol: order.symbol,
			side: order.side === 1 ? "buy" : "sell",
			orderType: order.orderType === 2 ? "market" : "limit",
			status: order.status,
			qty: order.qty,
			filledQty: order.filledQty,
			filledAvgPrice: order.filledAvgPrice,
			event: eventType,
			timestamp: update.timestamp
				? new Date(Number(update.timestamp.seconds) * 1000).toISOString()
				: new Date().toISOString(),
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

			const position = await client.getPosition(order.symbol);
			const filledAt = order.filledAt
				? new Date(Number(order.filledAt.seconds) * 1000).toISOString()
				: null;

			if (position) {
				await syncPositionToDb(position, environment, filledAt);

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
					"Broadcasted position update (proxy)",
				);
			} else if (eventType === "fill") {
				await closePositionInDb(order.symbol, environment);

				broadcastPositionUpdate({
					type: "position_update",
					data: {
						symbol: order.symbol,
						side: "LONG",
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

				log.info({ symbol: order.symbol }, "Position closed, broadcasted removal (proxy)");
			}
		} catch (error) {
			log.warn(
				{
					symbol: order.symbol,
					error: error instanceof Error ? error.message : String(error),
				},
				"Failed to fetch position after fill (proxy)",
			);
		}
	}
}

/**
 * Start the proxy order updates stream consumer.
 */
async function startProxyOrderStream(signal: AbortSignal): Promise<void> {
	try {
		for await (const update of streamOrderUpdates([], [], {
			signal,
			onReconnect: (attempt) => {
				log.info({ attempt }, "Proxy order updates stream reconnecting");
			},
			onError: (error) => {
				log.error({ error: error.message }, "Proxy order updates stream error");
			},
		})) {
			handleProxyOrderUpdate(update).catch((error) => {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Error handling proxy order update",
				);
			});
		}
	} catch (error) {
		if (!signal.aborted) {
			log.error({ error }, "Proxy order updates stream failed");
		}
	}
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize trading updates streaming.
 */
export async function initTradingUpdatesStreaming(): Promise<void> {
	if (proxyStreamRunning) {
		log.warn("Trading updates proxy streaming already running");
		return;
	}

	proxyAbortController = new AbortController();
	startProxyOrderStream(proxyAbortController.signal);
	proxyStreamRunning = true;

	log.info("Trading updates streaming initialized via proxy");
}

/**
 * Check if trading updates streaming is connected.
 */
export function isTradingUpdatesConnected(): boolean {
	return proxyStreamRunning;
}

/**
 * Shutdown trading updates streaming.
 */
export function shutdownTradingUpdatesStreaming(): void {
	if (proxyAbortController) {
		proxyAbortController.abort();
		proxyAbortController = null;
	}
	proxyStreamRunning = false;

	log.info("Trading updates streaming shutdown");
}
