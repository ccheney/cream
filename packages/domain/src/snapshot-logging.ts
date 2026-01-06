/**
 * Snapshot Logging and Observability
 *
 * Structured logging for market snapshot generation, including:
 * - Snapshot assembly events
 * - Performance metrics
 * - Validation errors
 * - Sensitive data redaction
 * - Snapshot diff utilities
 *
 * @see docs/plans/03-market-snapshot.md
 */

import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import type { SnapshotPerformanceMetrics, SnapshotSizeEstimate } from "./snapshot-limits";

// ============================================
// Types
// ============================================

/**
 * Log levels for snapshot logging.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured log entry for snapshot events.
 */
export interface SnapshotLogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp in ISO 8601 */
  timestamp: string;
  /** Trading cycle ID */
  cycleId?: string;
  /** Environment (BACKTEST, PAPER, LIVE) */
  environment?: string;
  /** Additional structured fields */
  fields: Record<string, unknown>;
}

/**
 * Metrics logged for snapshot assembly.
 */
export interface SnapshotAssemblyMetrics {
  /** Trading cycle ID */
  cycleId: string;
  /** Environment */
  environment: string;
  /** Number of symbols in universe */
  universeSize: number;
  /** Number of current positions */
  positionCount: number;
  /** Total candles across all symbols */
  candleCount: number;
  /** External events fetched */
  eventCount: number;
  /** Assembly time in milliseconds */
  assemblyTimeMs: number;
  /** Snapshot size in bytes */
  snapshotSizeBytes: number;
  /** Token estimate for LLM */
  tokenEstimate: number;
  /** Validation errors (if any) */
  validationErrors: string[];
  /** Data sources queried */
  dataSources: string[];
  /** Warnings generated */
  warnings: string[];
}

/**
 * Logger interface for dependency injection.
 */
export interface SnapshotLogger {
  debug(entry: SnapshotLogEntry): void;
  info(entry: SnapshotLogEntry): void;
  warn(entry: SnapshotLogEntry): void;
  error(entry: SnapshotLogEntry): void;
}

/**
 * Options for snapshot diff.
 */
export interface SnapshotDiffOptions {
  /** Include bar-level diffs */
  includeBars?: boolean;
  /** Include quote-level diffs */
  includeQuotes?: boolean;
  /** Maximum diff entries to return */
  maxDiffs?: number;
}

/**
 * Single diff entry between snapshots.
 */
export interface SnapshotDiffEntry {
  /** Path to the changed field */
  path: string;
  /** Previous value */
  previous: unknown;
  /** Current value */
  current: unknown;
  /** Type of change */
  changeType: "added" | "removed" | "modified";
}

/**
 * Result of comparing two snapshots.
 */
export interface SnapshotDiffResult {
  /** Whether snapshots are identical */
  identical: boolean;
  /** Number of differences found */
  diffCount: number;
  /** Individual differences */
  diffs: SnapshotDiffEntry[];
  /** Summary of changes */
  summary: {
    symbolsAdded: string[];
    symbolsRemoved: string[];
    symbolsModified: string[];
    regimeChanged: boolean;
    marketStatusChanged: boolean;
  };
}

// ============================================
// Default Logger
// ============================================

/**
 * Create a console-based logger (default implementation).
 */
export function createConsoleLogger(): SnapshotLogger {
  return {
    debug(entry) {
      if (process.env.LOG_LEVEL === "debug") {
        // biome-ignore lint/suspicious/noConsole: intentional console logger
        console.debug(JSON.stringify(entry));
      }
    },
    info(entry) {
      // biome-ignore lint/suspicious/noConsole: intentional console logger
      console.info(JSON.stringify(entry));
    },
    warn(entry) {
      // biome-ignore lint/suspicious/noConsole: intentional console logger
      console.warn(JSON.stringify(entry));
    },
    error(entry) {
      // biome-ignore lint/suspicious/noConsole: intentional console logger
      console.error(JSON.stringify(entry));
    },
  };
}

/**
 * Create a no-op logger for testing.
 */
export function createNoOpLogger(): SnapshotLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Default logger instance.
 */
export const defaultSnapshotLogger = createConsoleLogger();

// ============================================
// Sensitive Data Redaction
// ============================================

/**
 * Patterns to redact from logs.
 */
const REDACTION_PATTERNS = [
  // API keys
  { pattern: /(api[_-]?key|apikey)[=:]\s*["']?[\w-]+["']?/gi, replacement: "$1=[REDACTED]" },
  { pattern: /["']?bearer\s+[\w.-]+["']?/gi, replacement: "Bearer [REDACTED]" },
  {
    pattern: /(secret|token|password|auth)[=:]\s*["']?[\w-]+["']?/gi,
    replacement: "$1=[REDACTED]",
  },
  // Account numbers
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[REDACTED_CARD]" },
  // SSN patterns
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[REDACTED_SSN]" },
];

/**
 * Redact sensitive data from a string.
 *
 * @param text - Text to redact
 * @returns Redacted text
 */
export function redactSensitiveData(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact sensitive data from an object (deep).
 *
 * @param obj - Object to redact
 * @returns Redacted object copy
 */
export function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return redactSensitiveData(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact specific sensitive field names
      if (
        key.toLowerCase().includes("key") ||
        key.toLowerCase().includes("secret") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("password") ||
        key.toLowerCase().includes("auth")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(value);
      }
    }
    return result;
  }

  return obj;
}

// ============================================
// Snapshot Assembly Logging
// ============================================

/**
 * Log snapshot assembly start.
 *
 * @param logger - Logger to use
 * @param cycleId - Trading cycle ID
 * @param universeSize - Number of symbols
 * @param environment - Trading environment
 */
export function logSnapshotStart(
  logger: SnapshotLogger,
  cycleId: string,
  universeSize: number,
  environment: string
): void {
  logger.info({
    level: "info",
    message: "Snapshot assembly started",
    timestamp: new Date().toISOString(),
    cycleId,
    environment,
    fields: {
      universeSize,
      phase: "start",
    },
  });
}

/**
 * Log snapshot assembly completion.
 *
 * @param logger - Logger to use
 * @param metrics - Assembly metrics
 */
export function logSnapshotComplete(
  logger: SnapshotLogger,
  metrics: SnapshotAssemblyMetrics
): void {
  const level: LogLevel = metrics.validationErrors.length > 0 ? "warn" : "info";

  logger[level]({
    level,
    message: "Snapshot assembly completed",
    timestamp: new Date().toISOString(),
    cycleId: metrics.cycleId,
    environment: metrics.environment,
    fields: {
      universeSize: metrics.universeSize,
      positionCount: metrics.positionCount,
      candleCount: metrics.candleCount,
      eventCount: metrics.eventCount,
      assemblyTimeMs: metrics.assemblyTimeMs,
      snapshotSizeBytes: metrics.snapshotSizeBytes,
      tokenEstimate: metrics.tokenEstimate,
      dataSources: metrics.dataSources,
      phase: "complete",
      hasErrors: metrics.validationErrors.length > 0,
      hasWarnings: metrics.warnings.length > 0,
    },
  });

  // Log warnings separately
  for (const warning of metrics.warnings) {
    logger.warn({
      level: "warn",
      message: warning,
      timestamp: new Date().toISOString(),
      cycleId: metrics.cycleId,
      environment: metrics.environment,
      fields: { phase: "complete" },
    });
  }

  // Log validation errors separately
  for (const error of metrics.validationErrors) {
    logger.error({
      level: "error",
      message: `Validation error: ${error}`,
      timestamp: new Date().toISOString(),
      cycleId: metrics.cycleId,
      environment: metrics.environment,
      fields: { phase: "complete" },
    });
  }
}

/**
 * Log snapshot assembly error.
 *
 * @param logger - Logger to use
 * @param cycleId - Trading cycle ID
 * @param error - Error that occurred
 * @param context - Additional context
 */
export function logSnapshotError(
  logger: SnapshotLogger,
  cycleId: string,
  error: Error | string,
  context?: Record<string, unknown>
): void {
  logger.error({
    level: "error",
    message: `Snapshot assembly failed: ${error instanceof Error ? error.message : error}`,
    timestamp: new Date().toISOString(),
    cycleId,
    fields: {
      phase: "error",
      errorType: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
    },
  });
}

/**
 * Log data source fetch.
 *
 * @param logger - Logger to use
 * @param cycleId - Trading cycle ID
 * @param source - Data source name
 * @param success - Whether fetch succeeded
 * @param durationMs - Fetch duration
 * @param recordCount - Number of records fetched
 */
export function logDataSourceFetch(
  logger: SnapshotLogger,
  cycleId: string,
  source: string,
  success: boolean,
  durationMs: number,
  recordCount?: number
): void {
  const level: LogLevel = success ? "debug" : "warn";

  logger[level]({
    level,
    message: success ? `Data source fetched: ${source}` : `Data source fetch failed: ${source}`,
    timestamp: new Date().toISOString(),
    cycleId,
    fields: {
      dataSource: source,
      success,
      durationMs,
      recordCount,
      phase: "fetch",
    },
  });
}

/**
 * Log validation result.
 *
 * @param logger - Logger to use
 * @param cycleId - Trading cycle ID
 * @param valid - Whether validation passed
 * @param errors - Validation errors (if any)
 */
export function logValidationResult(
  logger: SnapshotLogger,
  cycleId: string,
  valid: boolean,
  errors: string[] = []
): void {
  const level: LogLevel = valid ? "info" : "error";

  logger[level]({
    level,
    message: valid
      ? "Snapshot validation passed"
      : `Snapshot validation failed: ${errors.length} errors`,
    timestamp: new Date().toISOString(),
    cycleId,
    fields: {
      valid,
      errorCount: errors.length,
      errors: errors.slice(0, 5), // Limit errors in log
      phase: "validation",
    },
  });
}

// ============================================
// Metrics Extraction
// ============================================

/**
 * Extract assembly metrics from a snapshot.
 *
 * @param snapshot - Market snapshot
 * @param cycleId - Trading cycle ID
 * @param performanceMetrics - Performance metrics from tracker
 * @param sizeEstimate - Size estimate
 * @returns Assembly metrics
 */
export function extractSnapshotMetrics(
  snapshot: MarketSnapshot,
  cycleId: string,
  performanceMetrics: SnapshotPerformanceMetrics,
  sizeEstimate: SnapshotSizeEstimate
): SnapshotAssemblyMetrics {
  // Count candles across all symbols
  const candleCount = (snapshot.symbols ?? []).reduce((sum, s) => sum + (s.bars?.length ?? 0), 0);

  // Count positions (would need to be passed in - using 0 as placeholder)
  const positionCount = 0;

  // Count events (would need external context - using 0 as placeholder)
  const eventCount = 0;

  return {
    cycleId,
    environment: snapshot.environment,
    universeSize: snapshot.symbols?.length ?? 0,
    positionCount,
    candleCount,
    eventCount,
    assemblyTimeMs: performanceMetrics.totalMs,
    snapshotSizeBytes: sizeEstimate.bytes,
    tokenEstimate: sizeEstimate.tokens,
    validationErrors: [],
    dataSources: ["polygon", "indicators", "regime"],
    warnings: performanceMetrics.warnings,
  };
}

// ============================================
// Snapshot Diff Utility
// ============================================

/**
 * Compare two snapshots and return differences.
 *
 * @param previous - Previous snapshot
 * @param current - Current snapshot
 * @param options - Diff options
 * @returns Diff result
 */
export function diffSnapshots(
  previous: MarketSnapshot,
  current: MarketSnapshot,
  options: SnapshotDiffOptions = {}
): SnapshotDiffResult {
  const { includeBars = false, includeQuotes = false, maxDiffs = 100 } = options;

  const diffs: SnapshotDiffEntry[] = [];
  const summary = {
    symbolsAdded: [] as string[],
    symbolsRemoved: [] as string[],
    symbolsModified: [] as string[],
    regimeChanged: previous.regime !== current.regime,
    marketStatusChanged: previous.marketStatus !== current.marketStatus,
  };

  // Compare regime
  if (summary.regimeChanged) {
    diffs.push({
      path: "regime",
      previous: previous.regime,
      current: current.regime,
      changeType: "modified",
    });
  }

  // Compare market status
  if (summary.marketStatusChanged) {
    diffs.push({
      path: "marketStatus",
      previous: previous.marketStatus,
      current: current.marketStatus,
      changeType: "modified",
    });
  }

  // Build symbol maps
  const prevSymbols = new Map((previous.symbols ?? []).map((s) => [s.symbol, s]));
  const currSymbols = new Map((current.symbols ?? []).map((s) => [s.symbol, s]));

  // Find added symbols
  for (const [symbol] of currSymbols) {
    if (!prevSymbols.has(symbol)) {
      summary.symbolsAdded.push(symbol);
      diffs.push({
        path: `symbols.${symbol}`,
        previous: undefined,
        current: symbol,
        changeType: "added",
      });
    }
  }

  // Find removed symbols
  for (const [symbol] of prevSymbols) {
    if (!currSymbols.has(symbol)) {
      summary.symbolsRemoved.push(symbol);
      diffs.push({
        path: `symbols.${symbol}`,
        previous: symbol,
        current: undefined,
        changeType: "removed",
      });
    }
  }

  // Compare matching symbols
  for (const [symbol, currSymbol] of currSymbols) {
    const prevSymbol = prevSymbols.get(symbol);
    if (!prevSymbol) {
      continue;
    }

    const symbolDiffs = diffSymbolSnapshots(
      prevSymbol,
      currSymbol,
      symbol,
      includeBars,
      includeQuotes
    );
    if (symbolDiffs.length > 0) {
      summary.symbolsModified.push(symbol);
      diffs.push(...symbolDiffs);
    }
  }

  // Limit diffs
  const limitedDiffs = diffs.slice(0, maxDiffs);

  return {
    identical: diffs.length === 0,
    diffCount: diffs.length,
    diffs: limitedDiffs,
    summary,
  };
}

/**
 * Compare two symbol snapshots.
 */
function diffSymbolSnapshots(
  previous: SymbolSnapshot,
  current: SymbolSnapshot,
  symbol: string,
  includeBars: boolean,
  includeQuotes: boolean
): SnapshotDiffEntry[] {
  const diffs: SnapshotDiffEntry[] = [];

  // Compare day stats
  if (previous.dayHigh !== current.dayHigh) {
    diffs.push({
      path: `symbols.${symbol}.dayHigh`,
      previous: previous.dayHigh,
      current: current.dayHigh,
      changeType: "modified",
    });
  }

  if (previous.dayLow !== current.dayLow) {
    diffs.push({
      path: `symbols.${symbol}.dayLow`,
      previous: previous.dayLow,
      current: current.dayLow,
      changeType: "modified",
    });
  }

  // Compare quotes if requested
  if (includeQuotes && previous.quote && current.quote) {
    if (previous.quote.last !== current.quote.last) {
      diffs.push({
        path: `symbols.${symbol}.quote.last`,
        previous: previous.quote.last,
        current: current.quote.last,
        changeType: "modified",
      });
    }

    if (previous.quote.bid !== current.quote.bid) {
      diffs.push({
        path: `symbols.${symbol}.quote.bid`,
        previous: previous.quote.bid,
        current: current.quote.bid,
        changeType: "modified",
      });
    }

    if (previous.quote.ask !== current.quote.ask) {
      diffs.push({
        path: `symbols.${symbol}.quote.ask`,
        previous: previous.quote.ask,
        current: current.quote.ask,
        changeType: "modified",
      });
    }
  }

  // Compare bar count if bars included
  if (includeBars) {
    const prevBars = previous.bars?.length ?? 0;
    const currBars = current.bars?.length ?? 0;
    if (prevBars !== currBars) {
      diffs.push({
        path: `symbols.${symbol}.bars.length`,
        previous: prevBars,
        current: currBars,
        changeType: "modified",
      });
    }
  }

  return diffs;
}

/**
 * Format diff result as human-readable string.
 *
 * @param diff - Diff result
 * @returns Formatted string
 */
export function formatSnapshotDiff(diff: SnapshotDiffResult): string {
  if (diff.identical) {
    return "Snapshots are identical";
  }

  const parts: string[] = [];
  parts.push(`${diff.diffCount} differences found:`);

  if (diff.summary.regimeChanged) {
    parts.push("  - Regime changed");
  }

  if (diff.summary.marketStatusChanged) {
    parts.push("  - Market status changed");
  }

  if (diff.summary.symbolsAdded.length > 0) {
    parts.push(
      `  - ${diff.summary.symbolsAdded.length} symbols added: ${diff.summary.symbolsAdded.slice(0, 5).join(", ")}`
    );
  }

  if (diff.summary.symbolsRemoved.length > 0) {
    parts.push(
      `  - ${diff.summary.symbolsRemoved.length} symbols removed: ${diff.summary.symbolsRemoved.slice(0, 5).join(", ")}`
    );
  }

  if (diff.summary.symbolsModified.length > 0) {
    parts.push(
      `  - ${diff.summary.symbolsModified.length} symbols modified: ${diff.summary.symbolsModified.slice(0, 5).join(", ")}`
    );
  }

  return parts.join("\n");
}

// ============================================
// Log Entry Formatting
// ============================================

/**
 * Format log entry for console output.
 *
 * @param entry - Log entry
 * @returns Formatted string
 */
export function formatLogEntry(entry: SnapshotLogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.cycleId ? `[${entry.cycleId}]` : "",
    entry.message,
  ].filter(Boolean);

  if (Object.keys(entry.fields).length > 0) {
    parts.push(JSON.stringify(entry.fields));
  }

  return parts.join(" ");
}

/**
 * Create a log entry for a given level.
 *
 * @param level - Log level
 * @param message - Log message
 * @param fields - Additional fields
 * @param cycleId - Optional cycle ID
 * @param environment - Optional environment
 * @returns Log entry
 */
export function createLogEntry(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
  cycleId?: string,
  environment?: string
): SnapshotLogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    cycleId,
    environment,
    fields,
  };
}
