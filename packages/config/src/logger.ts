import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

export const log: LifecycleLogger = createNodeLogger({
  service: "config",
  level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
  environment: process.env.CREAM_ENV ?? "BACKTEST",
  pretty: process.env.NODE_ENV === "development",
});
