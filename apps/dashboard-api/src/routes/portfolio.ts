/**
 * Portfolio Routes
 *
 * Endpoints for portfolio summary, positions, and performance metrics.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { calculateReturns, calculateSharpe, calculateSortino } from "@cream/metrics";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  getDecisionsRepo,
  getOrdersRepo,
  getPortfolioSnapshotsRepo,
  getPositionsRepo,
} from "../db.js";
import { portfolioService } from "../services/portfolio.js";
import { systemState } from "./system.js";

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
  currentPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  unrealizedPnl: z.number().nullable(),
  unrealizedPnlPct: z.number().nullable(),
  thesisId: z.string().nullable(),
  daysHeld: z.number(),
  openedAt: z.string(),
});

const OptionsPositionSchema = z.object({
  contractSymbol: z.string(),
  underlying: z.string(),
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
    ytd: PeriodMetricsSchema,
    total: PeriodMetricsSchema,
  }),
  sharpeRatio: z.number(),
  sortinoRatio: z.number(),
  maxDrawdown: z.number(),
  maxDrawdownPct: z.number(),
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

  const summary = await positionsRepo.getPortfolioSummary(systemState.environment);
  const latestSnapshot = await snapshotsRepo.getLatest(systemState.environment);

  // Calculate today's P&L from snapshots
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(todayStart);
  yesterdayEnd.setSeconds(-1);

  const yesterdaySnapshot = await snapshotsRepo.findByDate(
    systemState.environment,
    yesterdayEnd.toISOString().split("T")[0] ?? ""
  );

  const todayPnl =
    latestSnapshot && yesterdaySnapshot ? latestSnapshot.nav - yesterdaySnapshot.nav : 0;

  const todayPnlPct = yesterdaySnapshot?.nav ? (todayPnl / yesterdaySnapshot.nav) * 100 : 0;

  // Get first snapshot for total P&L calculation
  const firstSnapshot = await snapshotsRepo.getFirst(systemState.environment);
  const totalPnl = latestSnapshot && firstSnapshot ? latestSnapshot.nav - firstSnapshot.nav : 0;

  const totalPnlPct = firstSnapshot?.nav ? (totalPnl / firstSnapshot.nav) * 100 : 0;

  // Calculate net exposure from positions (long value - short value)
  const positions = await positionsRepo.findMany({
    environment: systemState.environment,
    status: "open",
  });
  const longValue = positions.data
    .filter((p) => p.side === "LONG")
    .reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const shortValue = positions.data
    .filter((p) => p.side === "SHORT")
    .reduce((sum, p) => sum + Math.abs(p.marketValue ?? 0), 0);
  const netExposure = longValue - shortValue;

  return c.json({
    nav: latestSnapshot?.nav ?? 100000,
    cash: latestSnapshot?.cash ?? 100000,
    equity: summary.totalMarketValue,
    buyingPower: (latestSnapshot?.cash ?? 100000) * 4, // Assuming 4x margin
    grossExposure: summary.totalMarketValue,
    netExposure,
    positionCount: summary.totalPositions,
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
    environment: systemState.environment,
    status: "open",
  });

  return c.json(
    result.data.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      qty: p.quantity,
      avgEntry: p.avgEntryPrice,
      currentPrice: p.currentPrice,
      marketValue: p.marketValue,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPnlPct: p.unrealizedPnlPct,
      thesisId: p.thesisId,
      daysHeld: calculateDaysHeld(p.openedAt),
      openedAt: p.openedAt,
    }))
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

// GET /api/portfolio/history
const historyRoute = createRoute({
  method: "get",
  path: "/history",
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

app.openapi(historyRoute, async (c) => {
  const query = c.req.valid("query");
  const repo = await getPortfolioSnapshotsRepo();

  const snapshots = await repo.findMany(
    {
      environment: systemState.environment,
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
    { environment: systemState.environment },
    { page: 1, pageSize: 1000 }
  );

  // Get executed decisions for trade statistics (kept for potential future use)
  const _decisions = await decisionsRepo.findMany(
    { status: "executed" },
    { page: 1, pageSize: 1000 }
  );

  // Get filled orders for P&L calculations
  const orders = await ordersRepo.findMany(
    { status: "filled", environment: systemState.environment },
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

  const ytdStart = new Date(now.getFullYear(), 0, 1);

  // Calculate P&L from filled orders (BUY is entry, SELL is exit)
  // Group orders by symbol to calculate realized P&L per trade
  interface TradePnL {
    pnl: number;
    timestamp: string;
  }
  const tradePnLs: TradePnL[] = [];
  const positionCosts = new Map<string, { qty: number; avgCost: number }>();

  // Process orders chronologically to track position costs
  const sortedOrders = [...orders.data].sort(
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

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;

  for (const s of snapshots.data) {
    peak = Math.max(peak, s.nav);
    const drawdown = peak - s.nav;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

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

  return c.json({
    periods: {
      today: calcPeriodMetrics(todayStart),
      week: calcPeriodMetrics(weekStart),
      month: calcPeriodMetrics(monthStart),
      ytd: calcPeriodMetrics(ytdStart),
      total: calcPeriodMetrics(new Date(0)),
    },
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    maxDrawdownPct,
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
    return c.json({ error: "Position not found" }, 404);
  }

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

  return c.json({
    orderId: order.id,
    message: `Close order submitted for ${position.symbol}`,
  });
});

export default app;
