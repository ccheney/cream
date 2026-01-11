/**
 * API Service Logger
 *
 * Shared logger instance for the API service.
 * Uses @cream/logger for structured logging with Pino.
 */

import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
  service: "api",
  level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
  environment: process.env.CREAM_ENV ?? "BACKTEST",
  pretty: process.env.NODE_ENV === "development",
});
