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
		void embedding;
		void embeddingModelVersion;
		await client.query("InsertTradeDecision", {
			decision_id: decision.decision_id,
			cycle_id: decision.cycle_id,
			instrument_id: decision.instrument_id,
			underlying_symbol: decision.underlying_symbol ?? decision.instrument_id,
			regime_label: decision.regime_label,
			action: decision.action,
			decision_json: decision.decision_json,
			rationale_text: decision.rationale_text,
			snapshot_reference: decision.snapshot_reference,
			realized_outcome: decision.realized_outcome ?? "",
			environment: decision.environment,
			closed_at: decision.closed_at ?? decision.created_at,
		});

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
		await client.query("InsertLifecycleEvent", {
			event_id: event.event_id,
			decision_id: event.decision_id,
			event_type: event.event_type,
			price: event.price,
			quantity: event.quantity,
			environment: event.environment,
		});

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
		void embedding;
		void embeddingModelVersion;
		await client.query("InsertExternalEvent", {
			event_id: event.event_id,
			event_type: event.event_type,
			payload: event.payload,
			text_summary: event.text_summary ?? event.payload,
			related_instrument_ids: event.related_instrument_ids,
			event_time: event.event_time,
		});

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
		const mutation = resolveEdgeMutation(edge);
		await client.query(mutation.queryName, mutation.params);

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

interface EdgeMutation {
	queryName: string;
	params: Record<string, unknown>;
}

function toNumericProperty(
	properties: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	const value = properties[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	return fallback;
}

function toStringProperty(
	properties: Record<string, unknown>,
	key: string,
	fallback: string,
): string {
	const value = properties[key];
	if (typeof value === "string" && value.length > 0) {
		return value;
	}
	return fallback;
}

function clampUnitInterval(value: number): number {
	return Math.max(0, Math.min(1, value));
}

type EdgeMutationBuilder = (edge: EdgeInput, properties: Record<string, unknown>) => EdgeMutation;

const EDGE_MUTATION_BUILDERS: Record<string, EdgeMutationBuilder> = {
	INFLUENCED_DECISION: (edge, properties) => ({
		queryName: "CreateInfluencedDecisionEdge",
		params: {
			event_id: edge.sourceId,
			decision_id: edge.targetId,
			influence_score: clampUnitInterval(toNumericProperty(properties, "influence_score", 0.5)),
			influence_type: toStringProperty(properties, "influence_type", "UNKNOWN"),
		},
	}),
	FILED_BY: (edge) => ({
		queryName: "CreateFiledByEdge",
		params: {
			chunk_id: edge.sourceId,
			company_symbol: edge.targetId,
		},
	}),
	TRANSCRIPT_FOR: (edge) => ({
		queryName: "CreateTranscriptForEdge",
		params: {
			chunk_id: edge.sourceId,
			company_symbol: edge.targetId,
		},
	}),
	MENTIONS_COMPANY: (edge, properties) => ({
		queryName: "CreateMentionsCompanyEdgeByNodeId",
		params: {
			news_node_id: edge.sourceId,
			company_symbol: edge.targetId,
			news_item_id: toStringProperty(properties, "item_id", edge.sourceId),
			sentiment: toNumericProperty(properties, "sentiment", 0),
			headline: toStringProperty(properties, "headline", ""),
			source: toStringProperty(properties, "source", ""),
			published_at: toStringProperty(properties, "published_at", ""),
		},
	}),
	EVENT_MENTIONS: (edge, properties) => ({
		queryName: "CreateEventMentionsEdge",
		params: {
			event_id: edge.sourceId,
			company_symbol: edge.targetId,
			sentiment: toNumericProperty(properties, "sentiment", 0),
		},
	}),
	RELATES_TO_MACRO: (edge) => ({
		queryName: "CreateRelatesToMacroEdge",
		params: {
			event_id: edge.sourceId,
			macro_entity_id: edge.targetId,
		},
	}),
	RELATED_TO: (edge, properties) => ({
		queryName: "CreateRelatedToEdge",
		params: {
			source_symbol: edge.sourceId,
			target_symbol: edge.targetId,
			relationship_type: toStringProperty(properties, "relationship_type", "SECTOR_PEER"),
		},
	}),
	DEPENDS_ON: (edge, properties) => ({
		queryName: "CreateDependsOnEdge",
		params: {
			source_symbol: edge.sourceId,
			target_symbol: edge.targetId,
			relationship_type: toStringProperty(properties, "relationship_type", "SUPPLIER"),
			strength: clampUnitInterval(toNumericProperty(properties, "strength", 0.5)),
		},
	}),
	HAS_EVENT: (edge) => ({
		queryName: "CreateHasEventEdge",
		params: {
			decision_id: edge.sourceId,
			event_id: edge.targetId,
		},
	}),
	AFFECTED_BY: (edge, properties) => ({
		queryName: "CreateAffectedByEdge",
		params: {
			company_symbol: edge.sourceId,
			macro_entity_id: edge.targetId,
			sensitivity: clampUnitInterval(toNumericProperty(properties, "sensitivity", 0.5)),
		},
	}),
	THESIS_INCLUDES: (edge) => ({
		queryName: "CreateThesisIncludesEdge",
		params: {
			thesis_id: edge.sourceId,
			decision_id: edge.targetId,
		},
	}),
};

function normalizeEdgeType(edgeType: string): string {
	return edgeType === "RELATES_TO" ? "RELATED_TO" : edgeType;
}

function resolveEdgeMutation(edge: EdgeInput): EdgeMutation {
	const normalizedEdgeType = normalizeEdgeType(edge.edgeType);
	const builder = EDGE_MUTATION_BUILDERS[normalizedEdgeType];
	if (!builder) {
		throw new Error(`Unsupported edge type: ${edge.edgeType}`);
	}

	return builder(edge, edge.properties ?? {});
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
