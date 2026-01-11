/**
 * Snapshot Logging Formatters
 *
 * Formatting and serialization functions for log entries and snapshot diffs.
 */

import type { LogLevel, SnapshotDiffResult, SnapshotLogEntry } from "./types.js";

/**
 * Format log entry for console output.
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

/**
 * Format diff result as human-readable string.
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
