/**
 * Regime Routes
 *
 * Endpoints for market regime classification.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getRegimeLabelsRepo } from "../../db.js";
import {
  ErrorSchema,
  getCached,
  getPolygonClient,
  type RegimeStatus,
  RegimeStatusSchema,
  setCache,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Helper Functions
// ============================================

type RegimeLabel = "BULL_TREND" | "BEAR_TREND" | "RANGE" | "HIGH_VOL" | "LOW_VOL";

function mapRegime(regime: string): RegimeLabel {
  const upper = regime.toUpperCase();
  if (upper.includes("BULL")) {
    return "BULL_TREND";
  }
  if (upper.includes("BEAR")) {
    return "BEAR_TREND";
  }
  if (upper.includes("RANGE")) {
    return "RANGE";
  }
  if (upper.includes("HIGH")) {
    return "HIGH_VOL";
  }
  if (upper.includes("LOW")) {
    return "LOW_VOL";
  }
  return "RANGE";
}

async function fetchVix(): Promise<number> {
  try {
    const client = getPolygonClient();
    const response = await client.getPreviousClose("I:VIX");
    return response.results?.[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

// ============================================
// Routes
// ============================================

const regimeRoute = createRoute({
  method: "get",
  path: "/regime",
  responses: {
    200: {
      content: { "application/json": { schema: RegimeStatusSchema } },
      description: "Current market regime",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Market data service unavailable",
    },
  },
  tags: ["Market"],
});

app.openapi(regimeRoute, async (c) => {
  const cacheKey = "regime:market";
  const cached = getCached<RegimeStatus>(cacheKey);
  if (cached) {
    return c.json(cached, 200);
  }

  try {
    const repo = await getRegimeLabelsRepo();
    let regimeData = await repo.getCurrent("_MARKET", "1d");
    if (!regimeData) {
      regimeData = await repo.getCurrent("SPY", "1d");
    }

    const vix = await fetchVix();

    const status: RegimeStatus = {
      label: regimeData ? mapRegime(regimeData.regime) : "RANGE",
      confidence: regimeData?.confidence ?? 0,
      vix,
      sectorRotation: {},
      updatedAt: regimeData?.timestamp ?? new Date().toISOString(),
    };

    setCache(cacheKey, status);
    return c.json(status, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch market regime: ${message}`,
    });
  }
});

export default app;
