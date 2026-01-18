/**
 * API Service Logger
 *
 * Shared logger instance for the API service.
 * Uses @cream/logger for structured logging with Pino.
 */

import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "api",
	level: Bun.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: Bun.env.CREAM_ENV ?? "PAPER",
	pretty: Bun.env.NODE_ENV === "development",
});
