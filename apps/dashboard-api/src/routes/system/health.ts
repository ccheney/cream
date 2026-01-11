/**
 * System Health Routes
 *
 * Health check endpoints for monitoring service availability.
 */

import { createHelixClientFromEnv } from "@cream/helix";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { getAlertsRepo } from "../../db.js";
import { HealthResponseSchema, type ServiceHealth } from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Health Check Functions
// ============================================

async function checkDatabase(): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const alertsRepo = await getAlertsRepo();
    await alertsRepo.findMany({}, { page: 1, pageSize: 1 });
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "Database error",
    };
  }
}

async function checkHelix(): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const client = createHelixClientFromEnv();
    const result = await client.healthCheck();
    client.close();
    return {
      status: result.healthy ? "ok" : "error",
      latencyMs: Math.round(result.latencyMs),
      message: result.error,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "HelixDB unavailable",
    };
  }
}

async function checkBroker(): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const hasKeys = process.env.ALPACA_KEY && process.env.ALPACA_SECRET;
    if (!hasKeys) {
      return { status: "degraded", message: "API keys not configured" };
    }
    const baseUrl = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
    const response = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
      },
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.ok ? "ok" : "error",
      latencyMs: Math.round(performance.now() - start),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "Broker unavailable",
    };
  }
}

async function checkMarketData(): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const apiKey = process.env.POLYGON_KEY;
    if (!apiKey) {
      return { status: "degraded", message: "API key not configured" };
    }
    const response = await fetch(
      `https://api.polygon.io/v3/reference/tickers/AAPL?apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    return {
      status: response.ok ? "ok" : "error",
      latencyMs: Math.round(performance.now() - start),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "Market data unavailable",
    };
  }
}

async function checkExecution(): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const host = process.env.EXECUTION_ENGINE_HOST ?? "localhost";
    const port = process.env.EXECUTION_ENGINE_PORT ?? "50053";
    const isConfigured = process.env.EXECUTION_ENGINE_HOST || process.env.CREAM_ENV !== "BACKTEST";
    if (!isConfigured) {
      return { status: "degraded", message: "Not configured (BACKTEST mode)" };
    }
    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
      message: `${host}:${port}`,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "Execution engine unavailable",
    };
  }
}

// ============================================
// Routes
// ============================================

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Health check",
    },
  },
  tags: ["System"],
});

app.openapi(healthRoute, async (c) => {
  const [database, helix, broker, marketdata, execution] = await Promise.all([
    checkDatabase(),
    checkHelix(),
    checkBroker(),
    checkMarketData(),
    checkExecution(),
  ]);

  const statuses = [
    database.status,
    helix.status,
    broker.status,
    marketdata.status,
    execution.status,
  ];
  const hasError = statuses.includes("error");
  const hasDegraded = statuses.includes("degraded");

  let overallStatus: "ok" | "degraded" | "down";
  if (hasError) {
    overallStatus = "down";
  } else if (hasDegraded) {
    overallStatus = "degraded";
  } else {
    overallStatus = "ok";
  }

  return c.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    services: {
      database,
      helix,
      broker,
      marketdata,
      execution,
      websocket: {
        status: "ok" as const,
        connections: 0,
      },
    },
  });
});

export default app;
