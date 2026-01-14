/**
 * Relationship Query Functions
 *
 * Domain-specific relationship queries for trading decisions,
 * events, and lifecycle management.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import { getNeighbors } from "./traversal.js";
import type { GraphNode } from "./types.js";

/**
 * Get events that influenced a trade decision.
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Events that influenced this decision
 */
export async function getInfluencingEvents(
	client: HelixClient,
	decisionId: string
): Promise<GraphNode[]> {
	return getNeighbors(client, decisionId, {
		edgeTypes: ["INFLUENCED_DECISION"],
		direction: "incoming",
	});
}

/**
 * Get decisions influenced by an event.
 *
 * @param client - HelixDB client
 * @param eventId - External event ID
 * @returns Decisions influenced by this event
 */
export async function getInfluencedDecisions(
	client: HelixClient,
	eventId: string
): Promise<GraphNode[]> {
	return getNeighbors(client, eventId, {
		edgeTypes: ["INFLUENCED_DECISION"],
		direction: "outgoing",
	});
}

/**
 * Get trade lifecycle events for a decision.
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Lifecycle events for this decision
 */
export async function getLifecycleEvents(
	client: HelixClient,
	decisionId: string
): Promise<GraphNode[]> {
	return getNeighbors(client, decisionId, {
		edgeTypes: ["HAS_EVENT"],
		direction: "outgoing",
	});
}
