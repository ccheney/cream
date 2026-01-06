/**
 * Dashboard API Server
 *
 * Hono-based API server for the dashboard with WebSocket support,
 * Zod OpenAPI validation, and RPC mode.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 * @see docs/plans/ui/06-websocket.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { timing } from "hono/timing";
import { liveProtection, requireAuth } from "./auth/index.js";
import { closeDb } from "./db.js";
import { AUTH_CONFIG, rateLimit } from "./middleware/index.js";
import {
  agentsRoutes,
  alertsRoutes,
  authRoutes,
  backtestRoutes,
  configRoutes,
  decisionsRoutes,
  marketRoutes,
  portfolioRoutes,
  preferencesRoutes,
  riskRoutes,
  systemRoutes,
  thesesRoutes,
} from "./routes/index.js";
import {
  closeAllConnections,
  createConnectionMetadata,
  getConnectionCount,
  startHeartbeat,
  validateAuthToken,
  websocketHandler,
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

// Global rate limiting (100 req/min per endpoint)
app.use("/api/*", rateLimit());

// Stricter rate limiting for auth endpoints (10 req/min)
app.use("/api/auth/*", rateLimit(AUTH_CONFIG));

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
// Auth Routes (public)
// ============================================

app.route("/api/auth", authRoutes);

// ============================================
// API Routes (protected)
// ============================================

// Apply authentication to all /api routes except /api/auth
app.use("/api/system/*", requireAuth);
app.use("/api/decisions/*", requireAuth);
app.use("/api/portfolio/*", requireAuth);
app.use("/api/alerts/*", requireAuth);
app.use("/api/agents/*", requireAuth);
app.use("/api/config/*", requireAuth);
app.use("/api/market/*", requireAuth);
app.use("/api/risk/*", requireAuth);
app.use("/api/backtests/*", requireAuth);
app.use("/api/theses/*", requireAuth);
app.use("/api/preferences/*", requireAuth);

// Apply LIVE protection to sensitive operations
app.use("/api/decisions/*", liveProtection());
app.use("/api/portfolio/*", liveProtection());
app.use("/api/config/*", liveProtection());
app.use("/api/backtests/*", liveProtection());
app.use("/api/theses/*", liveProtection());

app.route("/api/system", systemRoutes);
app.route("/api/decisions", decisionsRoutes);
app.route("/api/portfolio", portfolioRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api/agents", agentsRoutes);
app.route("/api/config", configRoutes);
app.route("/api/market", marketRoutes);
app.route("/api/risk", riskRoutes);
app.route("/api/backtests", backtestRoutes);
app.route("/api/theses", thesesRoutes);
app.route("/api/preferences", preferencesRoutes);

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

  // Graceful shutdown
  process.on("SIGINT", () => {
    closeAllConnections("Server shutting down");
    closeDb();
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    closeAllConnections("Server shutting down");
    closeDb();
    server.stop();
    process.exit(0);
  });
}
