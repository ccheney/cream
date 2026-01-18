import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
	service: "indicators",
	level: Bun.env.LOG_LEVEL === "debug" ? "debug" : "info",
	environment: Bun.env.CREAM_ENV ?? "PAPER",
	pretty: Bun.env.NODE_ENV === "development",
});
