/**
 * Portfolio Handlers
 *
 * Handlers for portfolio state requests and position updates.
 * Fetches real-time data from Alpaca, enriched with DB metadata.
 */

import { createAlpacaClient } from "@cream/broker";
import { requireEnv } from "@cream/domain";
import { sendError, sendMessage } from "../channels.js";
import type { WebSocketWithMetadata } from "../types.js";

function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}

/**
 * Handle portfolio state request.
 * Returns current positions and portfolio summary from Alpaca.
 */
export async function handlePortfolioState(ws: WebSocketWithMetadata): Promise<void> {
	try {
		const environment = requireEnv();

		if (!isAlpacaConfigured()) {
			// Fall back to DB-only if Alpaca not configured
			const { getPositionsRepo } = await import("../../db.js");
			const positionsRepo = await getPositionsRepo();
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
			return;
		}

		// Fetch from Alpaca (primary source)
		const client = createAlpacaClient({
			apiKey: Bun.env.ALPACA_KEY as string,
			apiSecret: Bun.env.ALPACA_SECRET as string,
			environment,
		});

		const [alpacaPositions, account] = await Promise.all([
			client.getPositions(),
			client.getAccount(),
		]);

		const positions = alpacaPositions.map((p) => ({
			symbol: p.symbol,
			quantity: p.qty,
			marketValue: p.marketValue,
			unrealizedPnl: p.unrealizedPl,
			unrealizedPnlPercent: p.unrealizedPlpc * 100,
			costBasis: p.avgEntryPrice,
			currentPrice: p.currentPrice,
			lastdayPrice: p.lastdayPrice,
		}));

		// Calculate daily P&L from position changes
		const dailyPnl = alpacaPositions.reduce((sum, p) => {
			const dayChange = (p.currentPrice - p.lastdayPrice) * p.qty * (p.side === "long" ? 1 : -1);
			return sum + dayChange;
		}, 0);

		const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
		const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis * p.quantity, 0);
		const dailyPnlPercent = totalCostBasis > 0 ? (dailyPnl / totalCostBasis) * 100 : 0;

		sendMessage(ws, {
			type: "portfolio",
			data: {
				totalValue,
				cash: account.cash,
				buyingPower: account.buyingPower,
				dailyPnl,
				dailyPnlPercent,
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
