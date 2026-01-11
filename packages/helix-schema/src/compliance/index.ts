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
  AuditEntityType,
  type AuditLogEntry,
  // Schemas
  AuditLogEntrySchema,
  // Audit Logger
  AuditLogger,
  type AuditLoggerConfig,
  // Enums
  AuditOperationType,
  // Retention
  AuditRetentionPolicy,
  type AuditStorage,
  type AuditTrailQuery,
  AuditTrailQuerySchema,
  // Immutability
  checkImmutability,
  type ImmutabilityCheckResult,
  ImmutabilityViolationError,
  // Storage implementations
  InMemoryAuditStorage,
  requireMutable,
  type VersionHistoryEntry,
  VersionHistoryEntrySchema,
} from "./audit/index.js";
