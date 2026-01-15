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
	type PortfolioHistory as BrokerPortfolioHistory,
	type Position as BrokerPosition,
	createAlpacaClient,
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
				"Calculated Day P&L from Alpaca positions"
			);
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca positions for Day P&L, falling back to snapshots"
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
			yesterdayEnd.toISOString().split("T")[0] ?? ""
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
		.filter((p) => p.side === "LONG")
		.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
	const shortValue = positions.data
		.filter((p) => p.side === "SHORT")
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
	const repo = await getPositionsRepo();
	const result = await repo.findMany({
		environment: getCurrentEnvironment(),
		status: "open",
	});

	// Fetch Alpaca positions for lastdayPrice when available
	let alpacaPositionMap = new Map<string, { lastdayPrice: number; currentPrice: number }>();

	if (isAlpacaConfigured()) {
		try {
			const client = getBrokerClient();
			const alpacaPositions = await client.getPositions();
			alpacaPositionMap = new Map(
				alpacaPositions.map((ap) => [
					ap.symbol,
					{ lastdayPrice: ap.lastdayPrice, currentPrice: ap.currentPrice },
				])
			);
			log.debug(
				{ positionCount: alpacaPositions.length },
				"Fetched Alpaca positions for lastdayPrice"
			);
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch Alpaca positions, lastdayPrice will be null"
			);
		}
	}

	return c.json(
		result.data.map((p) => {
			const alpacaData = alpacaPositionMap.get(p.symbol);
			const currentPrice = alpacaData?.currentPrice ?? p.currentPrice ?? 0;
			const marketValue = p.marketValue ?? currentPrice * p.quantity;
			return {
				id: p.id,
				symbol: p.symbol,
				side: p.side,
				qty: p.quantity,
				avgEntry: p.avgEntryPrice,
				currentPrice,
				lastdayPrice: alpacaData?.lastdayPrice ?? null,
				marketValue,
				unrealizedPnl: p.unrealizedPnl ?? 0,
				unrealizedPnlPct: p.unrealizedPnlPct ?? 0,
				thesisId: p.thesisId,
				daysHeld: calculateDaysHeld(p.openedAt),
				openedAt: p.openedAt,
			};
		})
	);
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
	const repo = await getPositionsRepo();

	const position = await repo.findById(id);
	if (!position) {
		return c.json({ error: "Position not found" }, 404);
	}

	return c.json({
		id: position.id,
		symbol: position.symbol,
		side: position.side,
		qty: position.quantity,
		avgEntry: position.avgEntryPrice,
		currentPrice: position.currentPrice,
		marketValue: position.marketValue,
		unrealizedPnl: position.unrealizedPnl,
		unrealizedPnlPct: position.unrealizedPnlPct,
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
		{ page: 1, pageSize: query.limit }
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
		})
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
		{ page: 1, pageSize: days + 1 }
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
		})
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
	const [snapshotsRepo, decisionsRepo, ordersRepo] = await Promise.all([
		getPortfolioSnapshotsRepo(),
		getDecisionsRepo(),
		getOrdersRepo(),
	]);

	// Get all snapshots for calculations
	const snapshots = await snapshotsRepo.findMany(
		{ environment: getCurrentEnvironment() },
		{ page: 1, pageSize: 1000 }
	);

	// Get executed decisions for trade statistics (kept for potential future use)
	const _decisions = await decisionsRepo.findMany(
		{ status: "executed" },
		{ page: 1, pageSize: 1000 }
	);

	// Get filled orders for P&L calculations
	const orders = await ordersRepo.findMany(
		{ status: "filled", environment: getCurrentEnvironment() },
		{ page: 1, pageSize: 1000 }
	);

	// Calculate period boundaries
	const now = new Date();
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);

	const weekStart = new Date(now);
	weekStart.setDate(weekStart.getDate() - 7);

	const monthStart = new Date(now);
	monthStart.setMonth(monthStart.getMonth() - 1);

	const threeMonthStart = new Date(now);
	threeMonthStart.setMonth(threeMonthStart.getMonth() - 3);

	const ytdStart = new Date(now.getFullYear(), 0, 1);

	const oneYearStart = new Date(now);
	oneYearStart.setFullYear(oneYearStart.getFullYear() - 1);

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
			new Date(a.filledAt ?? a.createdAt).getTime() - new Date(b.filledAt ?? b.createdAt).getTime()
	);

	for (const order of sortedOrders) {
		const symbol = order.symbol;
		const qty = order.filledQuantity ?? order.quantity;
		const price = order.avgFillPrice ?? order.limitPrice ?? 0;

		if (order.side === "BUY") {
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
		} else if (order.side === "SELL") {
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

	// Helper to calculate period metrics with P&L data
	const calcPeriodMetrics = (
		startDate: Date
	): {
		return: number;
		returnPct: number;
		trades: number;
		winRate: number;
	} => {
		const periodSnapshots = snapshots.data.filter((s) => new Date(s.timestamp) >= startDate);

		const firstNav = periodSnapshots[0]?.nav ?? 100000;
		const lastNav = periodSnapshots[periodSnapshots.length - 1]?.nav ?? firstNav;
		const periodReturn = lastNav - firstNav;
		const returnPct = firstNav > 0 ? (periodReturn / firstNav) * 100 : 0;

		// Filter trades in this period
		const periodTrades = tradePnLs.filter((t) => new Date(t.timestamp) >= startDate);
		const periodWins = periodTrades.filter((t) => t.pnl > 0).length;
		const trades = periodTrades.length;
		const winRate = trades > 0 ? (periodWins / trades) * 100 : 0;

		return { return: periodReturn, returnPct, trades, winRate };
	};

	// Calculate max drawdown and current drawdown
	let peak = 0;
	let maxDrawdown = 0;
	let currentDrawdown = 0;

	for (const s of snapshots.data) {
		peak = Math.max(peak, s.nav);
		const drawdown = peak - s.nav;
		maxDrawdown = Math.max(maxDrawdown, drawdown);
		currentDrawdown = drawdown; // Last value is current
	}

	const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
	const currentDrawdownPct = peak > 0 ? (currentDrawdown / peak) * 100 : 0;

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
	// Extract NAV values and calculate daily returns
	const navValues = snapshots.data.map((s) => s.nav);
	const dailyReturns = calculateReturns(navValues);

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
			today: calcPeriodMetrics(todayStart),
			week: calcPeriodMetrics(weekStart),
			month: calcPeriodMetrics(monthStart),
			threeMonth: calcPeriodMetrics(threeMonthStart),
			ytd: calcPeriodMetrics(ytdStart),
			oneYear: calcPeriodMetrics(oneYearStart),
			total: calcPeriodMetrics(new Date(0)),
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
		"Closing position"
	);

	try {
		// Create a close order
		const orderId = crypto.randomUUID();
		const order = await ordersRepo.create({
			id: orderId,
			decisionId: null,
			symbol: position.symbol,
			side: position.side === "LONG" ? "SELL" : "BUY",
			quantity: position.quantity,
			orderType: body.marketOrder ? "MARKET" : "LIMIT",
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
			"Failed to create close order"
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
			"Fetched Alpaca account"
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
			}
		);

		// Cache the response
		setCache(cacheKey, history);

		log.debug(
			{ period, timeframe, points: history.timestamp?.length ?? 0 },
			"Fetched Alpaca portfolio history"
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

export default app;
