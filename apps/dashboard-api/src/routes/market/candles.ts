/**
 * Candle Routes
 *
 * Endpoints for OHLCV candlestick data.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { getPreviousTradingDay, getTradingSession, isMarketOpen } from "@cream/domain";
import type { AlpacaTimeframe } from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../../logger.js";
import {
	CACHE_VERSION,
	type Candle,
	CandleSchema,
	ErrorSchema,
	getAlpacaClient,
	getCached,
	getDaysAgo,
	getTodayNY,
	isMarketHours,
	setCache,
	type Timeframe,
	TimeframeSchema,
} from "./types.js";

const app = new OpenAPIHono();

// Map internal timeframes to Alpaca timeframes
const ALPACA_TIMEFRAME_MAP: Record<Timeframe, AlpacaTimeframe> = {
	"1m": "1Min",
	"5m": "5Min",
	"15m": "15Min",
	"1h": "1Hour",
	"4h": "4Hour",
	"1d": "1Day",
};

function resolveCandleRange(timeframe: Timeframe): { fromStr: string; isIntraday: boolean } {
	const isIntraday = timeframe !== "1d";
	if (!isIntraday) {
		return { fromStr: getDaysAgo(365), isIntraday };
	}
	const todayNY = getTodayNY();
	const session = getTradingSession(new Date());
	const hasIntradayData = session === "RTH" || session === "AFTER_HOURS";
	if (isMarketOpen(todayNY) && hasIntradayData) {
		return { fromStr: todayNY, isIntraday };
	}
	const prevDay = getPreviousTradingDay(todayNY);
	return { fromStr: prevDay.toISOString().slice(0, 10), isIntraday };
}

function filterAndLimitBars(
	bars: Awaited<ReturnType<ReturnType<typeof getAlpacaClient>["getBars"]>>,
	isIntraday: boolean,
	limit: number,
	symbol: string,
	timeframe: Timeframe,
) {
	let filteredBars = bars;
	if (isIntraday) {
		const beforeCount = bars.length;
		filteredBars = bars.filter((bar) => isMarketHours(new Date(bar.timestamp)));
		log.debug(
			{ symbol, timeframe, beforeCount, afterCount: filteredBars.length },
			"Applied market hours filter",
		);
	}
	const sortedBars = filteredBars.toSorted(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
	return sortedBars.slice(Math.max(0, sortedBars.length - limit));
}

function mapBarsToCandles(
	bars: Awaited<ReturnType<ReturnType<typeof getAlpacaClient>["getBars"]>>,
): Candle[] {
	return bars.map((bar) => ({
		timestamp: bar.timestamp,
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: bar.volume,
	}));
}

function logRecentBars(
	bars: Awaited<ReturnType<ReturnType<typeof getAlpacaClient>["getBars"]>>,
	symbol: string,
	timeframe: Timeframe,
): void {
	if (bars.length === 0) {
		return;
	}
	const first = bars[0];
	const last = bars.at(-1);
	log.debug(
		{
			symbol,
			timeframe,
			count: bars.length,
			firstTimestamp: first?.timestamp,
			lastTimestamp: last?.timestamp,
		},
		"Returning candles",
	);
}

async function fetchCandles(
	symbol: string,
	timeframe: Timeframe,
	limit: number,
): Promise<Candle[]> {
	const alpacaTimeframe = ALPACA_TIMEFRAME_MAP[timeframe];
	const { fromStr, isIntraday } = resolveCandleRange(timeframe);
	const toStr = getDaysAgo(-1);
	const fetchLimit = Math.min(limit + 500, 10000);
	const bars = await getAlpacaClient().getBars(symbol, alpacaTimeframe, fromStr, toStr, fetchLimit);

	log.debug(
		{ symbol, timeframe, count: bars.length, from: fromStr, to: toStr },
		"Fetched candles from Alpaca",
	);

	if (bars.length === 0) {
		log.warn({ symbol, timeframe }, "No candle data returned from Alpaca");
		throw new HTTPException(503, { message: `No candle data available for ${symbol}` });
	}

	const recentBars = filterAndLimitBars(bars, isIntraday, limit, symbol, timeframe);
	logRecentBars(recentBars, symbol, timeframe);
	return mapBarsToCandles(recentBars);
}

// ============================================
// Routes
// ============================================

const candlesRoute = createRoute({
	method: "get",
	path: "/candles/:symbol",
	request: {
		params: z.object({
			symbol: z.string(),
		}),
		query: z.object({
			timeframe: TimeframeSchema.default("1h"),
			limit: z.coerce.number().min(1).max(1000).default(500),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(CandleSchema) } },
			description: "Candle data",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(candlesRoute, async (c) => {
	log.debug("Candles endpoint hit");
	const { symbol } = c.req.valid("param");
	const { timeframe, limit } = c.req.valid("query");
	const upperSymbol = symbol.toUpperCase();
	const cacheKey = `candles:${CACHE_VERSION}:${upperSymbol}:${timeframe}:${limit}`;
	const normalizedTimeframe = timeframe as Timeframe;

	const cached = getCached<Candle[]>(cacheKey);
	if (cached) {
		log.debug({ cacheKey, count: cached.length }, "Cache hit for candles");
		return c.json(cached, 200);
	}
	log.debug({ cacheKey }, "Cache miss for candles - fetching fresh data");

	try {
		const candles = await fetchCandles(upperSymbol, normalizedTimeframe, limit);
		setCache(cacheKey, candles);
		return c.json(candles, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch candles for ${upperSymbol}: ${message}`,
		});
	}
});

export default app;
