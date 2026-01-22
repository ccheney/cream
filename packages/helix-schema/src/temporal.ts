/**
 * Temporal Edge Properties
 *
 * Bi-temporal model for HelixDB edges enabling point-in-time graph queries.
 * Based on Zep's temporal approach (event time + ingestion time).
 *
 * @see docs/plans/04-memory-helixdb.md:863-864
 * @see https://arxiv.org/abs/2501.13956 (Zep temporal model reference)
 */

// ============================================
// Core Temporal Types
// ============================================

/**
 * Temporal properties for bi-temporal edge tracking.
 *
 * Enables:
 * - Point-in-time queries: "What were AAPL's suppliers in Q3 2024?"
 * - Event reconstruction: "What did we know at decision time?"
 * - Relationship evolution: "When did this partnership change?"
 *
 * @example
 * ```typescript
 * // Edge indicating AAPL depends on TSMC for chips
 * const edge: TemporalEdgeProperties = {
 *   valid_from: Date.parse("2020-01-01"),   // Relationship started
 *   valid_to: undefined,                     // Still current
 *   recorded_at: Date.parse("2024-06-15"),  // When we learned this
 * };
 * ```
 */
export interface TemporalEdgeProperties {
	/**
	 * Unix timestamp (ms) when the relationship started in reality.
	 * Event time - when this relationship actually began.
	 */
	valid_from: number;

	/**
	 * Unix timestamp (ms) when the relationship ended.
	 * null/undefined = relationship is current/active.
	 */
	valid_to?: number;

	/**
	 * Unix timestamp (ms) when we recorded this relationship.
	 * Ingestion time - when the system learned about this.
	 * Enables "what did we know at time X?" queries.
	 */
	recorded_at: number;
}

/**
 * Point-in-time query options for temporal graph traversal.
 */
export interface TemporalQueryOptions {
	/**
	 * Query timestamp - only include edges active at this point in time.
	 * If not provided, returns all edges (including historical).
	 */
	asOfTimestamp?: number;

	/**
	 * Include only edges we knew about by this timestamp.
	 * Enables "what did we know at time X?" reconstruction.
	 * If not provided, includes all recorded edges.
	 */
	knownAsOfTimestamp?: number;

	/**
	 * Include expired edges (where valid_to < asOfTimestamp).
	 * Default: false (only include active edges).
	 */
	includeExpired?: boolean;
}

// ============================================
// Temporal Edge Predicates
// ============================================

/**
 * Check if an edge is active at a given point in time.
 *
 * Edge is active when:
 * - valid_from <= asOfTimestamp
 * - valid_to is null OR valid_to > asOfTimestamp
 *
 * @param edge - Edge properties (may include temporal fields)
 * @param asOfTimestamp - Point in time to check (Unix ms)
 * @returns true if edge is active at that time
 *
 * @example
 * ```typescript
 * const edge = { valid_from: jan2024, valid_to: undefined };
 * isEdgeActiveAt(edge, feb2024);  // true
 * isEdgeActiveAt(edge, dec2023);  // false (before valid_from)
 * ```
 */
export function isEdgeActiveAt(
	edge: Partial<TemporalEdgeProperties>,
	asOfTimestamp: number,
): boolean {
	// No temporal data - treat as always active
	if (edge.valid_from === undefined) {
		return true;
	}

	// Must have started before or at query time
	if (edge.valid_from > asOfTimestamp) {
		return false;
	}

	// If not expired, it's active
	if (edge.valid_to === undefined || edge.valid_to === null) {
		return true;
	}

	// Check if expired before query time
	return edge.valid_to > asOfTimestamp;
}

/**
 * Check if we knew about an edge by a given timestamp.
 *
 * @param edge - Edge properties (may include recorded_at)
 * @param knownAsOfTimestamp - Point in time to check (Unix ms)
 * @returns true if edge was recorded by that time
 */
export function wasEdgeKnownAt(
	edge: Partial<TemporalEdgeProperties>,
	knownAsOfTimestamp: number,
): boolean {
	// No recorded_at - treat as always known
	if (edge.recorded_at === undefined) {
		return true;
	}

	return edge.recorded_at <= knownAsOfTimestamp;
}

/**
 * Check if an edge matches temporal query criteria.
 *
 * Combines:
 * 1. Event time check (isEdgeActiveAt)
 * 2. Ingestion time check (wasEdgeKnownAt)
 *
 * @param edge - Edge properties
 * @param options - Temporal query options
 * @returns true if edge should be included in results
 */
export function matchesTemporalQuery(
	edge: Partial<TemporalEdgeProperties>,
	options: TemporalQueryOptions,
): boolean {
	// Check event time (when relationship existed)
	if (options.asOfTimestamp !== undefined) {
		const isActive = isEdgeActiveAt(edge, options.asOfTimestamp);

		// If not active and we don't want expired edges, exclude
		if (!isActive && !options.includeExpired) {
			return false;
		}
	}

	// Check ingestion time (when we knew about it)
	if (options.knownAsOfTimestamp !== undefined) {
		if (!wasEdgeKnownAt(edge, options.knownAsOfTimestamp)) {
			return false;
		}
	}

	return true;
}

// ============================================
// Temporal Edge Creation
// ============================================

/**
 * Create temporal properties for a new edge.
 *
 * @param validFrom - When relationship started (defaults to now)
 * @param validTo - When relationship ended (undefined = current)
 * @returns Temporal edge properties with recorded_at = now
 *
 * @example
 * ```typescript
 * // New relationship starting now
 * const props = createTemporalEdge();
 *
 * // Relationship that started in the past
 * const props = createTemporalEdge(Date.parse("2023-01-01"));
 *
 * // Historical relationship (already ended)
 * const props = createTemporalEdge(
 *   Date.parse("2020-01-01"),
 *   Date.parse("2023-06-30")
 * );
 * ```
 */
export function createTemporalEdge(
	validFrom: number = Date.now(),
	validTo?: number,
): TemporalEdgeProperties {
	return {
		valid_from: validFrom,
		valid_to: validTo,
		recorded_at: Date.now(),
	};
}

/**
 * Expire an edge at a given timestamp.
 *
 * @param edge - Current edge properties
 * @param expiredAt - When the relationship ended (defaults to now)
 * @returns Updated temporal properties with valid_to set
 */
export function expireEdge(
	edge: TemporalEdgeProperties,
	expiredAt: number = Date.now(),
): TemporalEdgeProperties {
	return {
		...edge,
		valid_to: expiredAt,
	};
}

// ============================================
// Migration Helpers
// ============================================

/**
 * Add temporal properties to an existing edge for migration.
 *
 * For existing edges without temporal data:
 * - valid_from = created_at or migration timestamp
 * - valid_to = null (assume still current)
 * - recorded_at = migration timestamp
 *
 * @param existingEdge - Edge properties that may have created_at
 * @param migrationTimestamp - When migration is running
 * @returns Edge with temporal properties added
 */
export function addTemporalPropertiesToEdge(
	existingEdge: Record<string, unknown>,
	migrationTimestamp: number = Date.now(),
): TemporalEdgeProperties {
	// Try to extract created_at from existing edge
	let validFrom = migrationTimestamp;

	if (typeof existingEdge.created_at === "string") {
		const parsed = Date.parse(existingEdge.created_at);
		if (!Number.isNaN(parsed)) {
			validFrom = parsed;
		}
	} else if (typeof existingEdge.created_at === "number") {
		validFrom = existingEdge.created_at;
	} else if (typeof existingEdge.timestamp === "string") {
		const parsed = Date.parse(existingEdge.timestamp);
		if (!Number.isNaN(parsed)) {
			validFrom = parsed;
		}
	} else if (typeof existingEdge.timestamp === "number") {
		validFrom = existingEdge.timestamp;
	}

	return {
		valid_from: validFrom,
		valid_to: undefined,
		recorded_at: migrationTimestamp,
	};
}

// ============================================
// Temporal Statistics
// ============================================

/**
 * Statistics about temporal edges in a result set.
 */
export interface TemporalEdgeStats {
	/** Total edges examined */
	totalEdges: number;
	/** Edges with temporal data */
	temporalEdges: number;
	/** Edges without temporal data (legacy) */
	legacyEdges: number;
	/** Active edges (valid_to is null/undefined) */
	activeEdges: number;
	/** Expired edges (valid_to is set) */
	expiredEdges: number;
	/** Earliest valid_from timestamp */
	earliestValidFrom?: number;
	/** Latest valid_to timestamp (among expired) */
	latestValidTo?: number;
}

/**
 * Calculate statistics about temporal edges.
 *
 * @param edges - Array of edge properties
 * @returns Statistics about temporal coverage
 */
export function calculateTemporalStats(
	edges: Array<Partial<TemporalEdgeProperties>>,
): TemporalEdgeStats {
	const stats: TemporalEdgeStats = {
		totalEdges: edges.length,
		temporalEdges: 0,
		legacyEdges: 0,
		activeEdges: 0,
		expiredEdges: 0,
	};

	for (const edge of edges) {
		if (edge.valid_from !== undefined) {
			stats.temporalEdges++;

			if (edge.valid_to === undefined || edge.valid_to === null) {
				stats.activeEdges++;
			} else {
				stats.expiredEdges++;
				if (stats.latestValidTo === undefined || edge.valid_to > stats.latestValidTo) {
					stats.latestValidTo = edge.valid_to;
				}
			}

			if (stats.earliestValidFrom === undefined || edge.valid_from < stats.earliestValidFrom) {
				stats.earliestValidFrom = edge.valid_from;
			}
		} else {
			stats.legacyEdges++;
			stats.activeEdges++; // Legacy edges treated as active
		}
	}

	return stats;
}
