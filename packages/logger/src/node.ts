import pino, { type Logger, type LoggerOptions } from "pino";
import { mergeRedactPaths } from "./redaction.js";
import type { NodeLoggerOptions, TenantContext, TraceContext } from "./types.js";

type LoggerState = "active" | "flushing" | "destroyed";

export interface LifecycleLogger extends Logger {
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

function wrapLoggerWithLifecycle(baseLogger: Logger): LifecycleLogger {
  let state: LoggerState = "active";
  let flushPromise: Promise<void> | null = null;

  const wrappedLogger = Object.create(baseLogger) as LifecycleLogger;

  // Wrap logging methods to check state
  const logMethods = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
  for (const method of logMethods) {
    const original = baseLogger[method].bind(baseLogger);
    (wrappedLogger as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      if (state === "destroyed") {
        return;
      }
      return (original as (...args: unknown[]) => void)(...args);
    };
  }

  wrappedLogger.flush = async (): Promise<void> => {
    if (state === "destroyed") {
      return;
    }
    if (flushPromise) {
      return flushPromise;
    }
    state = "flushing";
    flushPromise = new Promise<void>((resolve) => {
      baseLogger.flush();
      // Give pino time to flush
      setTimeout(() => {
        state = "active";
        flushPromise = null;
        resolve();
      }, 100);
    });
    return flushPromise;
  };

  wrappedLogger.destroy = async (): Promise<void> => {
    if (state === "destroyed") {
      return;
    }
    await wrappedLogger.flush();
    state = "destroyed";
  };

  return wrappedLogger;
}

export function createNodeLogger(options: NodeLoggerOptions): LifecycleLogger {
  const {
    service,
    level = "info",
    environment,
    version,
    pretty,
    redactPaths,
    base = {},
    pinoOptions = {},
  } = options;

  const isPretty = pretty ?? process.env.NODE_ENV === "development";

  const loggerOptions: LoggerOptions = {
    level,
    formatters: {
      level: (label) => ({ severity: label.toUpperCase() }),
      bindings: () => ({}), // Remove pid, hostname
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    redact: {
      paths: mergeRedactPaths(redactPaths) as string[],
      censor: "[REDACTED]",
    },
    base: {
      service,
      environment,
      version,
      ...base,
    },
    ...pinoOptions,
  };

  let baseLogger: Logger;

  if (isPretty) {
    baseLogger = pino(
      loggerOptions,
      pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          // Remove fields redundant with Turborepo's package prefix
          ignore: "pid,hostname,service,environment,version",
          // Color by severity: grey for info, yellow for warn, red for error
          customColors: "trace:gray,debug:gray,info:gray,warn:yellow,error:red,fatal:red",
          singleLine: true,
        },
      })
    );
  } else {
    baseLogger = pino(loggerOptions);
  }

  return wrapLoggerWithLifecycle(baseLogger);
}

export function withTraceContext(logger: Logger, context: TraceContext): Logger {
  return logger.child({
    correlationId: context.correlationId,
    traceId: context.traceId,
    spanId: context.spanId,
    requestId: context.requestId,
  });
}

export function withTenantContext(logger: Logger, context: TenantContext): Logger {
  return logger.child({
    tenantId: context.tenantId,
    campaignId: context.campaignId,
    adminUserId: context.adminUserId,
    externalUserId: context.externalUserId,
  });
}

/**
 * Create a ConsensusLogger-compatible wrapper from a pino logger.
 * Adapts the pino interface to the ConsensusLogger interface used by @cream/mastra-kit.
 */
export function createConsensusLogger(logger: Logger): {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
} {
  return {
    info: (message: string, data?: Record<string, unknown>) => {
      if (data) {
        logger.info(data, message);
      } else {
        logger.info(message);
      }
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      if (data) {
        logger.warn(data, message);
      } else {
        logger.warn(message);
      }
    },
    error: (message: string, data?: Record<string, unknown>) => {
      if (data) {
        logger.error(data, message);
      } else {
        logger.error(message);
      }
    },
  };
}
