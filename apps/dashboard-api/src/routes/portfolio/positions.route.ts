import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import { ClosePositionRequestSchema, PositionSchema } from "./schemas.js";
import { extractSymbolFromPositionId, getBrokerClient, isAlpacaConfigured } from "./shared.js";

const positionsRoute = createRoute({
	method: "get",
	path: "/positions",
	responses: {
		200: {
			content: { "application/json": { schema: z.array(PositionSchema) } },
			description: "All open positions",
		},
	},
	tags: ["Portfolio"],
});

const positionDetailRoute = createRoute({
	method: "get",
	path: "/positions/:id",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: { "application/json": { schema: PositionSchema } },
			description: "Position detail",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Position not found",
		},
	},
	tags: ["Portfolio"],
});

const closePositionRoute = createRoute({
	method: "post",
	path: "/positions/:id/close",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: { "application/json": { schema: ClosePositionRequestSchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						orderId: z.string(),
						message: z.string(),
					}),
				},
			},
			description: "Close order submitted",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Position not found",
		},
	},
	tags: ["Portfolio"],
});

function mapAlpacaPositionToApi(position: {
	symbol: string;
	side: "long" | "short";
	qty: number;
	avgEntryPrice: number;
	currentPrice: number;
	lastdayPrice: number;
	marketValue: number;
	unrealizedPl: number;
	unrealizedPlpc: number;
}): z.infer<typeof PositionSchema> {
	return {
		id: `alpaca-${position.symbol}`,
		symbol: position.symbol,
		side: position.side === "long" ? ("LONG" as const) : ("SHORT" as const),
		qty: position.qty,
		avgEntry: position.avgEntryPrice,
		currentPrice: position.currentPrice,
		lastdayPrice: position.lastdayPrice ?? null,
		marketValue: position.marketValue,
		unrealizedPnl: position.unrealizedPl,
		unrealizedPnlPct: position.unrealizedPlpc * 100,
		thesisId: null,
		daysHeld: 0,
		openedAt: new Date().toISOString(),
	};
}

function registerPositionsRoute(app: OpenAPIHono): void {
	app.openapi(positionsRoute, async (c) => {
		if (!isAlpacaConfigured()) {
			log.warn("Alpaca not configured, returning empty positions");
			return c.json([]);
		}

		try {
			const client = getBrokerClient();
			const alpacaPositions = await client.getPositions();
			log.debug({ count: alpacaPositions.length }, "Fetched positions from Alpaca");
			return c.json(alpacaPositions.map((position) => mapAlpacaPositionToApi(position)));
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca positions",
			);
			throw new HTTPException(502, { message: "Failed to fetch positions from broker" });
		}
	});
}

function registerPositionDetailRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(positionDetailRoute, async (c) => {
		const { id } = c.req.valid("param");
		const symbol = extractSymbolFromPositionId(id);

		if (!isAlpacaConfigured()) {
			return c.json({ error: "Trading service unavailable" }, 404);
		}

		try {
			const client = getBrokerClient();
			const alpacaPosition = await client.getPosition(symbol);
			if (!alpacaPosition) {
				return c.json({ error: "Position not found" }, 404);
			}

			return c.json(mapAlpacaPositionToApi(alpacaPosition));
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error), symbol },
				"Failed to fetch Alpaca position",
			);
			throw new HTTPException(502, { message: "Failed to fetch position from broker" });
		}
	});
}

function registerClosePositionRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(closePositionRoute, async (c) => {
		const { id } = c.req.valid("param");
		c.req.valid("json");
		const symbol = extractSymbolFromPositionId(id);

		if (!isAlpacaConfigured()) {
			return c.json({ error: "Trading service unavailable" }, 404);
		}

		try {
			const client = getBrokerClient();
			const position = await client.getPosition(symbol);
			if (!position) {
				log.warn({ symbol }, "Close position request for non-existent position");
				return c.json({ error: "Position not found" }, 404);
			}

			log.info({ symbol, qty: position.qty, side: position.side }, "Closing position via Alpaca");
			const order = await client.closePosition(symbol);
			log.info({ symbol, orderId: order.id }, "Close order submitted to Alpaca");

			return c.json({
				orderId: order.id,
				message: `Close order submitted for ${symbol}`,
			});
		} catch (error) {
			log.error(
				{ symbol, error: error instanceof Error ? error.message : String(error) },
				"Failed to close position",
			);
			throw new HTTPException(502, { message: "Failed to close position via broker" });
		}
	});
}

export function registerPositionsRoutes(app: OpenAPIHono): void {
	registerPositionsRoute(app);
	registerPositionDetailRoute(app);
	registerClosePositionRoute(app);
}
