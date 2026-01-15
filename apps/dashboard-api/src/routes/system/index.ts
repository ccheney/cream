/**
 * System Routes Index
 *
 * Composes all system sub-routers into a single router.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import controlRoutes from "./control.js";
import cyclesRoutes from "./cycles.js";
import healthRoutes from "./health.js";
import workerEventsRoutes from "./worker-events.js";

const app = new OpenAPIHono();

// Mount sub-routers
app.route("/", controlRoutes);
app.route("/", cyclesRoutes);
app.route("/", healthRoutes);
app.route("/worker-events", workerEventsRoutes);

export default app;

// Re-export state functions for external use
export {
	getCurrentEnvironment,
	getRunningCycles,
	getSystemState,
	setSystemStatus,
} from "./state.js";

// Re-export types for external use
export type { CycleState, ServiceHealth, SystemState } from "./types.js";
