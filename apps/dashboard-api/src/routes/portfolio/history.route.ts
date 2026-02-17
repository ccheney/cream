import {
	getPortfolioHistory,
	type PortfolioHistory,
	PortfolioHistoryError,
	type PortfolioHistoryPeriod,
	type PortfolioHistoryTimeframe,
} from "@cream/broker";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import { getCurrentEnvironment } from "../system.js";
import {
	AlpacaPortfolioHistorySchema,
	PortfolioHistoryPeriodSchema,
	PortfolioHistoryTimeframeSchema,
} from "./schemas.js";
import { getBrokerCredentials, getCached, isAlpacaConfigured, setCache } from "./shared.js";

const historyRoute = createRoute({
	method: "get",
	path: "/history",
	request: {
		query: z.object({
			period: PortfolioHistoryPeriodSchema.optional().default("1M"),
			timeframe: PortfolioHistoryTimeframeSchema.optional().default("1D"),
			start: z.string().optional(),
			end: z.string().optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: AlpacaPortfolioHistorySchema } },
			description: "Portfolio history from Alpaca",
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

function buildCacheKey(period: string, timeframe: string, start?: string, end?: string): string {
	const environment = getCurrentEnvironment();
	return `history:${environment}:${period}:${timeframe}:${start ?? ""}:${end ?? ""}`;
}

async function fetchHistoryFromBroker(params: {
	period: string;
	timeframe: string;
	start?: string;
	end?: string;
}): Promise<PortfolioHistory> {
	const { apiKey, apiSecret } = getBrokerCredentials();
	return getPortfolioHistory(
		{ apiKey, apiSecret, environment: getCurrentEnvironment() },
		{
			period: params.period as PortfolioHistoryPeriod,
			timeframe: params.timeframe as PortfolioHistoryTimeframe,
			dateStart: params.start,
			dateEnd: params.end,
		},
	);
}

function assertAlpacaConfigured(): void {
	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Trading service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
		});
	}
}

function throwHistoryFetchError(error: unknown): never {
	if (error instanceof HTTPException) {
		throw error;
	}
	if (error instanceof PortfolioHistoryError) {
		log.error({ error: error.message, statusCode: error.statusCode }, "Portfolio history error");
		throw new HTTPException(503, { message: error.message });
	}
	const message = error instanceof Error ? error.message : "Unknown error";
	log.error({ error: message }, "Failed to fetch Alpaca portfolio history");
	throw new HTTPException(503, { message: `Failed to fetch portfolio history: ${message}` });
}

async function resolveHistory(query: {
	period: string;
	timeframe: string;
	start?: string;
	end?: string;
}): Promise<PortfolioHistory> {
	assertAlpacaConfigured();

	const cacheKey = buildCacheKey(query.period, query.timeframe, query.start, query.end);
	const cached = getCached<PortfolioHistory>(cacheKey);
	if (cached) {
		log.debug(
			{ period: query.period, timeframe: query.timeframe, cached: true },
			"Returning cached portfolio history",
		);
		return cached;
	}

	try {
		const history = await fetchHistoryFromBroker(query);
		setCache(cacheKey, history);
		log.debug(
			{ period: query.period, timeframe: query.timeframe, points: history.timestamp?.length ?? 0 },
			"Fetched Alpaca portfolio history",
		);
		return history;
	} catch (error) {
		throwHistoryFetchError(error);
	}
}

export function registerHistoryRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(historyRoute, async (c) => {
		const { period, timeframe, start, end } = c.req.valid("query");
		const history = await resolveHistory({ period, timeframe, start, end });
		return c.json(history);
	});
}
