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

import { z } from "zod";

// =============================================================================
// Audit Log Schemas
// =============================================================================

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

// =============================================================================
// Audit Logger
// =============================================================================

/**
 * Configuration for the audit logger.
 */
export interface AuditLoggerConfig {
  /** Storage backend for audit logs */
  storage: AuditStorage;
  /** Whether to compute entry hashes (for tamper detection) */
  computeHashes: boolean;
  /** Whether to link entries with previous hash (blockchain-like) */
  chainEntries: boolean;
  /** Environment */
  environment: "BACKTEST" | "PAPER" | "LIVE";
}

/**
 * Interface for audit log storage backends.
 */
export interface AuditStorage {
  /** Append a new audit entry (must be immutable) */
  append(entry: AuditLogEntry): Promise<void>;

  /** Query audit entries */
  query(params: AuditTrailQuery): Promise<AuditLogEntry[]>;

  /** Get audit trail for a specific entity */
  getEntityTrail(entityType: AuditEntityType, entityId: string): Promise<AuditLogEntry[]>;

  /** Get the latest entry (for hash chaining) */
  getLatestEntry(): Promise<AuditLogEntry | null>;

  /** Verify integrity of an entry */
  verifyIntegrity(entry: AuditLogEntry): Promise<boolean>;
}

/**
 * Audit logger implementation.
 */
export class AuditLogger {
  private readonly config: AuditLoggerConfig;

  constructor(config: AuditLoggerConfig) {
    this.config = config;
  }

  /**
   * Log an audit entry.
   */
  async log(params: {
    actor: AuditLogEntry["actor"];
    operation: AuditOperationType;
    entityType: AuditEntityType;
    entityId: string;
    beforeState?: unknown;
    afterState?: unknown;
    description?: string;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    let previousHash: string | undefined;

    // Get previous hash for chaining
    if (this.config.chainEntries) {
      const latest = await this.config.storage.getLatestEntry();
      previousHash = latest?.entryHash;
    }

    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: params.actor,
      operation: params.operation,
      entityType: params.entityType,
      entityId: params.entityId,
      environment: this.config.environment,
      beforeState: params.beforeState,
      afterState: params.afterState,
      description: params.description,
      metadata: params.metadata,
      previousHash,
    };

    // Compute entry hash if configured
    if (this.config.computeHashes) {
      entry.entryHash = await this.computeHash(entry);
    }

    // Append to storage (immutable operation)
    await this.config.storage.append(entry);

    return entry;
  }

  /**
   * Log an INSERT operation.
   */
  async logInsert(params: {
    actor: AuditLogEntry["actor"];
    entityType: AuditEntityType;
    entityId: string;
    state: unknown;
    description?: string;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.INSERT,
      entityType: params.entityType,
      entityId: params.entityId,
      afterState: params.state,
      description: params.description ?? `Created ${params.entityType} ${params.entityId}`,
      metadata: params.metadata,
    });
  }

  /**
   * Log an UPDATE operation.
   */
  async logUpdate(params: {
    actor: AuditLogEntry["actor"];
    entityType: AuditEntityType;
    entityId: string;
    beforeState: unknown;
    afterState: unknown;
    description?: string;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.UPDATE,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: params.beforeState,
      afterState: params.afterState,
      description: params.description ?? `Updated ${params.entityType} ${params.entityId}`,
      metadata: params.metadata,
    });
  }

  /**
   * Log a DELETE operation.
   */
  async logDelete(params: {
    actor: AuditLogEntry["actor"];
    entityType: AuditEntityType;
    entityId: string;
    beforeState: unknown;
    reason?: string;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.DELETE,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: params.beforeState,
      description: `Deleted ${params.entityType} ${params.entityId}${params.reason ? `: ${params.reason}` : ""}`,
      metadata: params.metadata,
    });
  }

  /**
   * Log a decision plan approval.
   */
  async logApproval(params: {
    actor: AuditLogEntry["actor"];
    entityId: string;
    state: unknown;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.APPROVE,
      entityType: AuditEntityType.DECISION_PLAN,
      entityId: params.entityId,
      afterState: params.state,
      description: `Approved decision plan ${params.entityId}`,
      metadata: params.metadata,
    });
  }

  /**
   * Log a decision plan rejection.
   */
  async logRejection(params: {
    actor: AuditLogEntry["actor"];
    entityId: string;
    state: unknown;
    reason: string;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.REJECT,
      entityType: AuditEntityType.DECISION_PLAN,
      entityId: params.entityId,
      afterState: params.state,
      description: `Rejected decision plan ${params.entityId}: ${params.reason}`,
      metadata: { ...params.metadata, reason: params.reason },
    });
  }

  /**
   * Log an order execution.
   */
  async logExecution(params: {
    actor: AuditLogEntry["actor"];
    entityId: string;
    beforeState: unknown;
    afterState: unknown;
    metadata?: AuditLogEntry["metadata"];
  }): Promise<AuditLogEntry> {
    return this.log({
      actor: params.actor,
      operation: AuditOperationType.EXECUTE,
      entityType: AuditEntityType.ORDER,
      entityId: params.entityId,
      beforeState: params.beforeState,
      afterState: params.afterState,
      description: `Executed order ${params.entityId}`,
      metadata: params.metadata,
    });
  }

  /**
   * Get audit trail for an entity.
   */
  async getEntityTrail(
    entityType: AuditEntityType,
    entityId: string
  ): Promise<AuditLogEntry[]> {
    return this.config.storage.getEntityTrail(entityType, entityId);
  }

  /**
   * Query audit logs.
   */
  async query(params: AuditTrailQuery): Promise<AuditLogEntry[]> {
    return this.config.storage.query(params);
  }

  /**
   * Verify the integrity of an audit entry.
   */
  async verifyIntegrity(entry: AuditLogEntry): Promise<boolean> {
    if (!this.config.computeHashes || !entry.entryHash) {
      return true; // No hash to verify
    }

    const computedHash = await this.computeHash(entry);
    return computedHash === entry.entryHash;
  }

  /**
   * Verify the integrity of the entire audit chain.
   */
  async verifyChain(entries: AuditLogEntry[]): Promise<{
    valid: boolean;
    brokenAt?: number;
  }> {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;

      // Verify entry hash
      if (!(await this.verifyIntegrity(entry))) {
        return { valid: false, brokenAt: i };
      }

      // Verify chain linkage
      if (this.config.chainEntries && i > 0) {
        const prevEntry = entries[i - 1];
        if (prevEntry && entry.previousHash !== prevEntry.entryHash) {
          return { valid: false, brokenAt: i };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Compute SHA-256 hash of an audit entry.
   */
  private async computeHash(entry: AuditLogEntry): Promise<string> {
    // Create a deterministic string representation
    const hashInput = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      actor: entry.actor,
      operation: entry.operation,
      entityType: entry.entityType,
      entityId: entry.entityId,
      environment: entry.environment,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      previousHash: entry.previousHash,
    });

    // Compute SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

// =============================================================================
// Immutability Enforcement
// =============================================================================

/**
 * Result of immutability check.
 */
export interface ImmutabilityCheckResult {
  /** Whether the entity is immutable */
  immutable: boolean;
  /** Reason for immutability (if immutable) */
  reason?: string;
  /** When the entity became immutable */
  immutableSince?: string;
}

/**
 * Check if an entity is immutable based on environment and type.
 *
 * LIVE trade decisions are always immutable after execution.
 * PAPER trades may be modified for debugging.
 * BACKTEST data is freely modifiable.
 */
export function checkImmutability(params: {
  entityType: AuditEntityType;
  environment: "BACKTEST" | "PAPER" | "LIVE";
  status?: string;
  executedAt?: string;
}): ImmutabilityCheckResult {
  // BACKTEST data is never immutable
  if (params.environment === "BACKTEST") {
    return { immutable: false };
  }

  // LIVE trade decisions are immutable after creation
  if (
    params.environment === "LIVE" &&
    (params.entityType === AuditEntityType.DECISION_PLAN ||
      params.entityType === AuditEntityType.ORDER)
  ) {
    return {
      immutable: true,
      reason: "LIVE trade records are immutable per SEC Rule 17a-4",
      immutableSince: params.executedAt,
    };
  }

  // LIVE positions and accounts are mutable but audited
  if (params.environment === "LIVE") {
    return { immutable: false };
  }

  // PAPER environment - mutable but audited
  return { immutable: false };
}

/**
 * Guard that throws if attempting to modify an immutable entity.
 */
export function requireMutable(params: {
  entityType: AuditEntityType;
  entityId: string;
  environment: "BACKTEST" | "PAPER" | "LIVE";
  status?: string;
  executedAt?: string;
}): void {
  const check = checkImmutability(params);

  if (check.immutable) {
    throw new ImmutabilityViolationError(
      params.entityType,
      params.entityId,
      check.reason ?? "Entity is immutable"
    );
  }
}

/**
 * Error thrown when attempting to modify an immutable entity.
 */
export class ImmutabilityViolationError extends Error {
  constructor(
    public readonly entityType: AuditEntityType,
    public readonly entityId: string,
    public readonly reason: string
  ) {
    super(
      `Cannot modify immutable ${entityType} ${entityId}: ${reason}`
    );
    this.name = "ImmutabilityViolationError";
  }
}

// =============================================================================
// Retention Policy
// =============================================================================

/**
 * Retention policy for audit data.
 *
 * SEC Rule 17a-4 requires:
 * - 6-year minimum retention
 * - First 2 years: easily accessible
 * - Years 3-6: may be archived
 */
export const AuditRetentionPolicy = {
  /** Minimum retention period (6 years in days) */
  MIN_RETENTION_DAYS: 6 * 365,

  /** Hot storage period (2 years in days) */
  HOT_STORAGE_DAYS: 2 * 365,

  /** Archive storage period (4 years in days) */
  ARCHIVE_STORAGE_DAYS: 4 * 365,

  /** Check if a record is within hot storage period */
  isHotStorage(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    return age < this.HOT_STORAGE_DAYS * dayMs;
  },

  /** Check if a record should be archived */
  shouldArchive(timestamp: string): boolean {
    return !this.isHotStorage(timestamp);
  },

  /** Check if a record can be deleted */
  canDelete(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    return age > this.MIN_RETENTION_DAYS * dayMs;
  },

  /** Get retention status for a record */
  getRetentionStatus(timestamp: string): {
    tier: "hot" | "archive" | "deletable";
    daysRemaining: number;
  } {
    const age = Date.now() - new Date(timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const ageDays = Math.floor(age / dayMs);

    if (ageDays < this.HOT_STORAGE_DAYS) {
      return {
        tier: "hot",
        daysRemaining: this.HOT_STORAGE_DAYS - ageDays,
      };
    } else if (ageDays < this.MIN_RETENTION_DAYS) {
      return {
        tier: "archive",
        daysRemaining: this.MIN_RETENTION_DAYS - ageDays,
      };
    } else {
      return {
        tier: "deletable",
        daysRemaining: 0,
      };
    }
  },
} as const;

// =============================================================================
// In-Memory Audit Storage (for testing)
// =============================================================================

/**
 * In-memory audit storage implementation for testing.
 */
export class InMemoryAuditStorage implements AuditStorage {
  private entries: AuditLogEntry[] = [];

  async append(entry: AuditLogEntry): Promise<void> {
    // Immutable append - create new array
    this.entries = [...this.entries, entry];
  }

  async query(params: AuditTrailQuery): Promise<AuditLogEntry[]> {
    let results = [...this.entries];

    // Apply filters
    if (params.entityType) {
      results = results.filter((e) => e.entityType === params.entityType);
    }
    if (params.entityId) {
      results = results.filter((e) => e.entityId === params.entityId);
    }
    if (params.actorId) {
      results = results.filter((e) => e.actor.id === params.actorId);
    }
    if (params.operation) {
      results = results.filter((e) => e.operation === params.operation);
    }
    if (params.environment) {
      results = results.filter((e) => e.environment === params.environment);
    }
    if (params.startTime) {
      results = results.filter((e) => e.timestamp >= params.startTime!);
    }
    if (params.endTime) {
      results = results.filter((e) => e.timestamp <= params.endTime!);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    return results.slice(params.offset, params.offset + params.limit);
  }

  async getEntityTrail(
    entityType: AuditEntityType,
    entityId: string
  ): Promise<AuditLogEntry[]> {
    return this.entries
      .filter((e) => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async getLatestEntry(): Promise<AuditLogEntry | null> {
    if (this.entries.length === 0) {
      return null;
    }
    return this.entries[this.entries.length - 1] ?? null;
  }

  async verifyIntegrity(_entry: AuditLogEntry): Promise<boolean> {
    // In-memory storage always passes integrity check
    return true;
  }

  /** Get all entries (for testing) */
  getAllEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries = [];
  }
}
