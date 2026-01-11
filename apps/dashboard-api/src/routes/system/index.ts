/**
 * System Routes Index
 *
 * Composes all system sub-routers into a single router.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import controlRoutes from "./control.js";
import cyclesRoutes from "./cycles.js";
import healthRoutes from "./health.js";
import { systemState } from "./state.js";

const app = new OpenAPIHono();

// Mount sub-routers
app.route("/", controlRoutes);
app.route("/", cyclesRoutes);
app.route("/", healthRoutes);

export default app;
export { systemState };

// Re-export types for external use
export type { CycleState, ServiceHealth, SystemState } from "./types.js";
