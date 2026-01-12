/**
 * Dashboard API Server
 *
 * Hono-based API server for the dashboard with WebSocket support,
 * Zod OpenAPI validation, and RPC mode.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 * @see docs/plans/ui/06-websocket.md
 */

import { type CreamEnvironment, initCalendarService } from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { timing } from "hono/timing";
import { auth } from "./auth/better-auth.js";
import {
  liveProtection,
  requireAuth,
  type SessionVariables,
  sessionMiddleware,
} from "./auth/session.js";
import { closeDb } from "./db.js";
import { getEventPublisher, resetEventPublisher } from "./events/publisher.js";
import log from "./logger.js";
import { AUTH_CONFIG, rateLimit } from "./middleware/index.js";
import {
  agentsRoutes,
  alertsRoutes,
  backtestRoutes,
  batchStatusRoutes,
  batchTriggerRoutes,
  calendarRoutes,
  configRoutes,
  decisionsRoutes,
  economicCalendarRoutes,
  filingsRoutes,
  indicatorsRoutes,
  marketRoutes,
  optionsRoutes,
  portfolioRoutes,
  preferencesRoutes,
  researchRoutes,
  riskRoutes,
  snapshotsRoutes,
  systemRoutes,
  thesesRoutes,
} from "./routes/index.js";
import {
  initMarketDataStreaming,
  initOptionsDataStreaming,
  shutdownMarketDataStreaming,
  shutdownOptionsDataStreaming,
} from "./streaming/index.js";
import {
  closeAllConnections,
  createConnectionMetadata,
  getConnectionCount,
  startHeartbeat,
  validateAuthTokenAsync,
  websocketHandler,
} from "./websocket/handler.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono<{ Variables: SessionVariables }>();

// ============================================
// CORS Configuration
// ============================================

// Parse allowed origins from environment variable or use defaults
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => {
        // Validate each origin is a valid URL
        try {
          new URL(origin);
          return true;
        } catch {
          log.warn({ origin }, "Invalid origin in ALLOWED_ORIGINS");
          return false;
        }
      })
  : DEFAULT_ORIGINS;

// ============================================
// Middleware
// ============================================

// CORS configuration
app.use(
  "/*",
  cors({
    origin: allowedOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Request logging
app.use("/*", honoLogger());

// Server timing headers
app.use("/*", timing());

// Pretty JSON in development
if (process.env.NODE_ENV !== "production") {
  app.use("/*", prettyJSON());
}

// Global rate limiting (100 req/min per endpoint)
app.use("/api/*", rateLimit());

// Stricter rate limiting for auth endpoints (10 req/min)
app.use("/api/auth/*", rateLimit(AUTH_CONFIG));

// Session middleware (extracts session from better-auth cookies)
app.use("/*", sessionMiddleware());

// ============================================
// Better Auth Handler
// ============================================

// Mount better-auth handler for all auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

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
// API Routes (protected)
// ============================================

// Apply authentication to all /api routes except /api/auth
app.use("/api/system/*", requireAuth());
app.use("/api/decisions/*", requireAuth());
app.use("/api/portfolio/*", requireAuth());
app.use("/api/alerts/*", requireAuth());
app.use("/api/agents/*", requireAuth());
app.use("/api/config/*", requireAuth());
app.use("/api/market/*", requireAuth());
app.use("/api/risk/*", requireAuth());
app.use("/api/backtests/*", requireAuth());
app.use("/api/theses/*", requireAuth());
app.use("/api/preferences/*", requireAuth());
app.use("/api/indicators/*", requireAuth());
app.use("/api/research/*", requireAuth());
app.use("/api/options/*", requireAuth());
app.use("/api/filings/*", requireAuth());
app.use("/api/snapshots/*", requireAuth());
app.use("/api/economic-calendar/*", requireAuth());

// Apply LIVE protection to sensitive operations
app.use("/api/decisions/*", liveProtection());
app.use("/api/portfolio/*", liveProtection());
app.use("/api/config/*", liveProtection());
app.use("/api/backtests/*", liveProtection());
app.use("/api/theses/*", liveProtection());

app.route("/api/calendar", calendarRoutes);
app.route("/api/system", systemRoutes);
app.route("/api/decisions", decisionsRoutes);
app.route("/api/portfolio", portfolioRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api/agents", agentsRoutes);
app.route("/api/config", configRoutes);
app.route("/api/market", marketRoutes);
app.route("/api/options", optionsRoutes);
app.route("/api/risk", riskRoutes);
app.route("/api/backtests", backtestRoutes);
app.route("/api/theses", thesesRoutes);
app.route("/api/preferences", preferencesRoutes);
app.route("/api/indicators", indicatorsRoutes);
app.route("/api/indicators", batchStatusRoutes);
app.route("/api/indicators", batchTriggerRoutes);
app.route("/api/research", researchRoutes);
app.route("/api/filings", filingsRoutes);
app.route("/api/snapshots", snapshotsRoutes);
app.route("/api/economic-calendar", economicCalendarRoutes);

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
  servers: [{ url: "http://localhost:3001", description: "Development" }],
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
// Note: We intentionally don't `export default app` because Bun auto-serves
// default exports with a fetch method, conflicting with our manual Bun.serve() below.

// ============================================
// Server Startup
// ============================================

if (import.meta.main) {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  log.info({ port, allowedOrigins }, "Starting Dashboard API server");

  // Initialize CalendarService (non-blocking, falls back to hardcoded for BACKTEST)
  const creamEnv = (process.env.CREAM_ENV as CreamEnvironment | undefined) ?? "BACKTEST";
  initCalendarService({
    mode: creamEnv,
    alpacaKey: process.env.ALPACA_KEY,
    alpacaSecret: process.env.ALPACA_SECRET,
  })
    .then(() => {
      log.info({ mode: creamEnv }, "CalendarService initialized");
    })
    .catch((error: unknown) => {
      log.warn(
        { error: error instanceof Error ? error.message : String(error), mode: creamEnv },
        "CalendarService initialization failed, using fallback"
      );
    });

  // Start heartbeat for WebSocket connections
  startHeartbeat();

  // Initialize market data streaming (non-blocking)
  initMarketDataStreaming().catch((error) => {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Market data streaming initialization failed"
    );
  });

  // Initialize options data streaming (non-blocking)
  initOptionsDataStreaming().catch((error) => {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Options data streaming initialization failed"
    );
  });

  // Start event publisher for broadcasting events to WebSocket clients
  const publisher = getEventPublisher();
  publisher.start().catch((error) => {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Event publisher failed to start"
    );
  });

  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade on /ws path
      if (url.pathname === "/ws") {
        // Use better-auth session validation via cookies
        const authResult = await validateAuthTokenAsync(req.headers);

        if (!authResult.valid || !authResult.userId) {
          return new Response(authResult.error ?? "Unauthorized", { status: 401 });
        }

        const metadata = createConnectionMetadata(authResult.userId);
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

  log.info({ port, url: `http://localhost:${port}` }, "Dashboard API server ready");

  // Graceful shutdown
  const gracefulShutdown = (signal: string) => {
    log.info({ signal }, "Received shutdown signal, initiating graceful shutdown");
    resetEventPublisher();
    shutdownMarketDataStreaming();
    shutdownOptionsDataStreaming();
    closeAllConnections("Server shutting down");
    closeDb();
    server.stop();
    log.info("Dashboard API server shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}
