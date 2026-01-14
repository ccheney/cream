/**
 * Indicators Routes
 *
 * Unified indicator endpoints using IndicatorService from @cream/indicators.
 * Provides both full snapshots and legacy-compatible simple indicators.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { IndicatorSnapshotSchema, PriceIndicatorsSchema } from "@cream/indicators";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getIndicatorService } from "../../services/indicators.js";
import { ErrorSchema, TimeframeSchema } from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Full Indicator Snapshot Endpoint
// ============================================

const snapshotRoute = createRoute({
	method: "get",
	path: "/snapshot/:symbol",
	request: {
		params: z.object({
			symbol: z.string().min(1).max(10),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: IndicatorSnapshotSchema } },
			description: "Full indicator snapshot with all categories",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(snapshotRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const upperSymbol = symbol.toUpperCase();

	try {
		const service = await getIndicatorService();
		const snapshot = await service.getSnapshot(upperSymbol);
		return c.json(snapshot, 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to get indicator snapshot for ${upperSymbol}: ${message}`,
		});
	}
});

// ============================================
// Price Indicators Only Endpoint
// ============================================

const priceIndicatorsRoute = createRoute({
	method: "get",
	path: "/price/:symbol",
	request: {
		params: z.object({
			symbol: z.string().min(1).max(10),
		}),
		query: z.object({
			timeframe: TimeframeSchema.default("1h"),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						symbol: z.string(),
						timeframe: z.string(),
						timestamp: z.string(),
						indicators: PriceIndicatorsSchema,
					}),
				},
			},
			description: "Price-based technical indicators",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(priceIndicatorsRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const { timeframe } = c.req.valid("query");
	const upperSymbol = symbol.toUpperCase();

	try {
		const service = await getIndicatorService();
		const priceIndicators = await service.getPriceIndicators(upperSymbol);

		return c.json(
			{
				symbol: upperSymbol,
				timeframe,
				timestamp: new Date().toISOString(),
				indicators: priceIndicators,
			},
			200
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to get price indicators for ${upperSymbol}: ${message}`,
		});
	}
});

// ============================================
// Legacy Simple Indicators Endpoint
// (Backward compatible shape for existing frontend)
// ============================================

const LegacyIndicatorsSchema = z.object({
	symbol: z.string(),
	timeframe: z.string(),
	rsi14: z.number().nullable(),
	atr14: z.number().nullable(),
	sma20: z.number().nullable(),
	sma50: z.number().nullable(),
	sma200: z.number().nullable(),
	ema12: z.number().nullable(),
	ema26: z.number().nullable(),
	macdLine: z.number().nullable(),
	macdSignal: z.number().nullable(),
	macdHist: z.number().nullable(),
});

const legacyIndicatorsRoute = createRoute({
	method: "get",
	path: "/indicators/:symbol",
	request: {
		params: z.object({
			symbol: z.string(),
		}),
		query: z.object({
			timeframe: TimeframeSchema.default("1h"),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: LegacyIndicatorsSchema } },
			description: "Technical indicators (legacy format)",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Market data service unavailable",
		},
	},
	tags: ["Market"],
});

app.openapi(legacyIndicatorsRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const { timeframe } = c.req.valid("query");
	const upperSymbol = symbol.toUpperCase();

	try {
		const service = await getIndicatorService();
		const price = await service.getPriceIndicators(upperSymbol);

		// Map to legacy format expected by existing frontend
		return c.json(
			{
				symbol: upperSymbol,
				timeframe,
				rsi14: price.rsi_14,
				atr14: price.atr_14,
				sma20: price.sma_20,
				sma50: price.sma_50,
				sma200: price.sma_200,
				ema12: price.ema_12,
				ema26: price.ema_26,
				macdLine: price.macd_line,
				macdSignal: price.macd_signal,
				macdHist: price.macd_histogram,
			},
			200
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to calculate indicators for ${upperSymbol}: ${message}`,
		});
	}
});

export default app;
