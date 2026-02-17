import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import { AccountSchema } from "./schemas.js";
import { getBrokerClient } from "./shared.js";

const accountRoute = createRoute({
	method: "get",
	path: "/account",
	responses: {
		200: {
			content: { "application/json": { schema: AccountSchema } },
			description: "Alpaca trading account information",
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

export function registerAccountRoute(app: OpenAPIHono): void {
	// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
	app.openapi(accountRoute, async (c) => {
		try {
			const client = getBrokerClient();
			const account = await client.getAccount();
			log.debug(
				{ accountId: account.id, status: account.status, equity: account.equity },
				"Fetched Alpaca account",
			);

			return c.json({
				id: account.id,
				status: account.status.toUpperCase(),
				currency: account.currency,
				cash: account.cash,
				portfolioValue: account.portfolioValue,
				buyingPower: account.buyingPower,
				regtBuyingPower: account.regtBuyingPower,
				daytradingBuyingPower: account.daytradingBuyingPower,
				daytradeCount: account.daytradeCount,
				patternDayTrader: account.patternDayTrader,
				tradingBlocked: account.tradingBlocked,
				transfersBlocked: account.transfersBlocked,
				accountBlocked: account.accountBlocked,
				shortingEnabled: account.shortingEnabled,
				longMarketValue: account.longMarketValue,
				shortMarketValue: account.shortMarketValue,
				equity: account.equity,
				lastEquity: account.lastEquity,
				multiplier: account.multiplier,
				initialMargin: account.initialMargin,
				maintenanceMargin: account.maintenanceMargin,
				sma: account.sma,
				createdAt: account.createdAt,
			});
		} catch (error) {
			if (error instanceof HTTPException) {
				throw error;
			}
			const message = error instanceof Error ? error.message : "Unknown error";
			log.error({ error: message }, "Failed to fetch Alpaca account");
			throw new HTTPException(503, { message: `Failed to fetch account: ${message}` });
		}
	});
}
