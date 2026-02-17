import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import { ClosedTradesQuerySchema, ClosedTradesResponseSchema } from "./schemas.js";
import { getBrokerClient, isAlpacaConfigured } from "./shared.js";

const closedTradesRoute = createRoute({
	method: "get",
	path: "/closed-trades",
	request: {
		query: ClosedTradesQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: ClosedTradesResponseSchema } },
			description: "Closed trades with realized P&L using FIFO matching",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Service unavailable",
		},
	},
	tags: ["Portfolio"],
});

interface FifoLot {
	orderId: string;
	date: string;
	price: number;
	remainingQty: number;
}

interface ClosedTrade {
	id: string;
	symbol: string;
	side: "LONG" | "SHORT";
	quantity: number;
	entryPrice: number;
	exitPrice: number;
	entryDate: string;
	exitDate: string;
	holdDays: number;
	realizedPnl: number;
	realizedPnlPct: number;
	entryOrderId: string | null;
	exitOrderId: string;
}

function createEmptyResponse() {
	return {
		trades: [],
		count: 0,
		totalRealizedPnl: 0,
		winCount: 0,
		lossCount: 0,
		winRate: 0,
	};
}

function buildClosedTrade(params: {
	symbol: string;
	orderId: string;
	sellDate: string;
	sellPrice: number;
	lot: FifoLot;
	quantity: number;
}): ClosedTrade {
	const entryValue = params.quantity * params.lot.price;
	const exitValue = params.quantity * params.sellPrice;
	const realizedPnl = exitValue - entryValue;
	const realizedPnlPct = params.lot.price > 0 ? (realizedPnl / entryValue) * 100 : 0;
	const entryDate = new Date(params.lot.date);
	const exitDate = new Date(params.sellDate);
	const holdDays = Math.max(0, Math.floor((exitDate.getTime() - entryDate.getTime()) / 86_400_000));

	return {
		id: `${params.symbol}-${params.orderId}-${params.lot.orderId}`,
		symbol: params.symbol,
		side: "LONG",
		quantity: params.quantity,
		entryPrice: params.lot.price,
		exitPrice: params.sellPrice,
		entryDate: params.lot.date,
		exitDate: params.sellDate,
		holdDays,
		realizedPnl,
		realizedPnlPct,
		entryOrderId: params.lot.orderId,
		exitOrderId: params.orderId,
	};
}

function matchSellOrder(params: {
	symbol: string;
	orderId: string;
	date: string;
	price: number;
	quantity: number;
	lots: FifoLot[];
	closedTrades: ClosedTrade[];
}): void {
	let sellQtyRemaining = params.quantity;

	while (sellQtyRemaining > 0 && params.lots.length > 0) {
		const lot = params.lots[0];
		if (!lot) {
			break;
		}

		const matchQty = Math.min(sellQtyRemaining, lot.remainingQty);
		params.closedTrades.push(
			buildClosedTrade({
				symbol: params.symbol,
				orderId: params.orderId,
				sellDate: params.date,
				sellPrice: params.price,
				lot,
				quantity: matchQty,
			}),
		);

		lot.remainingQty -= matchQty;
		sellQtyRemaining -= matchQty;
		if (lot.remainingQty <= 0) {
			params.lots.shift();
		}
	}
}

function summarizeClosedTrades(closedTrades: ClosedTrade[]) {
	const totalRealizedPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
	const winCount = closedTrades.filter((trade) => trade.realizedPnl > 0).length;
	const lossCount = closedTrades.filter((trade) => trade.realizedPnl < 0).length;
	const totalTrades = winCount + lossCount;
	const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
	return { totalRealizedPnl, winCount, lossCount, winRate };
}

async function computeClosedTrades(query: z.infer<typeof ClosedTradesQuerySchema>) {
	const client = getBrokerClient();
	const alpacaOrders = await client.getAllOrders({ status: "closed" });
	const filledOrders = alpacaOrders
		.filter((order) => order.status === "filled" && order.filledAt)
		.filter((order) => !query.symbol || order.symbol === query.symbol)
		.toSorted(
			(a, b) => new Date(a.filledAt as string).getTime() - new Date(b.filledAt as string).getTime(),
		);

	const symbolLots = new Map<string, FifoLot[]>();
	const closedTrades: ClosedTrade[] = [];

	for (const order of filledOrders) {
		const quantity = order.filledQty > 0 ? order.filledQty : order.qty;
		const price = order.filledAvgPrice ?? 0;
		const date = order.filledAt as string;
		const lots = symbolLots.get(order.symbol) ?? [];
		symbolLots.set(order.symbol, lots);

		if (order.side === "buy") {
			lots.push({ orderId: order.id, date, price, remainingQty: quantity });
			continue;
		}

		matchSellOrder({
			symbol: order.symbol,
			orderId: order.id,
			date,
			price,
			quantity,
			lots,
			closedTrades,
		});
	}

	closedTrades.sort((a, b) => new Date(b.exitDate).getTime() - new Date(a.exitDate).getTime());
	const summary = summarizeClosedTrades(closedTrades);
	const trades = closedTrades.slice(query.offset, query.offset + query.limit);

	return {
		trades,
		count: closedTrades.length,
		totalRealizedPnl: summary.totalRealizedPnl,
		winCount: summary.winCount,
		lossCount: summary.lossCount,
		winRate: summary.winRate,
	};
}

export function registerClosedTradesRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(closedTradesRoute, async (c) => {
		const query = c.req.valid("query");

		if (!isAlpacaConfigured()) {
			return c.json(createEmptyResponse());
		}

		try {
			const response = await computeClosedTrades(query);
			log.debug(
				{
					totalTrades: response.count,
					totalRealizedPnl: response.totalRealizedPnl,
					winRate: response.winRate,
					symbol: query.symbol,
				},
				"Computed closed trades from Alpaca with FIFO matching",
			);
			return c.json(response);
		} catch (error) {
			if (error instanceof HTTPException) {
				throw error;
			}
			const message = error instanceof Error ? error.message : "Unknown error";
			log.error({ error: message }, "Failed to fetch closed trades from Alpaca");
			throw new HTTPException(502, { message: "Failed to fetch closed trades from broker" });
		}
	});
}
