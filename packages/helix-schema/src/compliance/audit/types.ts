/**
 * Audit Type Definitions and Schemas
 *
 * Zod schemas and TypeScript types for SEC Rule 17a-4 compliance audit logging.
 *
 * @module @cream/helix-schema/compliance/audit/types
 */

import { z } from "zod";

/**
 * Types of auditable operations.
 */
export const AuditOperationType = {
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  EXECUTE: "EXECUTE",
  CANCEL: "CANCEL",
} as const;

export type AuditOperationType = (typeof AuditOperationType)[keyof typeof AuditOperationType];

/**
 * Entity types that can be audited.
 */
export const AuditEntityType = {
  DECISION_PLAN: "DECISION_PLAN",
  ORDER: "ORDER",
  POSITION: "POSITION",
  ACCOUNT: "ACCOUNT",
  CONSTRAINT: "CONSTRAINT",
  AGENT_OUTPUT: "AGENT_OUTPUT",
  STRATEGY: "STRATEGY",
  CONFIGURATION: "CONFIGURATION",
} as const;

export type AuditEntityType = (typeof AuditEntityType)[keyof typeof AuditEntityType];

/**
 * Schema for an audit log entry.
 *
 * SEC Rule 17a-4 requires:
 * - Accurate timestamps (millisecond precision)
 * - User/system identification
 * - Before/after state for modifications
 * - Immutability (append-only)
 */
export const AuditLogEntrySchema = z.object({
  /** Unique audit entry ID (UUID v7 for time-ordered) */
  id: z.string().uuid(),

  /** Precise timestamp (ISO 8601 with milliseconds) */
  timestamp: z.string().datetime({ precision: 3 }),

  /** User or system identifier that performed the action */
  actor: z.object({
    /** Type of actor */
    type: z.enum(["user", "system", "agent"]),
    /** Actor identifier */
    id: z.string(),
    /** Actor name for display */
    name: z.string().optional(),
    /** IP address (for user actions) */
    ipAddress: z.string().optional(),
  }),

  /** Operation type */
  operation: z.nativeEnum(AuditOperationType),

  /** Entity type being operated on */
  entityType: z.nativeEnum(AuditEntityType),

  /** Unique identifier of the entity */
  entityId: z.string(),

  /** Environment where operation occurred */
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),

  /** State before the operation (for UPDATE/DELETE) */
  beforeState: z.unknown().optional(),

  /** State after the operation (for INSERT/UPDATE) */
  afterState: z.unknown().optional(),

  /** Human-readable description of the change */
  description: z.string().optional(),

  /** Additional metadata */
  metadata: z
    .object({
      /** Correlation ID for tracing */
      correlationId: z.string().optional(),
      /** Request ID */
      requestId: z.string().optional(),
      /** Session ID */
      sessionId: z.string().optional(),
      /** Reason for the operation */
      reason: z.string().optional(),
    })
    .optional(),

  /** Hash of the previous entry (for tamper detection) */
  previousHash: z.string().optional(),

  /** SHA-256 hash of this entry (computed on storage) */
  entryHash: z.string().optional(),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/**
 * Schema for audit trail query parameters.
 */
export const AuditTrailQuerySchema = z.object({
  /** Filter by entity type */
  entityType: z.nativeEnum(AuditEntityType).optional(),

  /** Filter by entity ID */
  entityId: z.string().optional(),

  /** Filter by actor ID */
  actorId: z.string().optional(),

  /** Filter by operation type */
  operation: z.nativeEnum(AuditOperationType).optional(),

  /** Filter by environment */
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]).optional(),

  /** Start timestamp (inclusive) */
  startTime: z.string().datetime().optional(),

  /** End timestamp (inclusive) */
  endTime: z.string().datetime().optional(),

  /** Maximum number of results */
  limit: z.number().int().positive().max(1000).default(100),

  /** Offset for pagination */
  offset: z.number().int().nonnegative().default(0),
});

export type AuditTrailQuery = z.infer<typeof AuditTrailQuerySchema>;

/**
 * Schema for version history entry.
 */
export const VersionHistoryEntrySchema = z.object({
  /** Version number (monotonically increasing) */
  version: z.number().int().positive(),

  /** Timestamp of this version */
  timestamp: z.string().datetime({ precision: 3 }),

  /** Actor who created this version */
  actorId: z.string(),

  /** The state at this version */
  state: z.unknown(),

  /** Hash of the state for integrity verification */
  stateHash: z.string(),
});

export type VersionHistoryEntry = z.infer<typeof VersionHistoryEntrySchema>;
