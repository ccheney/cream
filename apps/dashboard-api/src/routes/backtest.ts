/**
 * Backtest API Routes
 *
 * Routes for running and viewing backtests.
 *
 * @see docs/plans/ui/05-api-endpoints.md Backtest section
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

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
});

// ============================================
// In-Memory Store (replace with DB)
// ============================================

const backtests = new Map<string, z.infer<typeof BacktestSummarySchema>>();
const backtestTrades = new Map<string, z.infer<typeof BacktestTradeSchema>[]>();

// Seed with some sample backtests
function seedBacktests() {
  const sample1: z.infer<typeof BacktestSummarySchema> = {
    id: "bt-001",
    name: "Q4 2025 Momentum Strategy",
    startDate: "2025-10-01",
    endDate: "2025-12-31",
    initialCapital: 100000,
    status: "completed",
    metrics: {
      finalNav: 112500,
      totalReturn: 12500,
      totalReturnPct: 12.5,
      sharpeRatio: 1.85,
      sortinoRatio: 2.1,
      maxDrawdown: 5000,
      maxDrawdownPct: 4.5,
      winRate: 0.62,
      profitFactor: 1.8,
      totalTrades: 48,
      avgTradeDuration: 3.5,
      bestTrade: { symbol: "NVDA", pnl: 3200 },
      worstTrade: { symbol: "META", pnl: -1500 },
    },
    createdAt: "2026-01-05T10:00:00Z",
  };

  const sample2: z.infer<typeof BacktestSummarySchema> = {
    id: "bt-002",
    name: "Mean Reversion Test",
    startDate: "2025-11-01",
    endDate: "2025-12-31",
    initialCapital: 50000,
    status: "completed",
    metrics: {
      finalNav: 52300,
      totalReturn: 2300,
      totalReturnPct: 4.6,
      sharpeRatio: 1.2,
      sortinoRatio: 1.4,
      maxDrawdown: 2500,
      maxDrawdownPct: 4.8,
      winRate: 0.55,
      profitFactor: 1.3,
      totalTrades: 32,
      avgTradeDuration: 2.1,
      bestTrade: { symbol: "AAPL", pnl: 1200 },
      worstTrade: { symbol: "TSLA", pnl: -800 },
    },
    createdAt: "2026-01-04T14:30:00Z",
  };

  backtests.set(sample1.id, sample1);
  backtests.set(sample2.id, sample2);
}

seedBacktests();

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
  },
  tags: ["Backtest"],
});

app.openapi(listRoute, (c) => {
  const list = Array.from(backtests.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return c.json(list);
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
  },
  tags: ["Backtest"],
});

app.openapi(createBacktestRoute, (c) => {
  const { name, startDate, endDate, initialCapital } = c.req.valid("json");

  const id = `bt-${String(backtests.size + 1).padStart(3, "0")}`;
  const backtest: z.infer<typeof BacktestSummarySchema> = {
    id,
    name,
    startDate,
    endDate,
    initialCapital,
    status: "pending",
    metrics: null,
    createdAt: new Date().toISOString(),
  };

  backtests.set(id, backtest);

  // Simulate running the backtest after a delay
  setTimeout(() => {
    const bt = backtests.get(id);
    if (bt) {
      bt.status = "running";
      setTimeout(() => {
        bt.status = "completed";
        bt.metrics = {
          finalNav: initialCapital * (1 + Math.random() * 0.2 - 0.05),
          totalReturn: initialCapital * (Math.random() * 0.2 - 0.05),
          totalReturnPct: Math.random() * 20 - 5,
          sharpeRatio: 0.5 + Math.random() * 2,
          sortinoRatio: 0.6 + Math.random() * 2.5,
          maxDrawdown: initialCapital * Math.random() * 0.1,
          maxDrawdownPct: Math.random() * 10,
          winRate: 0.4 + Math.random() * 0.3,
          profitFactor: 0.8 + Math.random() * 1.5,
          totalTrades: Math.floor(10 + Math.random() * 90),
          avgTradeDuration: 1 + Math.random() * 5,
          bestTrade: { symbol: "NVDA", pnl: Math.random() * 5000 },
          worstTrade: { symbol: "TSLA", pnl: -Math.random() * 3000 },
        };
      }, 3000);
    }
  }, 1000);

  return c.json(backtest, 201);
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
      description: "Backtest not found",
    },
  },
  tags: ["Backtest"],
});

app.openapi(getRoute, (c) => {
  const { id } = c.req.valid("param");
  const backtest = backtests.get(id);

  if (!backtest) {
    throw new HTTPException(404, { message: "Backtest not found" });
  }

  return c.json(backtest);
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
      description: "Backtest not found",
    },
  },
  tags: ["Backtest"],
});

app.openapi(tradesRoute, (c) => {
  const { id } = c.req.valid("param");
  const backtest = backtests.get(id);

  if (!backtest) {
    throw new HTTPException(404, { message: "Backtest not found" });
  }

  // Generate mock trades if not already created
  if (!backtestTrades.has(id)) {
    const trades: z.infer<typeof BacktestTradeSchema>[] = [];
    const symbols = ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN"];
    const startTime = new Date(backtest.startDate).getTime();
    const endTime = new Date(backtest.endDate).getTime();
    let cumulativePnl = 0;

    for (let i = 0; i < (backtest.metrics?.totalTrades ?? 20); i++) {
      const pnl = i > 0 ? (Math.random() - 0.45) * 1000 : null;
      if (pnl !== null) {
        cumulativePnl += pnl;
      }

      const symbolIndex = Math.floor(Math.random() * symbols.length);
      trades.push({
        id: `trade-${i}`,
        timestamp: new Date(startTime + Math.random() * (endTime - startTime)).toISOString(),
        symbol: symbols[symbolIndex] ?? "AAPL",
        action: i % 2 === 0 ? "BUY" : "SELL",
        side: Math.random() > 0.3 ? "LONG" : "SHORT",
        qty: Math.floor(10 + Math.random() * 90),
        price: 100 + Math.random() * 400,
        pnl,
        cumulativePnl,
      });
    }

    trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    backtestTrades.set(id, trades);
  }

  return c.json(backtestTrades.get(id) ?? []);
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
      description: "Backtest not found",
    },
  },
  tags: ["Backtest"],
});

app.openapi(equityRoute, (c) => {
  const { id } = c.req.valid("param");
  const backtest = backtests.get(id);

  if (!backtest) {
    throw new HTTPException(404, { message: "Backtest not found" });
  }

  const startTime = new Date(backtest.startDate).getTime();
  const endTime = new Date(backtest.endDate).getTime();
  const days = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));

  const equity: z.infer<typeof EquityPointSchema>[] = [];
  let nav = backtest.initialCapital;
  let peak = nav;

  for (let i = 0; i <= days; i++) {
    const change = (Math.random() - 0.48) * nav * 0.02;
    nav += change;
    peak = Math.max(peak, nav);
    const drawdown = peak - nav;

    equity.push({
      timestamp: new Date(startTime + i * 24 * 60 * 60 * 1000).toISOString(),
      nav: Math.round(nav * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
      drawdownPct: Math.round((drawdown / peak) * 10000) / 100,
    });
  }

  return c.json(equity);
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
      description: "Backtest not found",
    },
  },
  tags: ["Backtest"],
});

app.openapi(deleteRoute, (c) => {
  const { id } = c.req.valid("param");

  if (!backtests.has(id)) {
    throw new HTTPException(404, { message: "Backtest not found" });
  }

  backtests.delete(id);
  backtestTrades.delete(id);

  return c.body(null, 204);
});

// ============================================
// Export
// ============================================

export const backtestRoutes = app;
export default backtestRoutes;
