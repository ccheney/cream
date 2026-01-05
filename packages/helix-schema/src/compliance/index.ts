/**
 * Compliance Module - SEC Rule 17a-4 and FINRA Requirements
 *
 * This module provides compliance and audit trail mechanisms for LIVE trading:
 * - Immutable audit logs for all write operations
 * - 6-year retention (2 years hot, 4 years archive)
 * - Point-in-time recovery capability
 * - Tamper detection via hash chains
 *
 * Reference: docs/plans/04-memory-helixdb.md
 *
 * @module @cream/helix-schema/compliance
 */

// Audit logging
export {
  // Schemas
  AuditLogEntrySchema,
  type AuditLogEntry,
  AuditTrailQuerySchema,
  type AuditTrailQuery,
  VersionHistoryEntrySchema,
  type VersionHistoryEntry,
  // Enums
  AuditOperationType,
  AuditEntityType,
  // Audit Logger
  AuditLogger,
  type AuditLoggerConfig,
  type AuditStorage,
  // Immutability
  checkImmutability,
  type ImmutabilityCheckResult,
  requireMutable,
  ImmutabilityViolationError,
  // Retention
  AuditRetentionPolicy,
  // Storage implementations
  InMemoryAuditStorage,
} from "./audit";
