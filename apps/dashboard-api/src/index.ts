/**
 * Dashboard API Server
 *
 * Hono-based API server for the dashboard with WebSocket support.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Middleware
app.use("/*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// API routes will be added here

export default app;

// Start server if run directly
if (import.meta.main) {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  Bun.serve({
    port,
    fetch: app.fetch,
  });
}
