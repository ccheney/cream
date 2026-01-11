/**
 * Snapshot Logging Types
 *
 * Type definitions for snapshot logging and observability.
 */

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
