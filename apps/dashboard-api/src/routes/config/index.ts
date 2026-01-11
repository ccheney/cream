/**
 * Configuration API Routes
 *
 * Database-backed configuration management with draft/promote/rollback workflows.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { agentsRoutes } from "./agents.js";
import { constraintsRoutes } from "./constraints.js";
import { tradingRoutes } from "./trading.js";
import { universeRoutes } from "./universe.js";
import { versionsRoutes } from "./versions.js";

const app = new OpenAPIHono();

// Mount all config sub-routes
app.route("/", tradingRoutes);
app.route("/", agentsRoutes);
app.route("/", universeRoutes);
app.route("/", constraintsRoutes);
app.route("/", versionsRoutes);

export const configRoutes = app;
export default configRoutes;

// Re-export types for consumers
export * from "./types.js";
