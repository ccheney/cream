/**
 * Dashboard API Server
 *
 * Hono-based API server for the dashboard with WebSocket support,
 * Zod OpenAPI validation, and RPC mode.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 * @see docs/plans/ui/06-websocket.md
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { timing } from "hono/timing";
import { prettyJSON } from "hono/pretty-json";
import {
  websocketHandler,
  createConnectionMetadata,
  validateAuthToken,
  startHeartbeat,
  closeAllConnections,
  getConnectionCount,
} from "./websocket/handler.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Middleware
// ============================================

// CORS configuration
app.use(
  "/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Request logging
app.use("/*", logger());

// Server timing headers
app.use("/*", timing());

// Pretty JSON in development
if (process.env.NODE_ENV !== "production") {
  app.use("/*", prettyJSON());
}

// ============================================
// Health Check Route
// ============================================

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["ok", "degraded", "down"]),
            timestamp: z.string(),
            version: z.string(),
            websocket: z.object({
              connections: z.number(),
            }),
          }),
        },
      },
      description: "Health check response",
    },
  },
  tags: ["System"],
});

app.openapi(healthRoute, (c) => {
  return c.json({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    websocket: {
      connections: getConnectionCount(),
    },
  });
});

// ============================================
// System Routes
// ============================================

const systemStatusRoute = createRoute({
  method: "get",
  path: "/api/system/status",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
            status: z.enum(["running", "paused", "stopped"]),
            lastCycleId: z.string().nullable(),
            lastCycleTime: z.string().nullable(),
            uptime: z.number(),
          }),
        },
      },
      description: "System status",
    },
  },
  tags: ["System"],
});

app.openapi(systemStatusRoute, (c) => {
  return c.json({
    environment: (process.env.CREAM_ENV ?? "PAPER") as "BACKTEST" | "PAPER" | "LIVE",
    status: "running" as const,
    lastCycleId: null,
    lastCycleTime: null,
    uptime: process.uptime(),
  });
});

// ============================================
// Placeholder API Routes
// ============================================

// Decisions
app.get("/api/decisions", (c) => {
  return c.json({ decisions: [], total: 0 });
});

app.get("/api/decisions/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id, message: "Decision not found" }, 404);
});

// Portfolio
app.get("/api/portfolio", (c) => {
  return c.json({
    nav: 0,
    cash: 0,
    equity: 0,
    grossExposure: 0,
    netExposure: 0,
    positions: [],
  });
});

app.get("/api/portfolio/positions", (c) => {
  return c.json({ positions: [] });
});

// Agents
app.get("/api/agents", (c) => {
  return c.json({
    agents: [
      { id: "technical", name: "Technical Analyst", status: "idle" },
      { id: "news", name: "News & Sentiment", status: "idle" },
      { id: "fundamentals", name: "Fundamentals & Macro", status: "idle" },
      { id: "bullish", name: "Bullish Research", status: "idle" },
      { id: "bearish", name: "Bearish Research", status: "idle" },
      { id: "trader", name: "Trader", status: "idle" },
      { id: "risk", name: "Risk Manager", status: "idle" },
      { id: "critic", name: "Critic", status: "idle" },
    ],
  });
});

// Config
app.get("/api/config", (c) => {
  return c.json({
    environment: process.env.CREAM_ENV ?? "PAPER",
    broker: process.env.CREAM_BROKER ?? "ALPACA",
  });
});

// Market data
app.get("/api/market/quote/:symbol", (c) => {
  const symbol = c.req.param("symbol");
  return c.json({ symbol, bid: 0, ask: 0, last: 0, volume: 0 });
});

// Risk
app.get("/api/risk", (c) => {
  return c.json({
    grossExposure: 0,
    netExposure: 0,
    var95: 0,
    maxDrawdown: 0,
  });
});

// Alerts
app.get("/api/alerts", (c) => {
  return c.json({ alerts: [] });
});

// Backtest
app.get("/api/backtests", (c) => {
  return c.json({ backtests: [] });
});

// Theses
app.get("/api/theses", (c) => {
  return c.json({ theses: [] });
});

// ============================================
// OpenAPI Documentation
// ============================================

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Cream Dashboard API",
    version: "0.1.0",
    description: "API for the Cream trading system dashboard",
  },
  servers: [
    { url: "http://localhost:3001", description: "Development" },
  ],
});

// Swagger UI redirect
app.get("/docs", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cream API Docs</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
          SwaggerUIBundle({
            url: '/openapi.json',
            dom_id: '#swagger-ui',
          });
        </script>
      </body>
    </html>
  `);
});

// ============================================
// Export App Type for RPC Client
// ============================================

export type AppType = typeof app;
export default app;

// ============================================
// Server Startup
// ============================================

if (import.meta.main) {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  // Start heartbeat for WebSocket connections
  startHeartbeat();

  const server = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade on /ws path
      if (url.pathname === "/ws") {
        const authHeader = req.headers.get("Authorization");
        const authResult = validateAuthToken(authHeader);

        if (!authResult.valid) {
          return new Response(authResult.error ?? "Unauthorized", { status: 401 });
        }

        const metadata = createConnectionMetadata(authResult.userId!);
        const success = server.upgrade(req, { data: metadata });

        if (success) {
          return undefined;
        }

        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Handle HTTP requests with Hono
      return app.fetch(req, { server });
    },
    websocket: websocketHandler,
  });

  console.log(`Dashboard API server running at http://localhost:${port}`);
  console.log(`  - Health: http://localhost:${port}/health`);
  console.log(`  - OpenAPI: http://localhost:${port}/openapi.json`);
  console.log(`  - Docs: http://localhost:${port}/docs`);
  console.log(`  - WebSocket: ws://localhost:${port}/ws`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    closeAllConnections("Server shutting down");
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    closeAllConnections("Server shutting down");
    server.stop();
    process.exit(0);
  });
}
