/**
 * Risk API Routes
 *
 * Routes for exposure, Greeks, VaR, and risk limits.
 * Returns real data from positions (Turso) + market data (Massive API) - NO mock data.
 *
 * Data Sources:
 * - Positions: Turso database
 * - Real-time prices: Massive WebSocket streaming
 * - Greeks: Massive Options Snapshot API or local Black-Scholes
 * - Historical data: Massive REST aggregates (for correlation/VaR)
 * - Limits: Config constraints
 *
 * Note: Does NOT require the Rust execution engine - that's for order routing only.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPositionsRepo } from "../db.js";
import { getCorrelationMatrix } from "../services/risk/correlation.js";

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
  sectorExposure: z.record(z.string(), z.number()),
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

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Service Availability Check
// ============================================

/**
 * Stub function - risk endpoints not yet implemented.
 *
 * Required integrations:
 * - /exposure: Positions (Turso) + Massive WebSocket prices + sector mapping
 * - /greeks: Options positions + Massive Options Snapshot API (or local Black-Scholes)
 * - /correlation: Massive REST aggregates (historical prices)
 * - /var: Massive REST aggregates (historical returns)
 * - /limits: Config + above metrics
 *
 * @see beads: cream-lj151, cream-onrak, cream-eahae, cream-a4td0, cream-qubb4
 */
function requireRiskService(): never {
  throw new HTTPException(503, {
    message:
      "Risk endpoints not yet implemented. Requires: Turso positions + Massive market data integration.",
  });
}

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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Risk service unavailable",
    },
  },
  tags: ["Risk"],
});

app.openapi(exposureRoute, () => {
  requireRiskService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Risk service unavailable",
    },
  },
  tags: ["Risk"],
});

app.openapi(greeksRoute, () => {
  requireRiskService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Risk service unavailable",
    },
  },
  tags: ["Risk"],
});

app.openapi(correlationRoute, async (c) => {
  // Get positions from database
  const positionsRepo = await getPositionsRepo();
  const env = process.env.CREAM_ENV ?? "PAPER";
  const positions = await positionsRepo.findOpen(env);

  // Extract unique symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];

  if (symbols.length === 0) {
    return c.json(
      {
        symbols: [],
        matrix: [],
        highCorrelationPairs: [],
      },
      200
    );
  }

  // Calculate correlation matrix
  const result = await getCorrelationMatrix({
    symbols,
    lookbackDays: 60,
    threshold: 0.7,
  });

  return c.json(result, 200);
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Risk service unavailable",
    },
  },
  tags: ["Risk"],
});

app.openapi(varRoute, () => {
  requireRiskService();
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
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Risk service unavailable",
    },
  },
  tags: ["Risk"],
});

app.openapi(limitsRoute, () => {
  requireRiskService();
});

// ============================================
// Export
// ============================================

export const riskRoutes = app;
export default riskRoutes;
