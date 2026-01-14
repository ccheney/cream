/**
 * Portfolio Handlers
 *
 * Handlers for portfolio state requests and position updates.
 */

import { requireEnv } from "@cream/domain";
import { sendError, sendMessage } from "../channels.js";
import type { WebSocketWithMetadata } from "../types.js";

/**
 * Handle portfolio state request.
 * Returns current positions and portfolio summary.
 */
export async function handlePortfolioState(ws: WebSocketWithMetadata): Promise<void> {
	try {
		const { getPositionsRepo } = await import("../../db.js");
		const positionsRepo = await getPositionsRepo();
		const environment = requireEnv();
		const positionsResult = await positionsRepo.findMany({
			environment,
			status: "open",
		});

		const positions = positionsResult.data.map((p) => ({
			symbol: p.symbol,
			quantity: p.quantity,
			marketValue: p.marketValue ?? p.quantity * (p.avgEntryPrice ?? 0),
			unrealizedPnl: p.unrealizedPnl ?? 0,
			unrealizedPnlPercent: p.unrealizedPnlPct ?? 0,
			costBasis: p.avgEntryPrice ?? 0,
		}));

		const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

		sendMessage(ws, {
			type: "portfolio",
			data: {
				totalValue,
				cash: 0,
				buyingPower: 0,
				dailyPnl: 0,
				dailyPnlPercent: 0,
				openPositions: positions.length,
				positions,
				timestamp: new Date().toISOString(),
			},
		});
	} catch (error) {
		sendError(
			ws,
			`Failed to get portfolio state: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/**
 * Handle orders state request.
 * Returns current pending orders.
 */
export async function handleOrdersState(ws: WebSocketWithMetadata): Promise<void> {
	try {
		const { getOrdersRepo } = await import("../../db.js");
		const ordersRepo = await getOrdersRepo();
		const environment = requireEnv();
		const ordersResult = await ordersRepo.findMany({
			environment,
			status: "pending",
		});

		const sideMap: Record<string, "buy" | "sell"> = { BUY: "buy", SELL: "sell" };
		const orderTypeMap: Record<string, "market" | "limit" | "stop" | "stop_limit"> = {
			MARKET: "market",
			LIMIT: "limit",
			STOP: "stop",
			STOP_LIMIT: "stop_limit",
		};
		const statusMap: Record<
			string,
			"pending" | "submitted" | "partial_fill" | "filled" | "cancelled" | "rejected" | "expired"
		> = {
			pending: "pending",
			submitted: "submitted",
			accepted: "submitted",
			partially_filled: "partial_fill",
			filled: "filled",
			cancelled: "cancelled",
			rejected: "rejected",
			expired: "expired",
		};

		for (const order of ordersResult.data) {
			sendMessage(ws, {
				type: "order",
				data: {
					id: order.id,
					symbol: order.symbol,
					side: sideMap[order.side] ?? "buy",
					orderType: orderTypeMap[order.orderType] ?? "market",
					status: statusMap[order.status] ?? "pending",
					quantity: order.quantity,
					filledQty: order.filledQuantity ?? 0,
					limitPrice: order.limitPrice ?? undefined,
					stopPrice: order.stopPrice ?? undefined,
					avgPrice: order.avgFillPrice ?? undefined,
					timestamp: order.createdAt,
				},
			});
		}
	} catch (error) {
		sendError(
			ws,
			`Failed to get orders state: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
