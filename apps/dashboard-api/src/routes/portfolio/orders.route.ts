import type { Order as BrokerOrder, GetOrdersOptions } from "@cream/broker";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import { OrdersQuerySchema, OrdersResponseSchema } from "./schemas.js";
import { getBrokerClient } from "./shared.js";

const ordersRoute = createRoute({
	method: "get",
	path: "/orders",
	request: {
		query: OrdersQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: OrdersResponseSchema } },
			description: "Orders from Alpaca",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Trading service unavailable",
		},
	},
	tags: ["Portfolio"],
});

function buildOrdersOptions(query: z.infer<typeof OrdersQuerySchema>): GetOrdersOptions {
	const options: GetOrdersOptions = {
		status: query.status,
		limit: query.limit,
		direction: query.direction,
		nested: query.nested,
	};

	if (query.symbols) {
		options.symbols = query.symbols.split(",").map((symbol) => symbol.trim());
	}
	if (query.side) {
		options.side = query.side;
	}

	return options;
}

function mapOrder(order: BrokerOrder) {
	return {
		id: order.id,
		clientOrderId: order.clientOrderId,
		symbol: order.symbol,
		qty: order.qty,
		filledQty: order.filledQty,
		side: order.side,
		type: order.type,
		timeInForce: order.timeInForce,
		status: order.status,
		limitPrice: order.limitPrice ?? null,
		stopPrice: order.stopPrice ?? null,
		filledAvgPrice: order.filledAvgPrice ?? null,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
		submittedAt: order.submittedAt ?? null,
		filledAt: order.filledAt ?? null,
	};
}

export function registerOrdersRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(ordersRoute, async (c) => {
		const query = c.req.valid("query");

		try {
			const client = getBrokerClient();
			const orders = await client.getOrders(buildOrdersOptions(query));
			log.debug(
				{ status: query.status, count: orders.length, limit: query.limit },
				"Fetched orders from Alpaca",
			);

			const mappedOrders = orders.map((order) => mapOrder(order));
			return c.json({
				orders: mappedOrders,
				count: mappedOrders.length,
			});
		} catch (error) {
			if (error instanceof HTTPException) {
				throw error;
			}
			const message = error instanceof Error ? error.message : "Unknown error";
			log.error({ error: message }, "Failed to fetch orders from Alpaca");
			throw new HTTPException(503, { message: `Failed to fetch orders: ${message}` });
		}
	});
}
