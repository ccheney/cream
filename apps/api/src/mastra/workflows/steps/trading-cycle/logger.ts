/**
 * Trading Cycle Logger
 *
 * Shared logger instance for the trading cycle workflow.
 */

import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "trading-cycle",
	level: Bun.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: Bun.env.CREAM_ENV ?? "PAPER",
	pretty: Bun.env.NODE_ENV === "development",
});
