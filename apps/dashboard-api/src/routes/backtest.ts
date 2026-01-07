/**
 * Backtest API Routes
 *
 * Routes for running and viewing backtests.
 * Returns real data from backtesting engine or error responses - NO mock data.
 *
 * Data Sources:
 * - Backtest execution: NautilusTrader (event-driven) or VectorBT (fast scan)
 * - Historical data: Massive REST aggregates
 * - Results storage: Turso database
 *
 * @see docs/plans/ui/05-api-endpoints.md Backtest section
 * @see docs/plans/12-backtest.md Full backtest specification
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

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Service Availability Check
// ============================================

/**
 * Stub function - backtest endpoints not yet implemented.
 *
 * Required integrations:
 * - NautilusTrader or VectorBT Python service for backtest execution
 * - Turso tables for backtest metadata, trades, and equity curves
 * - Job queue (Bull/BullMQ) for async backtest runs
 * - WebSocket updates for progress streaming
 *
 * @see bead: cream-hurbx (Backtest Dashboard API: NautilusTrader Integration)
 */
function requireBacktestService(): never {
  throw new HTTPException(503, {
    message:
      "Backtest endpoints not yet implemented. Requires: NautilusTrader/VectorBT + Turso storage integration.",
  });
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(listRoute, () => {
  requireBacktestService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(createBacktestRoute, () => {
  requireBacktestService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(getRoute, () => {
  requireBacktestService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(tradesRoute, () => {
  requireBacktestService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(equityRoute, () => {
  requireBacktestService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Backtest service unavailable",
    },
  },
  tags: ["Backtest"],
});

app.openapi(deleteRoute, () => {
  requireBacktestService();
});

// ============================================
// Export
// ============================================

export const backtestRoutes = app;
export default backtestRoutes;
