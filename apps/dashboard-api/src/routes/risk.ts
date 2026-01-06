/**
 * Risk API Routes
 *
 * Routes for exposure, Greeks, VaR, and risk limits.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const ExposureMetricsSchema = z.object({
  gross: z.object({
    current: z.number(),
    limit: z.number(),
    pct: z.number(),
  }),
  net: z.object({
    current: z.number(),
    limit: z.number(),
    pct: z.number(),
  }),
  long: z.number(),
  short: z.number(),
  concentrationMax: z.object({
    symbol: z.string(),
    pct: z.number(),
  }),
  sectorExposure: z.record(z.number()),
});

const PositionGreeksSchema = z.object({
  symbol: z.string(),
  delta: z.number(),
  gamma: z.number(),
  vega: z.number(),
  theta: z.number(),
});

const GreeksSummarySchema = z.object({
  delta: z.object({ current: z.number(), limit: z.number() }),
  gamma: z.object({ current: z.number(), limit: z.number() }),
  vega: z.object({ current: z.number(), limit: z.number() }),
  theta: z.object({ current: z.number(), limit: z.number() }),
  byPosition: z.array(PositionGreeksSchema),
});

const CorrelationMatrixSchema = z.object({
  symbols: z.array(z.string()),
  matrix: z.array(z.array(z.number())),
  highCorrelationPairs: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      correlation: z.number(),
    })
  ),
});

const VaRMetricsSchema = z.object({
  oneDay95: z.number(),
  oneDay99: z.number(),
  tenDay95: z.number(),
  method: z.enum(["historical", "parametric"]),
});

const LimitStatusSchema = z.object({
  name: z.string(),
  category: z.enum(["per_instrument", "portfolio", "options"]),
  current: z.number(),
  limit: z.number(),
  utilization: z.number(),
  status: z.enum(["ok", "warning", "critical"]),
});

// ============================================
// Routes
// ============================================

// GET /exposure - Exposure metrics
const exposureRoute = createRoute({
  method: "get",
  path: "/exposure",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ExposureMetricsSchema,
        },
      },
      description: "Exposure metrics",
    },
  },
  tags: ["Risk"],
});

app.openapi(exposureRoute, (c) => {
  const grossLimit = 200000;
  const netLimit = 100000;
  const long = 80000 + Math.random() * 40000;
  const short = 20000 + Math.random() * 20000;
  const gross = long + short;
  const net = long - short;

  return c.json({
    gross: {
      current: Math.round(gross),
      limit: grossLimit,
      pct: Math.round((gross / grossLimit) * 100) / 100,
    },
    net: {
      current: Math.round(net),
      limit: netLimit,
      pct: Math.round((net / netLimit) * 100) / 100,
    },
    long: Math.round(long),
    short: Math.round(short),
    concentrationMax: {
      symbol: "AAPL",
      pct: 0.08 + Math.random() * 0.07,
    },
    sectorExposure: {
      Technology: 0.35,
      Healthcare: 0.2,
      Financials: 0.15,
      "Consumer Discretionary": 0.12,
      Energy: 0.08,
      Other: 0.1,
    },
  });
});

// GET /greeks - Options Greeks summary
const greeksRoute = createRoute({
  method: "get",
  path: "/greeks",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: GreeksSummarySchema,
        },
      },
      description: "Greeks summary",
    },
  },
  tags: ["Risk"],
});

app.openapi(greeksRoute, (c) => {
  const positions = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"].map((symbol) => ({
    symbol,
    delta: (Math.random() - 0.5) * 100,
    gamma: Math.random() * 10,
    vega: Math.random() * 500,
    theta: -Math.random() * 100,
  }));

  const totals = positions.reduce(
    (acc, p) => ({
      delta: acc.delta + p.delta,
      gamma: acc.gamma + p.gamma,
      vega: acc.vega + p.vega,
      theta: acc.theta + p.theta,
    }),
    { delta: 0, gamma: 0, vega: 0, theta: 0 }
  );

  return c.json({
    delta: { current: Math.round(totals.delta * 100) / 100, limit: 100 },
    gamma: { current: Math.round(totals.gamma * 100) / 100, limit: 50 },
    vega: { current: Math.round(totals.vega * 100) / 100, limit: 1000 },
    theta: { current: Math.round(totals.theta * 100) / 100, limit: -500 },
    byPosition: positions.map((p) => ({
      symbol: p.symbol,
      delta: Math.round(p.delta * 100) / 100,
      gamma: Math.round(p.gamma * 100) / 100,
      vega: Math.round(p.vega * 100) / 100,
      theta: Math.round(p.theta * 100) / 100,
    })),
  });
});

// GET /correlation - Correlation matrix
const correlationRoute = createRoute({
  method: "get",
  path: "/correlation",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: CorrelationMatrixSchema,
        },
      },
      description: "Correlation matrix",
    },
  },
  tags: ["Risk"],
});

app.openapi(correlationRoute, (c) => {
  const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];
  const n = symbols.length;

  // Generate symmetric correlation matrix
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (i < j) {
        matrix[i][j] = Math.round((0.3 + Math.random() * 0.5) * 100) / 100;
        matrix[j][i] = matrix[i][j];
      }
    }
  }

  // Find high correlation pairs
  const highCorrelationPairs: { a: string; b: string; correlation: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] > 0.7) {
        highCorrelationPairs.push({
          a: symbols[i],
          b: symbols[j],
          correlation: matrix[i][j],
        });
      }
    }
  }

  return c.json({
    symbols,
    matrix,
    highCorrelationPairs,
  });
});

// GET /var - Value at Risk
const varRoute = createRoute({
  method: "get",
  path: "/var",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: VaRMetricsSchema,
        },
      },
      description: "VaR metrics",
    },
  },
  tags: ["Risk"],
});

app.openapi(varRoute, (c) => {
  const portfolioValue = 100000;
  return c.json({
    oneDay95: Math.round(portfolioValue * 0.015 * 100) / 100,
    oneDay99: Math.round(portfolioValue * 0.023 * 100) / 100,
    tenDay95: Math.round(portfolioValue * 0.015 * Math.sqrt(10) * 100) / 100,
    method: "historical" as const,
  });
});

// GET /limits - Limit utilization
const limitsRoute = createRoute({
  method: "get",
  path: "/limits",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(LimitStatusSchema),
        },
      },
      description: "Limit statuses",
    },
  },
  tags: ["Risk"],
});

app.openapi(limitsRoute, (c) => {
  const limits: z.infer<typeof LimitStatusSchema>[] = [
    {
      name: "Max Position Size",
      category: "per_instrument",
      current: 4500,
      limit: 5000,
      utilization: 0.9,
      status: "warning",
    },
    {
      name: "Max Notional",
      category: "per_instrument",
      current: 35000,
      limit: 50000,
      utilization: 0.7,
      status: "ok",
    },
    {
      name: "Gross Exposure",
      category: "portfolio",
      current: 180000,
      limit: 200000,
      utilization: 0.9,
      status: "warning",
    },
    {
      name: "Net Exposure",
      category: "portfolio",
      current: 60000,
      limit: 100000,
      utilization: 0.6,
      status: "ok",
    },
    {
      name: "Max Concentration",
      category: "portfolio",
      current: 0.15,
      limit: 0.2,
      utilization: 0.75,
      status: "ok",
    },
    {
      name: "Portfolio Delta",
      category: "options",
      current: 45,
      limit: 100,
      utilization: 0.45,
      status: "ok",
    },
    {
      name: "Portfolio Vega",
      category: "options",
      current: 850,
      limit: 1000,
      utilization: 0.85,
      status: "warning",
    },
  ];

  return c.json(limits);
});

// ============================================
// Export
// ============================================

export const riskRoutes = app;
export default riskRoutes;
