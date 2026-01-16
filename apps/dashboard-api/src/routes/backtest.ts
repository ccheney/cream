/**
 * Backtest API Routes
 *
 * Routes for running and viewing backtests.
 * Data is persisted in PostgreSQL database via BacktestsRepository.
 *
 * Data Sources:
 * - Backtest execution: NautilusTrader (event-driven) or VectorBT (fast scan)
 * - Historical data: Massive REST aggregates
 * - Results storage: PostgreSQL database
 *
 * @see docs/plans/ui/05-api-endpoints.md Backtest section
 * @see docs/plans/12-backtest.md Full backtest specification
 */

import { createContext, type ExecutionContext } from "@cream/domain";
import type { Backtest, BacktestEquityPoint, BacktestTrade } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getBacktestsRepo } from "../db.js";
import log from "../logger.js";
import { cleanupBacktestData, prepareAllBacktestData } from "../services/backtest-data.js";
import { executeBacktest } from "../services/backtest-executor.js";
import { broadcastToBacktest } from "../websocket/handler.js";

// ============================================
// Background Execution
// ============================================

/**
 * Run backtest execution in the background.
 * This is fire-and-forget - errors are logged but not propagated.
 */
async function runBacktestInBackground(
	backtest: Backtest,
	repo: Awaited<ReturnType<typeof getBacktestsRepo>>
): Promise<void> {
	// Create ExecutionContext at backtest boundary
	// Source is "backtest" to distinguish from unit tests or other BACKTEST uses
	// configId is the backtest ID for traceability
	const _ctx: ExecutionContext = createContext("BACKTEST", "backtest", backtest.id);

	let dataPaths: Awaited<ReturnType<typeof prepareAllBacktestData>> | null = null;

	log.info(
		{
			backtestId: backtest.id,
			universe: backtest.universe,
			startDate: backtest.startDate,
			endDate: backtest.endDate,
		},
		"Starting backtest execution"
	);

	try {
		// Prepare data files (OHLCV and signals)
		log.debug({ backtestId: backtest.id }, "Preparing backtest data");
		dataPaths = await prepareAllBacktestData(backtest);
		log.debug({ backtestId: backtest.id, dataPaths }, "Backtest data prepared");

		// Execute backtest with WebSocket broadcasting
		await executeBacktest(
			{
				backtestId: backtest.id,
				dataPath: dataPaths.dataPath,
				signalsPath: dataPaths.signalsPath,
				initialCapital: backtest.initialCapital,
				slippageBps: (backtest.config?.slippageBps as number) ?? 5,
				symbol: backtest.universe[0] ?? "PORTFOLIO",
			},
			repo,
			(backtestId, message) => {
				broadcastToBacktest(backtestId, message as Parameters<typeof broadcastToBacktest>[1]);
			}
		);
	} catch (error) {
		// Log the error for debugging
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error(
			{
				backtestId: backtest.id,
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Backtest failed"
		);

		// Ensure database is updated with failure
		try {
			await repo.fail(backtest.id, errorMessage);
		} catch {}
	} finally {
		// Clean up temp files
		if (dataPaths) {
			cleanupBacktestData(dataPaths).catch(() => {
				// Ignore cleanup errors
			});
		}
	}
}

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const BacktestMetricsSchema = z.object({
	finalNav: z.number(),
	totalReturn: z.number(),
	totalReturnPct: z.number(),
	sharpeRatio: z.number(),
	sortinoRatio: z.number(),
	maxDrawdown: z.number(),
	maxDrawdownPct: z.number(),
	winRate: z.number(),
	profitFactor: z.number(),
	totalTrades: z.number(),
	avgTradeDuration: z.number(),
	bestTrade: z.object({ symbol: z.string(), pnl: z.number() }),
	worstTrade: z.object({ symbol: z.string(), pnl: z.number() }),
});

const BacktestStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

const BacktestSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	initialCapital: z.number(),
	status: BacktestStatusSchema,
	metrics: BacktestMetricsSchema.nullable(),
	createdAt: z.string(),
});

const BacktestTradeSchema = z.object({
	id: z.string(),
	timestamp: z.string(),
	symbol: z.string(),
	action: z.enum(["BUY", "SELL"]),
	side: z.enum(["LONG", "SHORT"]),
	qty: z.number(),
	price: z.number(),
	pnl: z.number().nullable(),
	cumulativePnl: z.number(),
});

const EquityPointSchema = z.object({
	timestamp: z.string(),
	nav: z.number(),
	drawdown: z.number(),
	drawdownPct: z.number(),
});

const CreateBacktestSchema = z.object({
	name: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	initialCapital: z.number(),
	description: z.string().optional(),
	universe: z.array(z.string()).optional(),
	config: z.record(z.string(), z.unknown()).optional(),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Mappers
// ============================================

/**
 * Map storage Backtest to API BacktestSummary
 */
function mapBacktestToSummary(backtest: Backtest): z.infer<typeof BacktestSummarySchema> {
	// Extract best and worst trade from metrics if available
	const additionalMetrics = backtest.metrics as Record<string, unknown> | undefined;
	const bestTrade = (additionalMetrics?.bestTrade as { symbol: string; pnl: number }) ?? {
		symbol: "",
		pnl: 0,
	};
	const worstTrade = (additionalMetrics?.worstTrade as { symbol: string; pnl: number }) ?? {
		symbol: "",
		pnl: 0,
	};
	const avgTradeDuration = (additionalMetrics?.avgTradeDuration as number) ?? 0;

	// Calculate finalNav and totalReturnPct from totalReturn
	const finalNav = backtest.initialCapital + (backtest.totalReturn ?? 0);
	const totalReturnPct =
		backtest.initialCapital > 0 ? ((backtest.totalReturn ?? 0) / backtest.initialCapital) * 100 : 0;

	// Status mapping (filter cancelled to failed for API)
	let status: z.infer<typeof BacktestStatusSchema> = backtest.status as z.infer<
		typeof BacktestStatusSchema
	>;
	if (backtest.status === "cancelled") {
		status = "failed";
	}

	return {
		id: backtest.id,
		name: backtest.name,
		startDate: backtest.startDate,
		endDate: backtest.endDate,
		initialCapital: backtest.initialCapital,
		status,
		metrics:
			backtest.status === "completed"
				? {
						finalNav,
						totalReturn: backtest.totalReturn ?? 0,
						totalReturnPct,
						sharpeRatio: backtest.sharpeRatio ?? 0,
						sortinoRatio: backtest.sortinoRatio ?? 0,
						maxDrawdown: backtest.maxDrawdown ?? 0,
						maxDrawdownPct: backtest.maxDrawdown
							? (backtest.maxDrawdown / backtest.initialCapital) * 100
							: 0,
						winRate: backtest.winRate ?? 0,
						profitFactor: backtest.profitFactor ?? 0,
						totalTrades: backtest.totalTrades ?? 0,
						avgTradeDuration,
						bestTrade,
						worstTrade,
					}
				: null,
		createdAt: backtest.createdAt,
	};
}

/**
 * Map storage BacktestTrade to API trade format
 */
function mapTradeToApi(
	trade: BacktestTrade,
	cumulativePnl: number
): z.infer<typeof BacktestTradeSchema> {
	// Map action to simplified BUY/SELL
	const action: "BUY" | "SELL" =
		trade.action === "BUY" || trade.action === "COVER" ? "BUY" : "SELL";

	// Determine side from action
	const side: "LONG" | "SHORT" =
		trade.action === "BUY" || trade.action === "SELL" ? "LONG" : "SHORT";

	return {
		id: String(trade.id),
		timestamp: trade.timestamp,
		symbol: trade.symbol,
		action,
		side,
		qty: trade.quantity,
		price: trade.price,
		pnl: trade.pnl,
		cumulativePnl,
	};
}

/**
 * Map storage BacktestEquityPoint to API format
 */
function mapEquityToApi(point: BacktestEquityPoint): z.infer<typeof EquityPointSchema> {
	return {
		timestamp: point.timestamp,
		nav: point.nav,
		drawdown: point.drawdown ?? 0,
		drawdownPct: point.drawdownPct ?? 0,
	};
}

// ============================================
// Routes
// ============================================

// GET / - List backtests
const listRoute = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(BacktestSummarySchema),
				},
			},
			description: "List of backtests",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(listRoute, async (c) => {
	try {
		const repo = await getBacktestsRepo();
		const backtests = await repo.findRecent(100);
		const summaries = backtests.map(mapBacktestToSummary);
		return c.json(summaries, 200);
	} catch (error) {
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to list backtests",
		});
	}
});

// POST / - Create backtest
const createBacktestRoute = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: {
				"application/json": {
					schema: CreateBacktestSchema,
				},
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": {
					schema: BacktestSummarySchema,
				},
			},
			description: "Created backtest",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(createBacktestRoute, async (c) => {
	try {
		const body = c.req.valid("json");
		const repo = await getBacktestsRepo();

		// Generate unique ID
		const id = `bt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

		const backtest = await repo.create({
			id,
			name: body.name,
			description: body.description ?? null,
			startDate: body.startDate,
			endDate: body.endDate,
			initialCapital: body.initialCapital,
			universe: body.universe,
			config: body.config,
		});

		// Fire-and-forget backtest execution
		// Prepare data and run backtest in background, don't await
		runBacktestInBackground(backtest, repo).catch(() => {
			// Errors are logged inside the function, we just prevent unhandled rejection
		});

		return c.json(mapBacktestToSummary(backtest), 201);
	} catch (error) {
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to create backtest",
		});
	}
});

// GET /:id - Get backtest
const getRoute = createRoute({
	method: "get",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: BacktestSummarySchema,
				},
			},
			description: "Backtest details",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Backtest not found",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(getRoute, async (c) => {
	try {
		const { id } = c.req.valid("param");
		const repo = await getBacktestsRepo();
		const backtest = await repo.findById(id);

		if (!backtest) {
			throw new HTTPException(404, { message: `Backtest not found: ${id}` });
		}

		return c.json(mapBacktestToSummary(backtest), 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to get backtest",
		});
	}
});

// GET /:id/trades - Get backtest trades
const tradesRoute = createRoute({
	method: "get",
	path: "/:id/trades",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(BacktestTradeSchema),
				},
			},
			description: "Backtest trades",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Backtest not found",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(tradesRoute, async (c) => {
	try {
		const { id } = c.req.valid("param");
		const repo = await getBacktestsRepo();

		// Verify backtest exists
		const backtest = await repo.findById(id);
		if (!backtest) {
			throw new HTTPException(404, { message: `Backtest not found: ${id}` });
		}

		const trades = await repo.getTrades(id);

		// Calculate cumulative P/L as we map
		let cumulativePnl = 0;
		const mappedTrades = trades.map((trade) => {
			cumulativePnl += trade.pnl ?? 0;
			return mapTradeToApi(trade, cumulativePnl);
		});

		return c.json(mappedTrades, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to get backtest trades",
		});
	}
});

// GET /:id/equity - Get equity curve
const equityRoute = createRoute({
	method: "get",
	path: "/:id/equity",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(EquityPointSchema),
				},
			},
			description: "Equity curve",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Backtest not found",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(equityRoute, async (c) => {
	try {
		const { id } = c.req.valid("param");
		const repo = await getBacktestsRepo();

		// Verify backtest exists
		const backtest = await repo.findById(id);
		if (!backtest) {
			throw new HTTPException(404, { message: `Backtest not found: ${id}` });
		}

		const equity = await repo.getEquityCurve(id);
		const mappedEquity = equity.map(mapEquityToApi);

		return c.json(mappedEquity, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to get equity curve",
		});
	}
});

// DELETE /:id - Delete backtest
const deleteRoute = createRoute({
	method: "delete",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		204: {
			description: "Backtest deleted",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Backtest not found",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Internal server error",
		},
	},
	tags: ["Backtest"],
});

app.openapi(deleteRoute, async (c) => {
	try {
		const { id } = c.req.valid("param");
		const repo = await getBacktestsRepo();

		const deleted = await repo.delete(id);
		if (!deleted) {
			throw new HTTPException(404, { message: `Backtest not found: ${id}` });
		}

		return c.body(null, 204);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: error instanceof Error ? error.message : "Failed to delete backtest",
		});
	}
});

// ============================================
// Export
// ============================================

export const backtestRoutes = app;
export default backtestRoutes;
