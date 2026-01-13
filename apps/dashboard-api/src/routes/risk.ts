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
import { getPortfolioSnapshotsRepo, getPositionsRepo } from "../db.js";
import { portfolioService } from "../services/portfolio.js";
import {
  calculateExposure,
  calculateLimits,
  DEFAULT_EXPOSURE_LIMITS,
  DEFAULT_OPTIONS,
  getCorrelationMatrix,
  getVaRMetrics,
  type PositionForExposure,
} from "../services/risk/index.js";
import { getCurrentEnvironment } from "./system.js";

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

app.openapi(exposureRoute, async (c) => {
  const positionsRepo = await getPositionsRepo();
  const snapshotsRepo = await getPortfolioSnapshotsRepo();
  const env = getCurrentEnvironment();

  // 1. Get Positions
  const positions = await positionsRepo.findOpen(env);

  // 2. Get NAV
  const latestSnapshot = await snapshotsRepo.getLatest(env);
  // Fallback NAV if no snapshot: sum of absolute market values (approximation) or just cash + equity
  const equity = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const nav = latestSnapshot?.nav ?? (equity || 100000); // Default to 100k if empty

  // 3. Map to PositionForExposure
  const positionsForExposure: PositionForExposure[] = positions.map((p) => ({
    symbol: p.symbol,
    side: p.side as "LONG" | "SHORT",
    quantity: p.quantity,
    marketValue: p.marketValue,
  }));

  // 4. Calculate Exposure
  const metrics = calculateExposure({
    positions: positionsForExposure,
    nav,
    limits: DEFAULT_EXPOSURE_LIMITS,
  });

  return c.json(metrics, 200);
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

app.openapi(greeksRoute, async (c) => {
  const options = await portfolioService.getOptionsPositions();

  let totalDeltaNotional = 0;
  let totalGamma = 0;
  let totalVega = 0;
  let totalTheta = 0;

  const byPosition = options.map((opt) => {
    const g = opt.greeks ?? { delta: 0, gamma: 0, vega: 0, theta: 0 };
    const multiplier = 100;
    const qty = opt.quantity; // signed (+ for long, - for short)

    // Greeks aggregation
    // Delta Notional = Delta * UnderlyingPrice * Multiplier * Quantity
    const positionDeltaNotional = g.delta * opt.underlyingPrice * multiplier * qty;

    // Gamma (Portfolio) = Gamma * Multiplier * Quantity
    // Note: Some definitions scale Gamma by price^2/100, but standard "Position Gamma" is usually just sum of contract gammas
    // If limit is 1000, it's likely total contract gamma units.
    const positionGamma = g.gamma * multiplier * qty;

    // Vega (Portfolio) = Vega * Multiplier * Quantity
    const positionVega = g.vega * multiplier * qty;

    // Theta (Portfolio) = Theta * Multiplier * Quantity
    const positionTheta = g.theta * multiplier * qty;

    totalDeltaNotional += positionDeltaNotional;
    totalGamma += positionGamma;
    totalVega += positionVega;
    totalTheta += positionTheta;

    return {
      symbol: opt.contractSymbol,
      delta: g.delta,
      gamma: g.gamma,
      vega: g.vega,
      theta: g.theta,
    };
  });

  return c.json({
    delta: { current: totalDeltaNotional, limit: DEFAULT_OPTIONS.max_delta_notional },
    gamma: { current: totalGamma, limit: DEFAULT_OPTIONS.max_gamma },
    vega: { current: totalVega, limit: DEFAULT_OPTIONS.max_vega },
    theta: { current: totalTheta, limit: DEFAULT_OPTIONS.max_theta },
    byPosition,
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
  const env = getCurrentEnvironment();
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

app.openapi(varRoute, async (c) => {
  // Get positions from database
  const positionsRepo = await getPositionsRepo();
  const snapshotsRepo = await getPortfolioSnapshotsRepo();
  const env = getCurrentEnvironment();
  const positions = await positionsRepo.findOpen(env);

  // Get NAV from latest snapshot (or calculate from positions)
  const latestSnapshot = await snapshotsRepo.getLatest(env);
  const nav = latestSnapshot?.nav ?? positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);

  // Convert positions for VaR calculation
  const positionsForVaR: PositionForExposure[] = positions.map((p) => ({
    symbol: p.symbol,
    side: p.side as "LONG" | "SHORT",
    quantity: p.quantity,
    marketValue: p.marketValue ?? 0,
  }));

  // Calculate VaR metrics
  const varMetrics = await getVaRMetrics({
    positions: positionsForVaR,
    nav,
    lookbackDays: 252, // 1 year of data
  });

  return c.json(varMetrics, 200);
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

app.openapi(limitsRoute, async (c) => {
  // Get positions from database
  const positionsRepo = await getPositionsRepo();
  const snapshotsRepo = await getPortfolioSnapshotsRepo();
  const env = getCurrentEnvironment();
  const positions = await positionsRepo.findOpen(env);

  // Get NAV from latest snapshot (or calculate from positions)
  const latestSnapshot = await snapshotsRepo.getLatest(env);
  const nav = latestSnapshot?.nav ?? positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);

  // Convert positions for exposure calculation
  const positionsForExposure: PositionForExposure[] = positions.map((p) => ({
    symbol: p.symbol,
    side: p.side as "LONG" | "SHORT",
    quantity: p.quantity,
    marketValue: p.marketValue ?? 0,
  }));

  // Calculate exposure metrics
  const exposure = calculateExposure({
    positions: positionsForExposure,
    nav,
    limits: DEFAULT_EXPOSURE_LIMITS,
  });

  // Calculate limit statuses
  // Note: Greeks would come from options positions - not yet integrated
  const limits = calculateLimits({
    exposure,
    positions: positionsForExposure,
    nav,
    constraints: {
      per_instrument: {
        max_units: 1000,
        max_notional: 50000,
        max_pct_equity: 0.1,
      },
      portfolio: {
        max_gross_notional: 500000,
        max_net_notional: 250000,
        max_gross_pct_equity: 2.0,
        max_net_pct_equity: 1.0,
      },
      // Options limits omitted - no Greeks data yet
    },
  });

  return c.json(limits, 200);
});

// ============================================
// Export
// ============================================

export const riskRoutes = app;
export default riskRoutes;
