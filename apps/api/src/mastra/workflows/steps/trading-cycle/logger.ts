/**
 * Trading Cycle Logger
 *
 * Shared logger instance for the trading cycle workflow.
 */

import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "trading-cycle",
	level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: process.env.CREAM_ENV ?? "BACKTEST",
	pretty: process.env.NODE_ENV === "development",
});
