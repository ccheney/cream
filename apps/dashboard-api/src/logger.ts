/**
 * Dashboard API Logger
 *
 * Centralized structured logging for the dashboard API service.
 * Uses pino-based @cream/logger with automatic redaction.
 */

import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "dashboard-api",
	level: Bun.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: Bun.env.CREAM_ENV ?? "PAPER",
	pretty: Bun.env.NODE_ENV === "development",
});

export default log;
