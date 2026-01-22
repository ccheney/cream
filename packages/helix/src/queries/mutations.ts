/**
 * HelixDB Mutation Helpers
 *
 * Type-safe helpers for node and edge creation/update operations.
 * Supports batch operations for performance.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type {
	ExternalEvent,
	HasEventEdge,
	InfluencedDecisionEdge,
	ThesisIncludesEdge,
	TradeDecision,
	TradeLifecycleEvent,
} from "@cream/helix-schema";
import type { HelixClient } from "../client";

// ============================================
// Types
// ============================================

/**
 * Result of a single mutation operation.
 */
export interface MutationResult {
	success: boolean;
	id: string;
	error?: string;
}

/**
 * Result of a batch mutation operation.
 */
export interface BatchMutationResult {
	successful: MutationResult[];
	failed: MutationResult[];
	totalProcessed: number;
	executionTimeMs: number;
}

/**
 * Node with embedding for upsert.
 */
export interface NodeWithEmbedding<T> {
	node: T;
	embedding?: number[];
	embeddingModelVersion?: string;
}

/**
 * Edge creation input.
 */
export interface EdgeInput {
	sourceId: string;
	targetId: string;
	edgeType: string;
	properties?: Record<string, unknown>;
}

// ============================================
// Single Node Operations
// ============================================

/**
 * Upsert a TradeDecision node.
 *
 * Creates or updates based on decision_id.
 */
export async function upsertTradeDecision(
	client: HelixClient,
	decision: TradeDecision,
	embedding?: number[],
	embeddingModelVersion?: string,
): Promise<MutationResult> {
	try {
		const params: Record<string, unknown> = {
			...decision,
			embedding,
			embedding_model_version: embeddingModelVersion,
		};

		await client.query("upsertTradeDecision", params);

		return {
			success: true,
			id: decision.decision_id,
		};
	} catch (error) {
		return {
			success: false,
			id: decision.decision_id,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Create a TradeLifecycleEvent node.
 */
export async function createLifecycleEvent(
	client: HelixClient,
	event: TradeLifecycleEvent,
): Promise<MutationResult> {
	try {
		await client.query("createLifecycleEvent", event as unknown as Record<string, unknown>);

		return {
			success: true,
			id: event.event_id,
		};
	} catch (error) {
		return {
			success: false,
			id: event.event_id,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Upsert an ExternalEvent node.
 *
 * Creates or updates based on event_id.
 */
export async function upsertExternalEvent(
	client: HelixClient,
	event: ExternalEvent,
	embedding?: number[],
	embeddingModelVersion?: string,
): Promise<MutationResult> {
	try {
		const params: Record<string, unknown> = {
			...event,
			embedding,
			embedding_model_version: embeddingModelVersion,
		};

		await client.query("upsertExternalEvent", params);

		return {
			success: true,
			id: event.event_id,
		};
	} catch (error) {
		return {
			success: false,
			id: event.event_id,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

// ============================================
// Edge Operations
// ============================================

/**
 * Create an edge between two nodes.
 */
export async function createEdge(client: HelixClient, edge: EdgeInput): Promise<MutationResult> {
	try {
		await client.query("createEdge", {
			source_id: edge.sourceId,
			target_id: edge.targetId,
			edge_type: edge.edgeType,
			properties: edge.properties ?? {},
		});

		return {
			success: true,
			id: `${edge.sourceId}->${edge.targetId}`,
		};
	} catch (error) {
		return {
			success: false,
			id: `${edge.sourceId}->${edge.targetId}`,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Create an INFLUENCED_DECISION edge.
 */
export async function createInfluencedDecisionEdge(
	client: HelixClient,
	edge: InfluencedDecisionEdge,
): Promise<MutationResult> {
	return createEdge(client, {
		sourceId: edge.source_id,
		targetId: edge.target_id,
		edgeType: "INFLUENCED_DECISION",
		properties: {
			influence_score: edge.influence_score,
			influence_type: edge.influence_type,
		},
	});
}

/**
 * Create a HAS_EVENT edge.
 */
export async function createHasEventEdge(
	client: HelixClient,
	edge: HasEventEdge,
): Promise<MutationResult> {
	return createEdge(client, {
		sourceId: edge.source_id,
		targetId: edge.target_id,
		edgeType: "HAS_EVENT",
	});
}

/**
 * Create a THESIS_INCLUDES edge.
 * Links a ThesisMemory to related TradeDecisions.
 */
export async function createThesisIncludesEdge(
	client: HelixClient,
	edge: ThesisIncludesEdge,
): Promise<MutationResult> {
	return createEdge(client, {
		sourceId: edge.source_id,
		targetId: edge.target_id,
		edgeType: "THESIS_INCLUDES",
	});
}

// ============================================
// Batch Operations
// ============================================

/**
 * Batch upsert TradeDecision nodes.
 *
 * Uses parallel execution for performance.
 * Handles partial failures gracefully.
 */
export async function batchUpsertTradeDecisions(
	client: HelixClient,
	decisions: NodeWithEmbedding<TradeDecision>[],
): Promise<BatchMutationResult> {
	const startTime = performance.now();
	const results = await Promise.allSettled(
		decisions.map((d) => upsertTradeDecision(client, d.node, d.embedding, d.embeddingModelVersion)),
	);

	return processBatchResults(results, startTime);
}

/**
 * Batch create TradeLifecycleEvent nodes.
 */
export async function batchCreateLifecycleEvents(
	client: HelixClient,
	events: TradeLifecycleEvent[],
): Promise<BatchMutationResult> {
	const startTime = performance.now();
	const results = await Promise.allSettled(events.map((e) => createLifecycleEvent(client, e)));

	return processBatchResults(results, startTime);
}

/**
 * Batch upsert ExternalEvent nodes.
 */
export async function batchUpsertExternalEvents(
	client: HelixClient,
	events: NodeWithEmbedding<ExternalEvent>[],
): Promise<BatchMutationResult> {
	const startTime = performance.now();
	const results = await Promise.allSettled(
		events.map((e) => upsertExternalEvent(client, e.node, e.embedding, e.embeddingModelVersion)),
	);

	return processBatchResults(results, startTime);
}

/**
 * Batch create edges.
 */
export async function batchCreateEdges(
	client: HelixClient,
	edges: EdgeInput[],
): Promise<BatchMutationResult> {
	const startTime = performance.now();
	const results = await Promise.allSettled(edges.map((e) => createEdge(client, e)));

	return processBatchResults(results, startTime);
}

// ============================================
// Helpers
// ============================================

/**
 * Process batch results from Promise.allSettled.
 */
function processBatchResults(
	results: PromiseSettledResult<MutationResult>[],
	startTime: number,
): BatchMutationResult {
	const successful: MutationResult[] = [];
	const failed: MutationResult[] = [];

	for (const result of results) {
		if (result.status === "fulfilled") {
			if (result.value.success) {
				successful.push(result.value);
			} else {
				failed.push(result.value);
			}
		} else {
			failed.push({
				success: false,
				id: "unknown",
				error: result.reason instanceof Error ? result.reason.message : String(result.reason),
			});
		}
	}

	return {
		successful,
		failed,
		totalProcessed: results.length,
		executionTimeMs: performance.now() - startTime,
	};
}
