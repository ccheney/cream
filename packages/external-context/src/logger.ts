import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "external-context",
	level: Bun.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: Bun.env.CREAM_ENV ?? "BACKTEST",
	pretty: Bun.env.NODE_ENV === "development",
});
