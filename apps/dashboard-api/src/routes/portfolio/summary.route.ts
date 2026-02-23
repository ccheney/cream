import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPortfolioSnapshotsRepo } from "../../db.js";
import log from "../../logger.js";
import { getCurrentEnvironment } from "../system.js";
import { PortfolioSummarySchema } from "./schemas.js";
import { getBrokerClient, isAlpacaConfigured } from "./shared.js";

const summaryRoute = createRoute({
	method: "get",
	path: "/summary",
	responses: {
		200: {
			content: { "application/json": { schema: PortfolioSummarySchema } },
			description: "Portfolio summary",
		},
	},
	tags: ["Portfolio"],
});

function calculateTodayPnl(
	positions: Array<{ currentPrice: number; lastdayPrice: number; qty: number }>,
) {
	return positions.reduce((sum, position) => {
		const dayChange = (position.currentPrice - position.lastdayPrice) * position.qty;
		return sum + dayChange;
	}, 0);
}

function calculateExposure(positions: Array<{ side: string; marketValue: number }>) {
	let longValue = 0;
	let shortValue = 0;

	for (const position of positions) {
		if (position.side === "long") {
			longValue += position.marketValue;
		} else {
			shortValue += Math.abs(position.marketValue);
		}
	}

	return {
		grossExposure: longValue + shortValue,
		netExposure: longValue - shortValue,
	};
}

function calculateTotalPnl(
	latestSnapshot: { nav: number } | null,
	firstSnapshot: { nav: number } | null,
	portfolioValue: number,
) {
	const totalPnl = latestSnapshot && firstSnapshot ? portfolioValue - firstSnapshot.nav : 0;
	const totalPnlPct = firstSnapshot?.nav ? (totalPnl / firstSnapshot.nav) * 100 : 0;
	return { totalPnl, totalPnlPct };
}

async function fetchSummaryFromBroker(
	latestSnapshot: { nav: number } | null,
	firstSnapshot: { nav: number } | null,
) {
	const client = getBrokerClient();
	const [alpacaAccount, alpacaPositions] = await Promise.all([
		client.getAccount(),
		client.getPositions(),
	]);

	const todayPnl = calculateTodayPnl(alpacaPositions);
	const yesterdayValue = alpacaAccount.lastEquity;
	const todayPnlPct = yesterdayValue > 0 ? (todayPnl / yesterdayValue) * 100 : 0;
	const { grossExposure, netExposure } = calculateExposure(alpacaPositions);
	const { totalPnl, totalPnlPct } = calculateTotalPnl(
		latestSnapshot,
		firstSnapshot,
		alpacaAccount.portfolioValue,
	);

	log.debug(
		{ todayPnl, todayPnlPct, positionCount: alpacaPositions.length },
		"Calculated summary from Alpaca",
	);

	return {
		nav: alpacaAccount.portfolioValue,
		cash: alpacaAccount.cash,
		equity: alpacaAccount.equity,
		buyingPower: alpacaAccount.buyingPower,
		grossExposure,
		netExposure,
		positionCount: alpacaPositions.length,
		todayPnl,
		todayPnlPct,
		totalPnl,
		totalPnlPct,
		lastUpdated: new Date().toISOString(),
	};
}

async function getSummaryPayload() {
	const snapshotsRepo = await getPortfolioSnapshotsRepo();
	const environment = getCurrentEnvironment();
	const latestSnapshot = await snapshotsRepo.getLatest(environment);

	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Broker credentials are not configured. Set ALPACA_KEY and ALPACA_SECRET.",
		});
	}

	const firstSnapshot = await snapshotsRepo.getFirst(environment);
	return fetchSummaryFromBroker(latestSnapshot, firstSnapshot);
}

export function registerSummaryRoute(app: OpenAPIHono): void {
	app.openapi(summaryRoute, async (c) => {
		try {
			return c.json(await getSummaryPayload());
		} catch (error) {
			if (error instanceof HTTPException) {
				throw error;
			}
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca data for summary",
			);
			throw new HTTPException(502, { message: "Failed to fetch portfolio summary from broker" });
		}
	});
}
