/**
 * Access Tracking Module
 *
 * Provides functions for tracking node access patterns,
 * which feeds into the frequency factor of retention scoring.
 */

import type { AccessRecord } from "./types.js";

/**
 * Update access tracking for a node.
 *
 * @param existing - Existing access record (or undefined for new)
 * @param nodeId - Node ID
 * @param accessTime - Time of access (default: now)
 * @returns Updated access record
 */
export function recordAccess(
	existing: AccessRecord | undefined,
	nodeId: string,
	accessTime: Date = new Date()
): AccessRecord {
	if (!existing) {
		return {
			nodeId,
			accessCount: 1,
			lastAccessedAt: accessTime,
			firstAccessedAt: accessTime,
		};
	}

	return {
		...existing,
		accessCount: existing.accessCount + 1,
		lastAccessedAt: accessTime,
	};
}

/**
 * Calculate days since last access for recency boost.
 *
 * @param record - Access record
 * @param referenceDate - Reference date (default: now)
 * @returns Days since last access
 */
export function daysSinceLastAccess(
	record: AccessRecord,
	referenceDate: Date = new Date()
): number {
	const diffMs = referenceDate.getTime() - record.lastAccessedAt.getTime();
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
