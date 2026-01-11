/**
 * Audit Storage Interfaces and Implementations
 *
 * Storage backends for SEC Rule 17a-4 compliant audit logging.
 *
 * @module @cream/helix-schema/compliance/audit/storage
 */

import type { AuditEntityType, AuditLogEntry, AuditTrailQuery } from "./types.js";

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
      const startTime = params.startTime;
      results = results.filter((e) => e.timestamp >= startTime);
    }
    if (params.endTime) {
      const endTime = params.endTime;
      results = results.filter((e) => e.timestamp <= endTime);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    return results.slice(params.offset, params.offset + params.limit);
  }

  async getEntityTrail(entityType: AuditEntityType, entityId: string): Promise<AuditLogEntry[]> {
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
