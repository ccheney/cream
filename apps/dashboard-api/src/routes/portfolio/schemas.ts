import { z } from "@hono/zod-openapi";

export const PortfolioSummarySchema = z.object({
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

export const PositionSchema = z.object({
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

export const OptionsPositionSchema = z.object({
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

export const EquityPointSchema = z.object({
	timestamp: z.string(),
	nav: z.number(),
	drawdown: z.number(),
	drawdownPct: z.number(),
});

export const PeriodMetricsSchema = z.object({
	return: z.number(),
	returnPct: z.number(),
	trades: z.number(),
	winRate: z.number(),
});

export const PerformanceMetricsSchema = z.object({
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

export const ClosePositionRequestSchema = z.object({
	marketOrder: z.boolean().optional().default(true),
	limitPrice: z.number().optional(),
});

export const AccountStatusSchema = z.enum([
	"ACTIVE",
	"SUBMITTED",
	"APPROVAL_PENDING",
	"APPROVED",
	"REJECTED",
	"CLOSED",
	"DISABLED",
]);

export const AccountSchema = z.object({
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

export const PortfolioHistoryTimeframeSchema = z.enum(["1Min", "5Min", "15Min", "1H", "1D"]);

export const PortfolioHistoryPeriodSchema = z.enum(["1D", "1W", "1M", "3M", "1A", "all"]);

export const AlpacaPortfolioHistorySchema = z.object({
	timestamp: z.array(z.number()),
	equity: z.array(z.number()),
	profitLoss: z.array(z.number()),
	profitLossPct: z.array(z.number()),
	timeframe: PortfolioHistoryTimeframeSchema,
	baseValue: z.number(),
});

export const OrderSchema = z.object({
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

export const OrdersQuerySchema = z.object({
	status: z.enum(["open", "closed", "all"]).optional().default("all"),
	limit: z.coerce.number().min(1).max(500).optional().default(100),
	direction: z.enum(["asc", "desc"]).optional().default("desc"),
	symbols: z.string().optional(),
	side: z.enum(["buy", "sell"]).optional(),
	nested: z.coerce.boolean().optional(),
});

export const OrdersResponseSchema = z.object({
	orders: z.array(OrderSchema),
	count: z.number(),
});

export const ClosedTradeSchema = z.object({
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

export const ClosedTradesQuerySchema = z.object({
	symbol: z.string().optional(),
	limit: z.coerce.number().min(1).max(500).optional().default(100),
	offset: z.coerce.number().min(0).optional().default(0),
});

export const ClosedTradesResponseSchema = z.object({
	trades: z.array(ClosedTradeSchema),
	count: z.number(),
	totalRealizedPnl: z.number(),
	winCount: z.number(),
	lossCount: z.number(),
	winRate: z.number(),
});
