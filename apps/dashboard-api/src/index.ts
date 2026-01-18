/**
 * Dashboard API Server
 *
 * Hono-based API server for the dashboard with WebSocket support,
 * Zod OpenAPI validation, and RPC mode.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 * @see docs/plans/ui/06-websocket.md
 */

import { initTracing, shutdownTracing } from "./tracing.js";

initTracing();

import { type CreamEnvironment, initCalendarService } from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { timing } from "hono/timing";
import { getAuth } from "./auth/better-auth.js";
import {
	liveProtection,
	requireAuth,
	type SessionVariables,
	sessionMiddleware,
} from "./auth/session.js";
import { closeDb, getCyclesRepo } from "./db.js";
import { getEventPublisher, resetEventPublisher } from "./events/publisher.js";
import log from "./logger.js";
import { AUTH_CONFIG, rateLimit, SESSION_CONFIG } from "./middleware/index.js";
import {
	adminRoutes,
	agentsRoutes,
	aiRoutes,
	alertsRoutes,
	batchStatusRoutes,
	batchTriggerRoutes,
	calendarRoutes,
	configRoutes,
	cyclesRoutes,
	decisionsRoutes,
	economicCalendarRoutes,
	factorZooRoutes,
	filingsRoutes,
	indicatorsRoutes,
	marketRoutes,
	optionsRoutes,
	portfolioRoutes,
	preferencesRoutes,
	riskRoutes,
	searchRoutes,
	snapshotsRoutes,
	systemRoutes,
	thesesRoutes,
	workersRoutes,
} from "./routes/index.js";
import {
	initMarketDataStreaming,
	initOptionsDataStreaming,
	initSharedOptionsWebSocket,
	shutdownMarketDataStreaming,
	shutdownOptionsDataStreaming,
	shutdownSharedOptionsWebSocket,
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
const allowedOrigins = Bun.env.ALLOWED_ORIGINS
	? Bun.env.ALLOWED_ORIGINS.split(",")
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
if (Bun.env.NODE_ENV !== "production") {
	app.use("/*", prettyJSON());
}

// Global rate limiting (100 req/min per endpoint)
app.use("/api/*", rateLimit());

// Relaxed rate limiting for session checks (60 req/min)
app.use("/api/auth/get-session", rateLimit(SESSION_CONFIG));

// Stricter rate limiting for other auth endpoints (10 req/min)
app.use("/api/auth/*", rateLimit(AUTH_CONFIG));

// Session middleware (extracts session from better-auth cookies)
app.use("/*", sessionMiddleware());

// ============================================
// Better Auth Handler
// ============================================

// Mount better-auth handler for all auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return getAuth().handler(c.req.raw);
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

// Apply authentication to all /api routes except /api/auth and internal endpoints
// Note: /api/system/worker-events and /api/system/trigger-cycle accept internal auth (WORKER_INTERNAL_SECRET)
app.use("/api/system/*", async (c, next) => {
	// Skip user auth for internal worker endpoints (they have their own auth)
	if (c.req.path === "/api/system/worker-events") {
		return next();
	}
	// Allow trigger-cycle to use either user auth or internal auth
	if (c.req.path === "/api/system/trigger-cycle") {
		const authHeader = c.req.header("Authorization");
		if (authHeader?.startsWith("Bearer ")) {
			const token = authHeader.slice(7);
			const internalSecret = Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";
			if (token === internalSecret) {
				return next(); // Internal auth valid, skip user auth
			}
		}
		// Fall through to requireAuth for user auth
	}
	return requireAuth()(c, next);
});
app.use("/api/decisions/*", requireAuth());
app.use("/api/portfolio/*", requireAuth());
app.use("/api/alerts/*", requireAuth());
app.use("/api/agents/*", requireAuth());
app.use("/api/config/*", requireAuth());
app.use("/api/cycles/*", requireAuth());
app.use("/api/market/*", requireAuth());
app.use("/api/risk/*", requireAuth());
app.use("/api/theses/*", requireAuth());
app.use("/api/preferences/*", requireAuth());
app.use("/api/indicators/*", requireAuth());
app.use("/api/factor-zoo/*", requireAuth());
app.use("/api/options/*", requireAuth());
app.use("/api/filings/*", requireAuth());
app.use("/api/snapshots/*", requireAuth());
app.use("/api/economic-calendar/*", requireAuth());
app.use("/api/workers/*", requireAuth());
app.use("/api/admin/*", requireAuth());
app.use("/api/search/*", requireAuth());

// Apply LIVE protection to sensitive operations
app.use("/api/decisions/*", liveProtection());
app.use("/api/portfolio/*", liveProtection());
app.use("/api/config/*", liveProtection());
app.use("/api/theses/*", liveProtection());

app.route("/api/calendar", calendarRoutes);
app.route("/api/system", systemRoutes);
app.route("/api/decisions", decisionsRoutes);
app.route("/api/portfolio", portfolioRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api/agents", agentsRoutes);
app.route("/api/config", configRoutes);
app.route("/api/cycles", cyclesRoutes);
app.route("/api/market", marketRoutes);
app.route("/api/options", optionsRoutes);
app.route("/api/risk", riskRoutes);
app.route("/api/theses", thesesRoutes);
app.route("/api/preferences", preferencesRoutes);
app.route("/api/indicators", indicatorsRoutes);
app.route("/api/indicators", batchStatusRoutes);
app.route("/api/indicators", batchTriggerRoutes);
app.route("/api/factor-zoo", factorZooRoutes);
app.route("/api/filings", filingsRoutes);
app.route("/api/snapshots", snapshotsRoutes);
app.route("/api/economic-calendar", economicCalendarRoutes);
app.route("/api/workers", workersRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/search", searchRoutes);

// AI routes (no auth required for status summaries - they're read-only and rate-limited)
app.route("/api/ai", aiRoutes);

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
	const port = parseInt(Bun.env.PORT ?? "3001", 10);

	log.info({ port, allowedOrigins }, "Starting Dashboard API server");

	// Mark any orphaned "running" cycles as failed from previous server instance
	const cyclesRepo = getCyclesRepo();
	cyclesRepo
		.markOrphanedAsFailed()
		.then((count: number) => {
			if (count > 0) {
				log.info({ count }, "Marked orphaned cycles as failed");
			}
		})
		.catch((error: unknown) => {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to clean up orphaned cycles"
			);
		});

	// Initialize CalendarService (non-blocking, falls back to hardcoded if API unavailable)
	const creamEnv = (Bun.env.CREAM_ENV as CreamEnvironment | undefined) ?? "PAPER";
	initCalendarService({
		mode: creamEnv,
		alpacaKey: Bun.env.ALPACA_KEY,
		alpacaSecret: Bun.env.ALPACA_SECRET,
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

	// Initialize shared options WebSocket first (single connection for Alpaca)
	initSharedOptionsWebSocket()
		.then(() => {
			// Initialize options data streaming after shared WebSocket is ready
			return initOptionsDataStreaming();
		})
		.catch((error) => {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Options streaming initialization failed"
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
	const gracefulShutdown = async (signal: string) => {
		log.info({ signal }, "Received shutdown signal, initiating graceful shutdown");
		resetEventPublisher();
		shutdownMarketDataStreaming();
		shutdownOptionsDataStreaming();
		shutdownSharedOptionsWebSocket();
		closeAllConnections("Server shutting down");
		closeDb();
		await shutdownTracing();
		server.stop();
		log.info("Dashboard API server shutdown complete");
		process.exit(0);
	};

	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}
