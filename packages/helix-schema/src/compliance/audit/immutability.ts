/**
 * Immutability Enforcement
 *
 * Guards and checks for SEC Rule 17a-4 immutability requirements.
 *
 * @module @cream/helix-schema/compliance/audit/immutability
 */

import { AuditEntityType } from "./types.js";

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
 */
export function checkImmutability(params: {
	entityType: AuditEntityType;
	environment: "PAPER" | "LIVE";
	status?: string;
	executedAt?: string;
}): ImmutabilityCheckResult {

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
	environment: "PAPER" | "LIVE";
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
		super(`Cannot modify immutable ${entityType} ${entityId}: ${reason}`);
		this.name = "ImmutabilityViolationError";
	}
}
