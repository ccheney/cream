/**
 * Snapshot Logging and Observability
 *
 * Re-exports from modular snapshot-logging directory for backward compatibility.
 *
 * @see ./snapshot-logging/index.ts for the modular implementation
 * @see docs/plans/03-market-snapshot.md
 */

export {
	// Loggers
	createConsoleLogger,
	// Formatters
	createLogEntry,
	createNoOpLogger,
	defaultSnapshotLogger,
	// Diff utilities
	diffSnapshots,
	// Logging functions
	extractSnapshotMetrics,
	formatLogEntry,
	formatSnapshotDiff,
	// Types
	type LogLevel,
	logDataSourceFetch,
	logSnapshotComplete,
	logSnapshotError,
	logSnapshotStart,
	logValidationResult,
	// Redaction
	redactObject,
	redactSensitiveData,
	type SnapshotAssemblyMetrics,
	type SnapshotDiffEntry,
	type SnapshotDiffOptions,
	type SnapshotDiffResult,
	type SnapshotLogEntry,
	type SnapshotLogger,
} from "./snapshot-logging/index.js";
