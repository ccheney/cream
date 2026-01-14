/**
 * HelixDB Memory Update Workflow Step
 *
 * Updates HelixDB with trade decisions, lifecycle events, and external events
 * after each trading cycle execution.
 *
 * @see docs/plans/01-architecture.md (HelixDB Memory Layer section)
 */

import {
	type BatchMutationResult,
	batchCreateEdges,
	batchCreateLifecycleEvents,
	batchUpsertExternalEvents,
	batchUpsertTradeDecisions,
	createHelixClientFromEnv,
	type EdgeInput,
	type HelixClient,
	type NodeWithEmbedding,
} from "@cream/helix";
import type { ExternalEvent, TradeDecision, TradeLifecycleEvent } from "@cream/helix-schema";

// ============================================
// Types
// ============================================

/**
 * Input for the memory update workflow step.
 */
export interface MemoryUpdateInput {
	/** Trade decisions from the current cycle */
	decisions: TradeDecisionInput[];
	/** Lifecycle events (fills, cancellations, etc.) */
	lifecycleEvents: TradeLifecycleEvent[];
	/** External events (news, earnings, macro) */
	externalEvents: ExternalEventInput[];
	/** Edges connecting events to decisions */
	influenceEdges: InfluenceEdgeInput[];
	/** Embedding model version for tracking */
	embeddingModelVersion?: string;
}

/**
 * Trade decision with optional embedding.
 */
export interface TradeDecisionInput {
	decision: TradeDecision;
	embedding?: number[];
}

/**
 * External event with optional embedding.
 */
export interface ExternalEventInput {
	event: ExternalEvent;
	embedding?: number[];
}

/**
 * Edge representing event influence on decision.
 */
export interface InfluenceEdgeInput {
	eventId: string;
	decisionId: string;
	influenceScore: number;
	influenceType: string;
}

/**
 * Result of the memory update operation.
 */
export interface MemoryUpdateResult {
	success: boolean;
	decisions: BatchMutationResult;
	lifecycleEvents: BatchMutationResult;
	externalEvents: BatchMutationResult;
	edges: BatchMutationResult;
	totalExecutionTimeMs: number;
	errors: string[];
	warnings: string[];
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default embedding model version.
 */
export const DEFAULT_EMBEDDING_MODEL = "voyage-3";

/**
 * Default batch size for parallel operations.
 */
export const DEFAULT_BATCH_SIZE = 50;

// ============================================
// Main Workflow Step
// ============================================

/**
 * Execute the HelixDB memory update workflow step.
 *
 * Updates HelixDB with:
 * - TradeDecision nodes for each plan
 * - TradeLifecycleEvent nodes for fills, cancellations, closures
 * - ExternalEvent nodes for news, sentiment, macro events
 * - Edges: INFLUENCED_DECISION, HAS_EVENT
 *
 * @param input - Memory update input data
 * @param client - Optional HelixDB client (creates from env if not provided)
 * @returns Memory update result with success/failure details
 */
export async function executeHelixMemoryUpdate(
	input: MemoryUpdateInput,
	client?: HelixClient
): Promise<MemoryUpdateResult> {
	const startTime = performance.now();
	const errors: string[] = [];
	const warnings: string[] = [];

	// Create client if not provided
	const helixClient = client ?? createHelixClientFromEnv();

	try {
		// Phase 1: Upsert trade decisions
		const decisionsWithEmbeddings = prepareDecisions(input.decisions, input.embeddingModelVersion);
		const decisionsResult = await batchUpsertTradeDecisions(helixClient, decisionsWithEmbeddings);

		if (decisionsResult.failed.length > 0) {
			errors.push(
				`Failed to upsert ${decisionsResult.failed.length} decisions: ${formatErrors(decisionsResult.failed)}`
			);
		}

		// Phase 2: Create lifecycle events
		const lifecycleResult = await batchCreateLifecycleEvents(helixClient, input.lifecycleEvents);

		if (lifecycleResult.failed.length > 0) {
			errors.push(
				`Failed to create ${lifecycleResult.failed.length} lifecycle events: ${formatErrors(lifecycleResult.failed)}`
			);
		}

		// Phase 3: Upsert external events
		const eventsWithEmbeddings = prepareExternalEvents(
			input.externalEvents,
			input.embeddingModelVersion
		);
		const externalEventsResult = await batchUpsertExternalEvents(helixClient, eventsWithEmbeddings);

		if (externalEventsResult.failed.length > 0) {
			errors.push(
				`Failed to upsert ${externalEventsResult.failed.length} external events: ${formatErrors(externalEventsResult.failed)}`
			);
		}

		// Phase 4: Create edges
		const edges = buildEdges(input);
		const edgesResult = await batchCreateEdges(helixClient, edges);

		if (edgesResult.failed.length > 0) {
			warnings.push(
				`Failed to create ${edgesResult.failed.length} edges: ${formatErrors(edgesResult.failed)}`
			);
		}

		// Calculate total execution time
		const totalExecutionTimeMs = performance.now() - startTime;

		// Determine overall success
		const success =
			decisionsResult.failed.length === 0 &&
			lifecycleResult.failed.length === 0 &&
			externalEventsResult.failed.length === 0;

		return {
			success,
			decisions: decisionsResult,
			lifecycleEvents: lifecycleResult,
			externalEvents: externalEventsResult,
			edges: edgesResult,
			totalExecutionTimeMs,
			errors,
			warnings,
		};
	} catch (error) {
		const totalExecutionTimeMs = performance.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		return {
			success: false,
			decisions: emptyBatchResult(),
			lifecycleEvents: emptyBatchResult(),
			externalEvents: emptyBatchResult(),
			edges: emptyBatchResult(),
			totalExecutionTimeMs,
			errors: [`Fatal error: ${errorMessage}`],
			warnings,
		};
	} finally {
		// Close client if we created it
		if (!client) {
			helixClient.close();
		}
	}
}

// ============================================
// Helper Functions
// ============================================

/**
 * Prepare trade decisions with embeddings for batch upsert.
 */
function prepareDecisions(
	decisions: TradeDecisionInput[],
	embeddingModelVersion?: string
): NodeWithEmbedding<TradeDecision>[] {
	return decisions.map((d) => ({
		node: d.decision,
		embedding: d.embedding,
		embeddingModelVersion: embeddingModelVersion ?? DEFAULT_EMBEDDING_MODEL,
	}));
}

/**
 * Prepare external events with embeddings for batch upsert.
 */
function prepareExternalEvents(
	events: ExternalEventInput[],
	embeddingModelVersion?: string
): NodeWithEmbedding<ExternalEvent>[] {
	return events.map((e) => ({
		node: e.event,
		embedding: e.embedding,
		embeddingModelVersion: embeddingModelVersion ?? DEFAULT_EMBEDDING_MODEL,
	}));
}

/**
 * Build edges from input data.
 */
function buildEdges(input: MemoryUpdateInput): EdgeInput[] {
	const edges: EdgeInput[] = [];

	// INFLUENCED_DECISION edges (event -> decision)
	for (const influence of input.influenceEdges) {
		edges.push({
			sourceId: influence.eventId,
			targetId: influence.decisionId,
			edgeType: "INFLUENCED_DECISION",
			properties: {
				influence_score: influence.influenceScore,
				influence_type: influence.influenceType,
			},
		});
	}

	// HAS_EVENT edges (decision -> lifecycle event)
	for (const event of input.lifecycleEvents) {
		edges.push({
			sourceId: event.decision_id,
			targetId: event.event_id,
			edgeType: "HAS_EVENT",
		});
	}

	return edges;
}

/**
 * Format errors from failed mutations for logging.
 */
function formatErrors(failed: { id: string; error?: string }[]): string {
	return failed
		.slice(0, 3) // Limit to first 3 errors
		.map((f) => `${f.id}: ${f.error ?? "Unknown error"}`)
		.join("; ");
}

/**
 * Create an empty batch result for error cases.
 */
function emptyBatchResult(): BatchMutationResult {
	return {
		successful: [],
		failed: [],
		totalProcessed: 0,
		executionTimeMs: 0,
	};
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Update memory with a single trade decision.
 *
 * Convenience wrapper for single decision updates.
 */
export async function updateDecisionMemory(
	decision: TradeDecision,
	embedding?: number[],
	client?: HelixClient
): Promise<MemoryUpdateResult> {
	return executeHelixMemoryUpdate(
		{
			decisions: [{ decision, embedding }],
			lifecycleEvents: [],
			externalEvents: [],
			influenceEdges: [],
		},
		client
	);
}

/**
 * Record lifecycle events for a decision.
 *
 * Convenience wrapper for recording fills, cancellations, etc.
 */
export async function recordLifecycleEvents(
	events: TradeLifecycleEvent[],
	client?: HelixClient
): Promise<MemoryUpdateResult> {
	return executeHelixMemoryUpdate(
		{
			decisions: [],
			lifecycleEvents: events,
			externalEvents: [],
			influenceEdges: [],
		},
		client
	);
}

/**
 * Update memory with external events.
 *
 * Convenience wrapper for news, earnings, and macro events.
 */
export async function updateExternalEvents(
	events: ExternalEventInput[],
	influenceEdges: InfluenceEdgeInput[] = [],
	client?: HelixClient
): Promise<MemoryUpdateResult> {
	return executeHelixMemoryUpdate(
		{
			decisions: [],
			lifecycleEvents: [],
			externalEvents: events,
			influenceEdges,
		},
		client
	);
}
