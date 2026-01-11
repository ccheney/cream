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

export { diffSnapshots } from "./diff.js";
export { createLogEntry, formatLogEntry, formatSnapshotDiff } from "./formatters.js";
export { createConsoleLogger, createNoOpLogger, defaultSnapshotLogger } from "./loggers.js";
export {
  extractSnapshotMetrics,
  logDataSourceFetch,
  logSnapshotComplete,
  logSnapshotError,
  logSnapshotStart,
  logValidationResult,
} from "./logging.js";
export { redactObject, redactSensitiveData } from "./redaction.js";
export type {
  LogLevel,
  SnapshotAssemblyMetrics,
  SnapshotDiffEntry,
  SnapshotDiffOptions,
  SnapshotDiffResult,
  SnapshotLogEntry,
  SnapshotLogger,
} from "./types.js";
