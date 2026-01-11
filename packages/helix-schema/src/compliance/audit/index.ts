/**
 * Compliance and Audit Trail Implementation
 *
 * Implements audit logging mechanisms for SEC Rule 17a-4 and FINRA requirements:
 * - Immutable audit trail for all write operations
 * - 6-year minimum retention (2 years easily accessible)
 * - Point-in-time recovery capability
 * - Version history for updateable fields
 *
 * Reference: docs/plans/04-memory-helixdb.md
 *
 * @module @cream/helix-schema/compliance/audit
 */

// Immutability
export {
  checkImmutability,
  type ImmutabilityCheckResult,
  ImmutabilityViolationError,
  requireMutable,
} from "./immutability.js";
// Logger
export { AuditLogger, type AuditLoggerConfig } from "./logger.js";
// Retention
export { AuditRetentionPolicy } from "./retention.js";
// Storage
export { type AuditStorage, InMemoryAuditStorage } from "./storage.js";
// Types and schemas
export {
  AuditEntityType,
  type AuditLogEntry,
  AuditLogEntrySchema,
  AuditOperationType,
  type AuditTrailQuery,
  AuditTrailQuerySchema,
  type VersionHistoryEntry,
  VersionHistoryEntrySchema,
} from "./types.js";
