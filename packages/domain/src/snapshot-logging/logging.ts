/**
 * Snapshot Assembly Logging
 *
 * Logging functions for snapshot assembly events.
 */

import type { MarketSnapshot } from "../marketSnapshot";
import type { SnapshotPerformanceMetrics, SnapshotSizeEstimate } from "../snapshot-limits";
import type { LogLevel, SnapshotAssemblyMetrics, SnapshotLogger } from "./types.js";

/**
 * Log snapshot assembly start.
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
      errors: errors.slice(0, 5),
      phase: "validation",
    },
  });
}

/**
 * Extract assembly metrics from a snapshot.
 */
export function extractSnapshotMetrics(
  snapshot: MarketSnapshot,
  cycleId: string,
  performanceMetrics: SnapshotPerformanceMetrics,
  sizeEstimate: SnapshotSizeEstimate
): SnapshotAssemblyMetrics {
  const candleCount = (snapshot.symbols ?? []).reduce((sum, s) => sum + (s.bars?.length ?? 0), 0);
  const positionCount = 0;
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
