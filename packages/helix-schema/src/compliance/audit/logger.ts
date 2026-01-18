/**
 * Audit Logger Implementation
 *
 * Core audit logging class for SEC Rule 17a-4 compliance.
 *
 * @module @cream/helix-schema/compliance/audit/logger
 */

import type { AuditStorage } from "./storage.js";
import { type AuditEntityType, type AuditLogEntry, AuditOperationType } from "./types.js";

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
	environment: "PAPER" | "LIVE";
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
			entityType: "DECISION_PLAN" as AuditEntityType,
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
			entityType: "DECISION_PLAN" as AuditEntityType,
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
			entityType: "ORDER" as AuditEntityType,
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
	async getEntityTrail(entityType: AuditEntityType, entityId: string): Promise<AuditLogEntry[]> {
		return this.config.storage.getEntityTrail(entityType, entityId);
	}

	/**
	 * Query audit logs.
	 */
	async query(params: {
		entityType?: AuditEntityType;
		entityId?: string;
		actorId?: string;
		operation?: AuditOperationType;
		environment?: "PAPER" | "LIVE";
		startTime?: string;
		endTime?: string;
		limit: number;
		offset: number;
	}): Promise<AuditLogEntry[]> {
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
			if (!entry) {
				continue;
			}

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
