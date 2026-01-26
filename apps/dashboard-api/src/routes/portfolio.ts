/**
 * Portfolio Routes
 *
 * Endpoints for portfolio summary, positions, and performance metrics.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import {
	type AlpacaClient,
	type Account as BrokerAccount,
	type Order as BrokerOrder,
	type PortfolioHistory as BrokerPortfolioHistory,
	type Position as BrokerPosition,
	createAlpacaClient,
	type GetOrdersOptions,
	getPortfolioHistory,
	PortfolioHistoryError,
	type PortfolioHistoryPeriod,
	type PortfolioHistoryTimeframe,
} from "@cream/broker";
import { calculateReturns, calculateSharpe, calculateSortino } from "@cream/metrics";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
	getDecisionsRepo,
	getOrdersRepo,
	getPortfolioSnapshotsRepo,
	getPositionsRepo,
} from "../db.js";
import log from "../logger.js";
import { portfolioService } from "../services/portfolio.js";
import { getCurrentEnvironment } from "./system.js";

// ============================================
// Alpaca Trading Client (singleton)
// ============================================

let brokerClient: AlpacaClient | null = null;

// ============================================
// Portfolio History Cache
// ============================================

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const historyCache = new Map<string, CacheEntry<unknown>>();
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
	const entry = historyCache.get(key);
	if (!entry) {
		return null;
	}
	if (Date.now() > entry.expiresAt) {
		historyCache.delete(key);
		return null;
	}
	return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
	historyCache.set(key, {
		data,
		expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
	});
}

function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}

function getBrokerClient(): AlpacaClient {
	if (brokerClient) {
		return brokerClient;
	}

	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Trading service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
		});
	}

	try {
		// Safe to assert: isAlpacaConfigured() check above guarantees these exist
		const apiKey = Bun.env.ALPACA_KEY as string;
		const apiSecret = Bun.env.ALPACA_SECRET as string;

		brokerClient = createAlpacaClient({
			apiKey,
			apiSecret,
			environment: getCurrentEnvironment(),
		});
		return brokerClient;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Trading service unavailable: ${message}`,
		});
	}
}

// ============================================
// Schemas
// ============================================

const PortfolioSummarySchema = z.object({
	nav: z.number(),
	cash: z.number(),
	equity: z.number(),
	buyingPower: z.number(),
	grossExposure: z.number(),
	netExposure: z.number(),
	positionCount: z.number(),
	todayPnl: z.number(),
	todayPnlPct: z.number(),
	totalPnl: z.number(),
	totalPnlPct: z.number(),
	lastUpdated: z.string(),
});

const PositionSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	side: z.enum(["LONG", "SHORT"]),
	qty: z.number(),
	avgEntry: z.number(),
	currentPrice: z.number(),
	lastdayPrice: z.number().nullable(),
	marketValue: z.number(),
	unrealizedPnl: z.number(),
	unrealizedPnlPct: z.number(),
	thesisId: z.string().nullable(),
	daysHeld: z.number(),
	openedAt: z.string(),
});

const OptionsPositionSchema = z.object({
	contractSymbol: z.string(),
	underlying: z.string(),
	underlyingPrice: z.number(),
	expiration: z.string(),
	strike: z.number(),
	right: z.enum(["CALL", "PUT"]),
	quantity: z.number(),
	avgCost: z.number(),
	currentPrice: z.number(),
	marketValue: z.number(),
	unrealizedPnl: z.number(),
	unrealizedPnlPct: z.number(),
	greeks: z
		.object({
			delta: z.number(),
			gamma: z.number(),
			theta: z.number(),
			vega: z.number(),
		})
		.optional(),
});

const EquityPointSchema = z.object({
	timestamp: z.string(),
	nav: z.number(),
	drawdown: z.number(),
	drawdownPct: z.number(),
});

const PeriodMetricsSchema = z.object({
	return: z.number(),
	returnPct: z.number(),
	trades: z.number(),
	winRate: z.number(),
});

const PerformanceMetricsSchema = z.object({
	periods: z.object({
		today: PeriodMetricsSchema,
		week: PeriodMetricsSchema,
		month: PeriodMetricsSchema,
		threeMonth: PeriodMetricsSchema,
		ytd: PeriodMetricsSchema,
		oneYear: PeriodMetricsSchema,
		total: PeriodMetricsSchema,
	}),
	volatility: z.object({
		daily: z.number(),
		annualized: z.number(),
	}),
	sharpeRatio: z.number(),
	sortinoRatio: z.number(),
	maxDrawdown: z.number(),
	maxDrawdownPct: z.number(),
	currentDrawdown: z.number(),
	currentDrawdownPct: z.number(),
	winRate: z.number(),
	profitFactor: z.number(),
	avgWin: z.number(),
	avgLoss: z.number(),
	totalTrades: z.number(),
});

const ClosePositionRequestSchema = z.object({
	marketOrder: z.boolean().optional().default(true),
	limitPrice: z.number().optional(),
});

const AccountStatusSchema = z.enum([
	"ACTIVE",
	"SUBMITTED",
	"APPROVAL_PENDING",
	"APPROVED",
	"REJECTED",
	"CLOSED",
	"DISABLED",
]);

const AccountSchema = z.object({
	id: z.string(),
	status: AccountStatusSchema,
	currency: z.string(),
	cash: z.number(),
	portfolioValue: z.number(),
	buyingPower: z.number(),
	regtBuyingPower: z.number(),
	daytradingBuyingPower: z.number(),
	daytradeCount: z.number(),
	patternDayTrader: z.boolean(),
	tradingBlocked: z.boolean(),
	transfersBlocked: z.boolean(),
	accountBlocked: z.boolean(),
	shortingEnabled: z.boolean(),
	longMarketValue: z.number(),
	shortMarketValue: z.number(),
	equity: z.number(),
	lastEquity: z.number(),
	multiplier: z.number(),
	initialMargin: z.number(),
	maintenanceMargin: z.number(),
	sma: z.number(),
	createdAt: z.string(),
});

const PortfolioHistoryTimeframeSchema = z.enum(["1Min", "5Min", "15Min", "1H", "1D"]);

const PortfolioHistoryPeriodSchema = z.enum(["1D", "1W", "1M", "3M", "1A", "all"]);

const AlpacaPortfolioHistorySchema = z.object({
	timestamp: z.array(z.number()),
	equity: z.array(z.number()),
	profitLoss: z.array(z.number()),
	profitLossPct: z.array(z.number()),
	timeframe: PortfolioHistoryTimeframeSchema,
	baseValue: z.number(),
});

const OrderSchema = z.object({
	id: z.string(),
	clientOrderId: z.string(),
	symbol: z.string(),
	qty: z.number(),
	filledQty: z.number(),
	side: z.enum(["buy", "sell"]),
	type: z.enum(["market", "limit", "stop", "stop_limit", "trailing_stop"]),
	timeInForce: z.enum(["day", "gtc", "opg", "cls", "ioc", "fok"]),
	status: z.string(),
	limitPrice: z.number().nullable().optional(),
	stopPrice: z.number().nullable().optional(),
	filledAvgPrice: z.number().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	submittedAt: z.string().nullable().optional(),
	filledAt: z.string().nullable().optional(),
});

const OrdersQuerySchema = z.object({
	status: z.enum(["open", "closed", "all"]).optional().default("all"),
	limit: z.coerce.number().min(1).max(500).optional().default(100),
	direction: z.enum(["asc", "desc"]).optional().default("desc"),
	symbols: z.string().optional(),
	side: z.enum(["buy", "sell"]).optional(),
	nested: z.coerce.boolean().optional(),
});

const OrdersResponseSchema = z.object({
	orders: z.array(OrderSchema),
	count: z.number(),
});

const ClosedTradeSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	side: z.enum(["LONG", "SHORT"]),
	quantity: z.number(),
	entryPrice: z.number(),
	exitPrice: z.number(),
	entryDate: z.string(),
	exitDate: z.string(),
	holdDays: z.number(),
	realizedPnl: z.number(),
	realizedPnlPct: z.number(),
	entryOrderId: z.string().nullable(),
	exitOrderId: z.string(),
});

const ClosedTradesQuerySchema = z.object({
	symbol: z.string().optional(),
	limit: z.coerce.number().min(1).max(500).optional().default(100),
	offset: z.coerce.number().min(0).optional().default(0),
});

const ClosedTradesResponseSchema = z.object({
	trades: z.array(ClosedTradeSchema),
	count: z.number(),
	totalRealizedPnl: z.number(),
	winCount: z.number(),
	lossCount: z.number(),
	winRate: z.number(),
});

// ============================================
// Helpers
// ============================================

function calculateDaysHeld(openedAt: string): number {
	const opened = new Date(openedAt);
	const now = new Date();
	const diffMs = now.getTime() - opened.getTime();
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/portfolio/summary
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

app.openapi(summaryRoute, async (c) => {
	const [positionsRepo, snapshotsRepo] = await Promise.all([
		getPositionsRepo(),
		getPortfolioSnapshotsRepo(),
	]);

	const summary = await positionsRepo.getPortfolioSummary(getCurrentEnvironment());
	const latestSnapshot = await snapshotsRepo.getLatest(getCurrentEnvironment());

	// Calculate today's P&L
	// When Alpaca is configured, use real-time positions with lastdayPrice for accurate intraday P&L
	// Otherwise, fall back to NAV-based snapshot comparison
	let todayPnl = 0;
	let todayPnlPct = 0;
	let alpacaAccount: BrokerAccount | null = null;
	let alpacaPositions: BrokerPosition[] = [];

	if (isAlpacaConfigured()) {
		try {
			const client = getBrokerClient();
			[alpacaAccount, alpacaPositions] = await Promise.all([
				client.getAccount(),
				client.getPositions(),
			]);

			// Calculate Day P&L using lastdayPrice from Alpaca positions
			// Formula: sum of (currentPrice - lastdayPrice) * qty for each position
			todayPnl = alpacaPositions.reduce((sum, pos) => {
				const dayChange = (pos.currentPrice - pos.lastdayPrice) * pos.qty;
				return sum + dayChange;
			}, 0);

			// Calculate Day P&L percentage based on yesterday's portfolio value
			const yesterdayValue = alpacaAccount.lastEquity;
			todayPnlPct = yesterdayValue > 0 ? (todayPnl / yesterdayValue) * 100 : 0;

			log.debug(
				{ todayPnl, todayPnlPct, positionCount: alpacaPositions.length },
				"Calculated Day P&L from Alpaca positions",
			);
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca positions for Day P&L, falling back to snapshots",
			);
			// Fall back to snapshot-based calculation below
		}
	}

	// Fall back to NAV-based calculation if Alpaca data not available
	if (todayPnl === 0 && latestSnapshot) {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const yesterdayEnd = new Date(todayStart);
		yesterdayEnd.setSeconds(-1);

		const yesterdaySnapshot = await snapshotsRepo.findByDate(
			getCurrentEnvironment(),
			yesterdayEnd.toISOString().split("T")[0] ?? "",
		);

		todayPnl = yesterdaySnapshot ? latestSnapshot.nav - yesterdaySnapshot.nav : 0;
		todayPnlPct = yesterdaySnapshot?.nav ? (todayPnl / yesterdaySnapshot.nav) * 100 : 0;
	}

	// Get first snapshot for total P&L calculation
	const firstSnapshot = await snapshotsRepo.getFirst(getCurrentEnvironment());
	const totalPnl = latestSnapshot && firstSnapshot ? latestSnapshot.nav - firstSnapshot.nav : 0;

	const totalPnlPct = firstSnapshot?.nav ? (totalPnl / firstSnapshot.nav) * 100 : 0;

	// Calculate net exposure from positions (long value - short value)
	const positions = await positionsRepo.findMany({
		environment: getCurrentEnvironment(),
		status: "open",
	});
	const longValue = positions.data
		.filter((p) => p.side === "long")
		.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
	const shortValue = positions.data
		.filter((p) => p.side === "short")
		.reduce((sum, p) => sum + Math.abs(p.marketValue ?? 0), 0);
	const netExposure = longValue - shortValue;

	// Use Alpaca account data when available for more accurate values
	const nav = alpacaAccount?.portfolioValue ?? latestSnapshot?.nav ?? 100000;
	const cash = alpacaAccount?.cash ?? latestSnapshot?.cash ?? 100000;
	const buyingPower = alpacaAccount?.buyingPower ?? (latestSnapshot?.cash ?? 100000) * 4;
	const positionCount =
		alpacaPositions.length > 0 ? alpacaPositions.length : summary.totalPositions;

	return c.json({
		nav,
		cash,
		equity: alpacaAccount?.equity ?? summary.totalMarketValue,
		buyingPower,
		grossExposure: summary.totalMarketValue,
		netExposure,
		positionCount,
		todayPnl,
		todayPnlPct,
		totalPnl,
		totalPnlPct,
		lastUpdated: latestSnapshot?.timestamp ?? new Date().toISOString(),
	});
});

// GET /api/portfolio/options
const optionsRoute = createRoute({
	method: "get",
	path: "/options",
	responses: {
		200: {
			content: { "application/json": { schema: z.array(OptionsPositionSchema) } },
			description: "Options positions",
		},
	},
	tags: ["Portfolio"],
});

app.openapi(optionsRoute, async (c) => {
	const options = await portfolioService.getOptionsPositions();
	return c.json(options);
});

// GET /api/portfolio/positions
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

app.openapi(positionsRoute, async (c) => {
	// Primary source: Alpaca positions (real-time, authoritative)
	// Secondary source: DB positions (for metadata like thesisId, openedAt)
	if (!isAlpacaConfigured()) {
		// Fall back to DB-only if Alpaca not configured
		const repo = await getPositionsRepo();
		const result = await repo.findMany({
			environment: getCurrentEnvironment(),
			status: "open",
		});
		return c.json(
			result.data.map((p) => ({
				id: p.id,
				symbol: p.symbol,
				side: p.side === "long" ? "LONG" : "SHORT",
				qty: p.quantity,
				avgEntry: p.avgEntryPrice,
				currentPrice: p.currentPrice ?? 0,
				lastdayPrice: null,
				marketValue: p.marketValue ?? (p.currentPrice ?? 0) * p.quantity,
				unrealizedPnl: p.unrealizedPnl ?? 0,
				unrealizedPnlPct: p.unrealizedPnlPct ?? 0,
				thesisId: p.thesisId,
				daysHeld: calculateDaysHeld(p.openedAt),
				openedAt: p.openedAt,
			})),
		);
	}

	try {
		const client = getBrokerClient();
		const alpacaPositions = await client.getPositions();

		// Fetch DB positions for metadata enrichment (thesisId, openedAt, etc)
		const repo = await getPositionsRepo();
		const dbResult = await repo.findMany({
			environment: getCurrentEnvironment(),
			status: "open",
		});
		const dbPositionMap = new Map(dbResult.data.map((p) => [p.symbol, p]));

		log.debug(
			{ alpacaCount: alpacaPositions.length, dbCount: dbResult.data.length },
			"Fetched positions from Alpaca and DB",
		);

		return c.json(
			alpacaPositions.map((ap) => {
				const dbPosition = dbPositionMap.get(ap.symbol);
				return {
					// Use DB id if available, otherwise generate from symbol
					id: dbPosition?.id ?? `alpaca-${ap.symbol}`,
					symbol: ap.symbol,
					side: ap.side === "long" ? "LONG" : "SHORT",
					qty: ap.qty,
					avgEntry: ap.avgEntryPrice,
					currentPrice: ap.currentPrice,
					lastdayPrice: ap.lastdayPrice,
					marketValue: ap.marketValue,
					unrealizedPnl: ap.unrealizedPl,
					unrealizedPnlPct: ap.unrealizedPlpc * 100, // Convert from decimal to percentage
					// Metadata from DB if available
					thesisId: dbPosition?.thesisId ?? null,
					daysHeld: dbPosition ? calculateDaysHeld(dbPosition.openedAt) : 0,
					openedAt: dbPosition?.openedAt ?? new Date().toISOString(),
				};
			}),
		);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch Alpaca positions",
		);
		// Fall back to DB-only on error
		const repo = await getPositionsRepo();
		const result = await repo.findMany({
			environment: getCurrentEnvironment(),
			status: "open",
		});
		return c.json(
			result.data.map((p) => ({
				id: p.id,
				symbol: p.symbol,
				side: p.side === "long" ? "LONG" : "SHORT",
				qty: p.quantity,
				avgEntry: p.avgEntryPrice,
				currentPrice: p.currentPrice ?? 0,
				lastdayPrice: null,
				marketValue: p.marketValue ?? (p.currentPrice ?? 0) * p.quantity,
				unrealizedPnl: p.unrealizedPnl ?? 0,
				unrealizedPnlPct: p.unrealizedPnlPct ?? 0,
				thesisId: p.thesisId,
				daysHeld: calculateDaysHeld(p.openedAt),
				openedAt: p.openedAt,
			})),
		);
	}
});

// GET /api/portfolio/positions/:id
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

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(positionDetailRoute, async (c) => {
	const { id } = c.req.valid("param");
	const [repo, decisionsRepo] = await Promise.all([getPositionsRepo(), getDecisionsRepo()]);

	const position = await repo.findById(id);
	if (!position) {
		return c.json({ error: "Position not found" }, 404);
	}

	// Fetch stop/target from linked decision if available
	let stop: number | null = null;
	let target: number | null = null;

	if (position.decisionId) {
		const decision = await decisionsRepo.findById(position.decisionId);
		if (decision) {
			stop = decision.stopPrice;
			target = decision.targetPrice;
		}
	}

	return c.json({
		id: position.id,
		symbol: position.symbol,
		side: position.side === "long" ? "LONG" : "SHORT",
		qty: position.quantity,
		avgEntry: position.avgEntryPrice,
		currentPrice: position.currentPrice,
		lastdayPrice: null,
		marketValue: position.marketValue,
		unrealizedPnl: position.unrealizedPnl,
		unrealizedPnlPct: position.unrealizedPnlPct,
		stop,
		target,
		thesisId: position.thesisId,
		daysHeld: calculateDaysHeld(position.openedAt),
		openedAt: position.openedAt,
	});
});

// GET /api/portfolio/equity-curve (internal snapshots)
const equityCurveRoute = createRoute({
	method: "get",
	path: "/equity-curve",
	request: {
		query: z.object({
			from: z.string().optional(),
			to: z.string().optional(),
			limit: z.coerce.number().min(1).max(1000).default(100),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(EquityPointSchema) } },
			description: "Equity curve history",
		},
	},
	tags: ["Portfolio"],
});

app.openapi(equityCurveRoute, async (c) => {
	const query = c.req.valid("query");
	const repo = await getPortfolioSnapshotsRepo();

	const snapshots = await repo.findMany(
		{
			environment: getCurrentEnvironment(),
			fromDate: query.from,
			toDate: query.to,
		},
		{ page: 1, pageSize: query.limit },
	);

	// Calculate peak NAV for drawdown calculation
	let peak = 0;

	return c.json(
		snapshots.data.map((s) => {
			peak = Math.max(peak, s.nav);
			const drawdown = peak - s.nav;
			const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;

			return {
				timestamp: s.timestamp,
				nav: s.nav,
				drawdown,
				drawdownPct,
			};
		}),
	);
});

// GET /api/portfolio/equity
const equityRoute = createRoute({
	method: "get",
	path: "/equity",
	request: {
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(EquityPointSchema) } },
			description: "Equity curve for specified number of days",
		},
	},
	tags: ["Portfolio"],
});

app.openapi(equityRoute, async (c) => {
	const { days } = c.req.valid("query");
	const repo = await getPortfolioSnapshotsRepo();

	const fromDate = new Date();
	fromDate.setDate(fromDate.getDate() - days);

	const snapshots = await repo.findMany(
		{
			environment: getCurrentEnvironment(),
			fromDate: fromDate.toISOString().split("T")[0],
		},
		{ page: 1, pageSize: days + 1 },
	);

	// Calculate peak NAV for drawdown calculation
	let peak = 0;

	return c.json(
		snapshots.data.map((s) => {
			peak = Math.max(peak, s.nav);
			const drawdown = peak - s.nav;
			const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;

			return {
				timestamp: s.timestamp,
				nav: s.nav,
				drawdown,
				drawdownPct,
			};
		}),
	);
});

// GET /api/portfolio/performance
const performanceRoute = createRoute({
	method: "get",
	path: "/performance",
	responses: {
		200: {
			content: { "application/json": { schema: PerformanceMetricsSchema } },
			description: "Performance metrics",
		},
	},
	tags: ["Portfolio"],
});

app.openapi(performanceRoute, async (c) => {
	const [decisionsRepo, ordersRepo] = await Promise.all([getDecisionsRepo(), getOrdersRepo()]);

	// Get executed decisions for trade statistics (kept for potential future use)
	const _decisions = await decisionsRepo.findMany(
		{ status: "executed" },
		{ limit: 1000, offset: 0 },
	);

	// Get filled orders for P&L calculations
	const orders = await ordersRepo.findMany(
		{ status: "filled", environment: getCurrentEnvironment() },
		{ limit: 1000, offset: 0 },
	);

	// Calculate P&L from filled orders (BUY is entry, SELL is exit)
	// Group orders by symbol to calculate realized P&L per trade
	interface TradePnL {
		pnl: number;
		timestamp: string;
	}
	const tradePnLs: TradePnL[] = [];
	const positionCosts = new Map<string, { qty: number; avgCost: number }>();

	// Process orders chronologically to track position costs
	const sortedOrders = orders.data.toSorted(
		(a, b) =>
			new Date(a.filledAt ?? a.createdAt).getTime() - new Date(b.filledAt ?? b.createdAt).getTime(),
	);

	for (const order of sortedOrders) {
		const symbol = order.symbol;
		const qty = order.filledQuantity ?? order.quantity;
		const price = order.avgFillPrice ?? order.limitPrice ?? 0;

		if (order.side === "buy") {
			// Opening or adding to position
			const existing = positionCosts.get(symbol);
			if (existing) {
				// Average in
				const newQty = existing.qty + qty;
				const newCost = (existing.qty * existing.avgCost + qty * price) / newQty;
				positionCosts.set(symbol, { qty: newQty, avgCost: newCost });
			} else {
				positionCosts.set(symbol, { qty, avgCost: price });
			}
		} else if (order.side === "sell") {
			// Closing position - calculate P&L
			const existing = positionCosts.get(symbol);
			if (existing && existing.qty > 0) {
				const sellQty = Math.min(qty, existing.qty);
				const pnl = sellQty * (price - existing.avgCost);
				tradePnLs.push({ pnl, timestamp: order.filledAt ?? order.createdAt });

				// Update remaining position
				const remainingQty = existing.qty - sellQty;
				if (remainingQty > 0) {
					positionCosts.set(symbol, { qty: remainingQty, avgCost: existing.avgCost });
				} else {
					positionCosts.delete(symbol);
				}
			}
		}
	}

	// Calculate period metrics from Alpaca portfolio history
	interface PeriodMetrics {
		return: number;
		returnPct: number;
		trades: number;
		winRate: number;
	}
	const defaultMetrics: PeriodMetrics = { return: 0, returnPct: 0, trades: 0, winRate: 0 };

	// Helper to calculate trade stats for a period
	const calcTradeStats = (startDate: Date) => {
		const periodTrades = tradePnLs.filter((t) => new Date(t.timestamp) >= startDate);
		const periodWins = periodTrades.filter((t) => t.pnl > 0).length;
		const trades = periodTrades.length;
		const winRate = trades > 0 ? (periodWins / trades) * 100 : 0;
		return { trades, winRate };
	};

	// Fetch Alpaca portfolio history for each period
	let periodMetrics = {
		today: { ...defaultMetrics },
		week: { ...defaultMetrics },
		month: { ...defaultMetrics },
		threeMonth: { ...defaultMetrics },
		ytd: { ...defaultMetrics },
		oneYear: { ...defaultMetrics },
		total: { ...defaultMetrics },
	};

	let equityHistory: number[] = [];

	if (isAlpacaConfigured()) {
		try {
			const apiKey = Bun.env.ALPACA_KEY as string;
			const apiSecret = Bun.env.ALPACA_SECRET as string;
			const config = { apiKey, apiSecret, environment: getCurrentEnvironment() };

			// Fetch current account for real-time equity
			const client = getBrokerClient();
			const currentAccount = await client.getAccount();
			const currentEquity = currentAccount.equity;

			// Helper to fetch history with error logging
			const fetchHistory = async (
				period: "1D" | "1W" | "1M" | "3M" | "1A" | "all",
				timeframe: "1H" | "1D",
				dateStart?: string,
			) => {
				try {
					const result = await getPortfolioHistory(config, {
						period,
						timeframe,
						...(dateStart && { dateStart }),
					});
					log.debug(
						{
							period,
							dateStart,
							dataPoints: result.equity?.length ?? 0,
							baseValue: result.baseValue,
						},
						"Fetched portfolio history",
					);
					return result;
				} catch (error) {
					log.warn(
						{ period, error: error instanceof Error ? error.message : String(error) },
						"Failed to fetch portfolio history for period",
					);
					return null;
				}
			};

			// Calculate start of current calendar week (Monday at midnight)
			const getWeekStartDate = (): string => {
				const now = new Date();
				const day = now.getDay();
				const diff = day === 0 ? 6 : day - 1; // Sunday = 6 days back, otherwise day - 1
				const monday = new Date(now);
				monday.setDate(now.getDate() - diff);
				monday.setHours(0, 0, 0, 0);
				// ISO string always contains "T", so split will always have index 0
				return monday.toISOString().slice(0, 10);
			};

			const weekStartDate = getWeekStartDate();

			// Fetch history for different periods in parallel
			// Note: weekHistory uses calendar week (Monday start) via dateStart parameter
			const [_dayHistory, weekHistory, monthHistory, threeMonthHistory, ytdHistory, allHistory] =
				await Promise.all([
					fetchHistory("1D", "1H"),
					fetchHistory("1W", "1D", weekStartDate),
					fetchHistory("1M", "1D"),
					fetchHistory("3M", "1D"),
					fetchHistory("1A", "1D"),
					fetchHistory("all", "1D"),
				]);

			// Helper to calculate returns using CURRENT equity vs historical base value
			// Uses the FIRST equity value in the history array for reliability
			// (Alpaca's baseValue can be inconsistent for new accounts)
			// fallbackBase is used when period-specific history has invalid data (e.g., 0)
			const calcReturns = (
				history: BrokerPortfolioHistory | null,
				overrideBase?: number,
				fallbackBase?: number,
			): { return: number; returnPct: number } => {
				if (!history && !overrideBase && !fallbackBase) {
					log.debug("No history data available");
					return { return: 0, returnPct: 0 };
				}

				// Use override base if provided, otherwise use first equity value from history
				// This is more reliable than baseValue for periods that may be incomplete
				let baseValue = overrideBase;
				if (!baseValue && history) {
					// Use the first equity value in the array (start of period)
					const historyBase = history.equity?.[0] ?? history.baseValue ?? 0;
					// Only use history base if it's valid (non-zero)
					// Alpaca can return 0 for the first equity value in period-specific queries for new accounts
					baseValue = historyBase > 0 ? historyBase : undefined;
				}
				// Fall back to allHistory base if period-specific base is invalid
				if (!baseValue && fallbackBase && fallbackBase > 0) {
					baseValue = fallbackBase;
				}

				if (!baseValue || baseValue === 0) {
					log.debug("Base value is 0 or undefined");
					return { return: 0, returnPct: 0 };
				}

				// Use CURRENT account equity instead of last historical point
				// This includes today's unrealized P&L
				const periodReturn = currentEquity - baseValue;
				const returnPct = (currentEquity / baseValue - 1) * 100;

				log.debug(
					{ baseValue, currentEquity, periodReturn, returnPct },
					"Calculated period return using current equity",
				);

				return { return: periodReturn, returnPct };
			};

			// For Today, use lastEquity from account (most reliable for intraday)
			const lastEquity = currentAccount.lastEquity;

			// Calculate period boundaries for trade stats
			const now = new Date();
			const todayStart = new Date(now);
			todayStart.setHours(0, 0, 0, 0);
			// Use calendar week (Monday start) for consistency with weekHistory
			const weekStart = new Date(weekStartDate);
			const monthStart = new Date(now);
			monthStart.setMonth(monthStart.getMonth() - 1);
			const threeMonthStart = new Date(now);
			threeMonthStart.setMonth(threeMonthStart.getMonth() - 3);
			const ytdStart = new Date(now.getFullYear(), 0, 1);
			const oneYearStart = new Date(now);
			oneYearStart.setFullYear(oneYearStart.getFullYear() - 1);

			// Get fallback base from allHistory (first valid non-zero equity value)
			// This is used when period-specific queries return invalid data for new accounts
			const fallbackBase = allHistory?.equity?.find((e) => e > 0) ?? allHistory?.baseValue ?? 0;

			// Calculate Today's return using lastEquity (previous market close)
			// Fall back to allHistory base if lastEquity is unavailable
			const todayBase = lastEquity > 0 ? lastEquity : fallbackBase;
			const todayReturn = todayBase > 0 ? currentEquity - todayBase : 0;
			const todayReturnPct = todayBase > 0 ? (currentEquity / todayBase - 1) * 100 : 0;
			const todayReturns = { return: todayReturn, returnPct: todayReturnPct };
			const weekReturns = calcReturns(weekHistory, undefined, fallbackBase);
			const monthReturns = calcReturns(monthHistory, undefined, fallbackBase);
			const threeMonthReturns = calcReturns(threeMonthHistory, undefined, fallbackBase);
			const ytdReturns = calcReturns(ytdHistory, undefined, fallbackBase);
			const allReturns = calcReturns(allHistory, undefined, fallbackBase);

			periodMetrics = {
				today: { ...todayReturns, ...calcTradeStats(todayStart) },
				week: { ...weekReturns, ...calcTradeStats(weekStart) },
				month: { ...monthReturns, ...calcTradeStats(monthStart) },
				threeMonth: { ...threeMonthReturns, ...calcTradeStats(threeMonthStart) },
				ytd: { ...ytdReturns, ...calcTradeStats(ytdStart) },
				oneYear: { ...allReturns, ...calcTradeStats(oneYearStart) }, // Use all history for 1Y
				total: { ...allReturns, ...calcTradeStats(new Date(0)) },
			};

			// Use the longest history for volatility/drawdown calculations
			// Include current equity to capture today's changes
			equityHistory = [...(allHistory?.equity ?? monthHistory?.equity ?? [])];
			if (currentEquity > 0) {
				equityHistory.push(currentEquity);
			}

			log.debug(
				{
					todayReturn: periodMetrics.today.return,
					weekReturn: periodMetrics.week.return,
					monthReturn: periodMetrics.month.return,
				},
				"Calculated period returns from Alpaca history",
			);
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca portfolio history for performance metrics",
			);
		}
	}

	// Calculate max drawdown and current drawdown from equity history
	// IMPORTANT: Include current real-time equity to capture intraday drawdowns
	let peak = 0;
	let maxDrawdown = 0;
	let currentDrawdown = 0;

	// First, find historical peak from recorded equity
	for (const equity of equityHistory) {
		peak = Math.max(peak, equity);
		const drawdown = peak - equity;
		maxDrawdown = Math.max(maxDrawdown, drawdown);
	}

	// Now calculate current drawdown using REAL-TIME equity (includes today's unrealized P&L)
	// We need to fetch current equity if we're in the Alpaca-configured block
	let currentEquityForDD = equityHistory[equityHistory.length - 1] ?? 0;
	if (isAlpacaConfigured()) {
		try {
			const client = getBrokerClient();
			const account = await client.getAccount();
			currentEquityForDD = account.equity;
			// Update peak if current equity is higher than historical peak
			peak = Math.max(peak, currentEquityForDD);
			// Update max drawdown if current drawdown is worse
			const currentDD = peak - currentEquityForDD;
			maxDrawdown = Math.max(maxDrawdown, currentDD);
			currentDrawdown = currentDD;
			log.debug(
				{ peak, currentEquity: currentEquityForDD, currentDrawdown, maxDrawdown },
				"Calculated drawdown with real-time equity",
			);
		} catch {
			// Fall back to last historical equity
			currentDrawdown = peak > 0 ? peak - currentEquityForDD : 0;
		}
	} else {
		currentDrawdown = peak > 0 ? peak - currentEquityForDD : 0;
	}

	// Express drawdowns as negative percentages (e.g., -1.17% not 1.17%)
	const maxDrawdownPct = peak > 0 ? -(maxDrawdown / peak) * 100 : 0;
	const currentDrawdownPct = peak > 0 ? -(currentDrawdown / peak) * 100 : 0;

	// Calculate overall win/loss statistics from trade P&Ls
	const wins = tradePnLs.filter((t) => t.pnl > 0);
	const losses = tradePnLs.filter((t) => t.pnl < 0);

	const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
	const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

	const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
	const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
	const winRate = tradePnLs.length > 0 ? (wins.length / tradePnLs.length) * 100 : 0;
	const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

	// Calculate Sharpe and Sortino from daily returns
	const dailyReturns = calculateReturns(equityHistory);

	// Use daily config (252 trading days per year)
	const dailyConfig = {
		riskFreeRate: 0.05, // 5% annual risk-free rate
		targetReturn: 0,
		periodsPerYear: 252, // Daily data
	};

	const sharpeRatio =
		dailyReturns.length >= 2 ? (calculateSharpe(dailyReturns, dailyConfig) ?? 0) : 0;
	const sortinoRatio =
		dailyReturns.length >= 2 ? (calculateSortino(dailyReturns, dailyConfig) ?? 0) : 0;

	// Calculate volatility (standard deviation of daily returns)
	let dailyVolatility = 0;
	if (dailyReturns.length >= 2) {
		const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
		const squaredDiffs = dailyReturns.map((r) => (r - mean) ** 2);
		const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (dailyReturns.length - 1);
		dailyVolatility = Math.sqrt(variance);
	}
	const annualizedVolatility = dailyVolatility * Math.sqrt(252);

	return c.json({
		periods: {
			today: periodMetrics.today,
			week: periodMetrics.week,
			month: periodMetrics.month,
			threeMonth: periodMetrics.threeMonth,
			ytd: periodMetrics.ytd,
			oneYear: periodMetrics.oneYear,
			total: periodMetrics.total,
		},
		volatility: {
			daily: dailyVolatility,
			annualized: annualizedVolatility,
		},
		sharpeRatio,
		sortinoRatio,
		maxDrawdown,
		maxDrawdownPct,
		currentDrawdown,
		currentDrawdownPct,
		winRate,
		profitFactor,
		avgWin,
		avgLoss,
		totalTrades: tradePnLs.length,
	});
});

// POST /api/portfolio/positions/:id/close
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

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(closePositionRoute, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");

	const [positionsRepo, ordersRepo] = await Promise.all([getPositionsRepo(), getOrdersRepo()]);

	const position = await positionsRepo.findById(id);
	if (!position) {
		log.warn({ positionId: id }, "Close position request for non-existent position");
		return c.json({ error: "Position not found" }, 404);
	}

	log.info(
		{ positionId: id, symbol: position.symbol, quantity: position.quantity, side: position.side },
		"Closing position",
	);

	try {
		// Create a close order
		const order = await ordersRepo.create({
			decisionId: null,
			symbol: position.symbol,
			side: position.side === "long" ? "sell" : "buy",
			quantity: position.quantity,
			orderType: body.marketOrder ? "market" : "limit",
			limitPrice: body.limitPrice ?? null,
			environment: position.environment,
		});

		log.info({ positionId: id, orderId: order.id, symbol: position.symbol }, "Close order created");

		return c.json({
			orderId: order.id,
			message: `Close order submitted for ${position.symbol}`,
		});
	} catch (error) {
		log.error(
			{
				positionId: id,
				symbol: position.symbol,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to create close order",
		);
		throw error;
	}
});

// GET /api/portfolio/account
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

// GET /api/portfolio/history (Alpaca portfolio history)
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

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(historyRoute, async (c) => {
	const { period, timeframe, start, end } = c.req.valid("query");

	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Trading service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
		});
	}

	// Check cache first
	const cacheKey = `history:${getCurrentEnvironment()}:${period}:${timeframe}:${start ?? ""}:${end ?? ""}`;
	const cached = getCached<BrokerPortfolioHistory>(cacheKey);
	if (cached) {
		log.debug({ period, timeframe, cached: true }, "Returning cached portfolio history");
		return c.json(cached);
	}

	try {
		// Safe to assert: isAlpacaConfigured() check above guarantees these exist
		const apiKey = Bun.env.ALPACA_KEY as string;
		const apiSecret = Bun.env.ALPACA_SECRET as string;

		const history = await getPortfolioHistory(
			{
				apiKey,
				apiSecret,
				environment: getCurrentEnvironment(),
			},
			{
				period: period as PortfolioHistoryPeriod,
				timeframe: timeframe as PortfolioHistoryTimeframe,
				dateStart: start,
				dateEnd: end,
			},
		);

		// Cache the response
		setCache(cacheKey, history);

		log.debug(
			{ period, timeframe, points: history.timestamp?.length ?? 0 },
			"Fetched Alpaca portfolio history",
		);

		return c.json(history);
	} catch (error) {
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
});

// GET /api/portfolio/orders
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

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(ordersRoute, async (c) => {
	const query = c.req.valid("query");

	try {
		const client = getBrokerClient();

		const options: GetOrdersOptions = {
			status: query.status,
			limit: query.limit,
			direction: query.direction,
			nested: query.nested,
		};

		if (query.symbols) {
			options.symbols = query.symbols.split(",").map((s) => s.trim());
		}
		if (query.side) {
			options.side = query.side;
		}

		const orders = await client.getOrders(options);

		log.debug(
			{ status: query.status, count: orders.length, limit: query.limit },
			"Fetched orders from Alpaca",
		);

		const mappedOrders = orders.map((order: BrokerOrder) => ({
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
		}));

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

// GET /api/portfolio/closed-trades
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

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(closedTradesRoute, async (c) => {
	const query = c.req.valid("query");

	try {
		const ordersRepo = getOrdersRepo();

		// Get all filled orders from our database
		const { data: orders } = await ordersRepo.findMany({
			status: "filled",
			environment: getCurrentEnvironment(),
			symbol: query.symbol,
		});

		// Sort by filled date ascending for FIFO processing
		const sortedOrders = orders
			.filter((o): o is typeof o & { filledAt: string } => o.filledAt !== null)
			.toSorted((a, b) => new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime());

		// Group orders by symbol and process FIFO
		const symbolLots = new Map<string, FifoLot[]>();
		const closedTrades: ClosedTrade[] = [];

		for (const order of sortedOrders) {
			const symbol = order.symbol;
			const qty = order.filledQuantity > 0 ? order.filledQuantity : order.quantity;
			const price = order.avgFillPrice ?? 0;
			const date = order.filledAt;
			const orderId = order.brokerOrderId ?? order.id;

			if (!symbolLots.has(symbol)) {
				symbolLots.set(symbol, []);
			}
			let lots = symbolLots.get(symbol);
			if (!lots) {
				lots = [];
				symbolLots.set(symbol, lots);
			}

			if (order.side === "buy") {
				// Add to FIFO queue
				lots.push({
					orderId,
					date,
					price,
					remainingQty: qty,
				});
			} else {
				// Sell - match against FIFO lots
				let sellQtyRemaining = qty;

				while (sellQtyRemaining > 0 && lots.length > 0) {
					const lot = lots[0];
					if (!lot) {
						break;
					}

					const matchQty = Math.min(sellQtyRemaining, lot.remainingQty);

					// Calculate P&L for this matched portion
					const entryValue = matchQty * lot.price;
					const exitValue = matchQty * price;
					const realizedPnl = exitValue - entryValue;
					const realizedPnlPct = lot.price > 0 ? (realizedPnl / entryValue) * 100 : 0;

					// Calculate hold time
					const entryDate = new Date(lot.date);
					const exitDate = new Date(date);
					const holdDays = Math.max(
						0,
						Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)),
					);

					closedTrades.push({
						id: `${symbol}-${orderId}-${lot.orderId}`,
						symbol,
						side: "LONG",
						quantity: matchQty,
						entryPrice: lot.price,
						exitPrice: price,
						entryDate: lot.date,
						exitDate: date,
						holdDays,
						realizedPnl,
						realizedPnlPct,
						entryOrderId: lot.orderId,
						exitOrderId: orderId,
					});

					lot.remainingQty -= matchQty;
					sellQtyRemaining -= matchQty;

					// Remove exhausted lot
					if (lot.remainingQty <= 0) {
						lots.shift();
					}
				}
			}
		}

		// Sort by exit date descending (most recent first)
		closedTrades.sort((a, b) => new Date(b.exitDate).getTime() - new Date(a.exitDate).getTime());

		// Calculate summary stats
		const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
		const winCount = closedTrades.filter((t) => t.realizedPnl > 0).length;
		const lossCount = closedTrades.filter((t) => t.realizedPnl < 0).length;
		const totalTrades = winCount + lossCount;
		const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

		// Apply pagination
		const paginatedTrades = closedTrades.slice(query.offset, query.offset + query.limit);

		log.debug(
			{
				totalTrades: closedTrades.length,
				totalRealizedPnl,
				winRate,
				symbol: query.symbol,
			},
			"Computed closed trades with FIFO matching",
		);

		return c.json({
			trades: paginatedTrades,
			count: closedTrades.length,
			totalRealizedPnl,
			winCount,
			lossCount,
			winRate,
		});
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ error: message }, "Failed to compute closed trades");
		throw new HTTPException(503, { message: `Failed to compute closed trades: ${message}` });
	}
});

export default app;
