/**
 * Thesis Memory Ingestion Workflow Step
 *
 * Ingests closed theses from Turso into HelixDB as ThesisMemory nodes.
 * When a thesis closes, this step captures the outcome, generates lessons
 * learned, and stores it for future agent retrieval.
 *
 * This enables agents to learn from past thesis outcomes:
 * - Bullish Research retrieves similar winning theses
 * - Bearish Research retrieves similar losing theses
 *
 * @see packages/helix-schema/src/thesisMemory.ts - ThesisMemory types
 * @see docs/plans/05-agents.md - Memory Integration section
 */

import { createHelixClientFromEnv, createThesisIncludesEdge, type HelixClient } from "@cream/helix";
import {
	createEmbeddingClient,
	createThesisMemory,
	type EmbeddingClient,
	generateThesisEmbeddingText,
	ingestThesisMemory,
	type ThesisCloseReason,
	type ThesisMemory,
	type ThesisMemoryInput,
} from "@cream/helix-schema";
import type { Thesis } from "@cream/storage";

// ============================================
// Types
// ============================================

/**
 * Input for thesis memory ingestion
 */
export interface ThesisIngestionInput {
	/** Closed thesis from Turso */
	thesis: Thesis;
	/** Market regime at entry (required - not stored in thesis) */
	entryRegime: string;
	/** Market regime at exit (optional) */
	exitRegime?: string;
	/** Related trade decision IDs for linking */
	relatedDecisionIds?: string[];
}

/**
 * Result of thesis memory ingestion
 */
export interface ThesisIngestionResult {
	/** Whether ingestion succeeded */
	success: boolean;
	/** Generated ThesisMemory (if successful) */
	thesisMemory?: ThesisMemory;
	/** Embedding generated for the thesis */
	embedding?: number[];
	/** Execution time in milliseconds */
	executionTimeMs: number;
	/** Error message if failed */
	error?: string;
	/** Skipped reason if not ingested */
	skippedReason?: string;
}

/**
 * Batch ingestion result
 */
export interface BatchIngestionResult {
	/** Successfully ingested thesis IDs */
	successful: string[];
	/** Failed thesis IDs with errors */
	failed: Array<{ thesisId: string; error: string }>;
	/** Skipped thesis IDs with reasons */
	skipped: Array<{ thesisId: string; reason: string }>;
	/** Total execution time in milliseconds */
	totalExecutionTimeMs: number;
}

// ============================================
// Validation
// ============================================

/**
 * Validate that a thesis can be ingested.
 *
 * Requirements:
 * - Must be in CLOSED state
 * - Must have entry thesis text
 * - Must have entry date and closed date
 */
function validateForIngestion(thesis: Thesis): { valid: boolean; reason?: string } {
	if (thesis.state !== "CLOSED") {
		return { valid: false, reason: `Thesis not closed (state: ${thesis.state})` };
	}

	if (!thesis.entryThesis) {
		return { valid: false, reason: "Missing entry thesis text" };
	}

	if (!thesis.entryDate) {
		return { valid: false, reason: "Missing entry date" };
	}

	if (!thesis.closedAt) {
		return { valid: false, reason: "Missing closed date" };
	}

	return { valid: true };
}

/**
 * Convert Turso Thesis to ThesisMemoryInput.
 *
 * Note: This function assumes validation has been performed.
 * Required fields (entryThesis, entryDate, closedAt) are guaranteed
 * to be present after validateForIngestion passes.
 */
function convertThesisToInput(
	thesis: Thesis,
	entryRegime: string,
	exitRegime?: string
): ThesisMemoryInput {
	// These fields are guaranteed present after validation
	const entryThesis = thesis.entryThesis ?? "";
	const entryDate = thesis.entryDate ?? new Date().toISOString();
	const closedAt = thesis.closedAt ?? new Date().toISOString();

	return {
		thesisId: thesis.thesisId,
		instrumentId: thesis.instrumentId,
		entryThesis,
		pnlPercent: thesis.realizedPnlPct ?? 0,
		entryDate,
		closedAt,
		closeReason: thesis.closeReason as ThesisCloseReason,
		entryPrice: thesis.entryPrice ?? undefined,
		exitPrice: thesis.exitPrice ?? undefined,
		entryRegime,
		exitRegime,
		environment: thesis.environment,
	};
}

// ============================================
// Main Ingestion Function
// ============================================

/**
 * Ingest a closed thesis into HelixDB as a ThesisMemory node.
 *
 * This is the main entry point for thesis memory ingestion.
 *
 * @param input - Thesis ingestion input
 * @param helixClient - Optional HelixDB client (creates from env if not provided)
 * @param embeddingClient - Optional embedding client
 * @returns Ingestion result
 *
 * @example
 * ```typescript
 * const result = await ingestClosedThesis({
 *   thesis: closedThesis,
 *   entryRegime: "BULL_TREND",
 *   exitRegime: "RANGE_BOUND",
 * });
 *
 * if (result.success) {
 *   console.log(`Ingested: ${result.thesisMemory.thesis_id}`);
 * }
 * ```
 */
export async function ingestClosedThesis(
	input: ThesisIngestionInput,
	helixClient?: HelixClient,
	embeddingClient?: EmbeddingClient
): Promise<ThesisIngestionResult> {
	const startTime = performance.now();

	// Validate thesis
	const validation = validateForIngestion(input.thesis);
	if (!validation.valid) {
		return {
			success: false,
			executionTimeMs: performance.now() - startTime,
			skippedReason: validation.reason,
		};
	}

	// Create clients if not provided
	const helix = helixClient ?? createHelixClientFromEnv();
	const embedder = embeddingClient ?? createEmbeddingClient();

	try {
		// Convert thesis to ThesisMemoryInput
		const memoryInput = convertThesisToInput(input.thesis, input.entryRegime, input.exitRegime);

		// Create ThesisMemory
		const thesisMemory = createThesisMemory(memoryInput);

		// Generate embedding text and embedding
		const embeddingText = generateThesisEmbeddingText(thesisMemory);
		const embeddingResult = await embedder.generateEmbedding(embeddingText);

		// Ingest into HelixDB
		await ingestThesisMemory(helix, embedder, thesisMemory);

		// Create edges to related decisions if provided
		if (input.relatedDecisionIds && input.relatedDecisionIds.length > 0) {
			await createThesisDecisionEdges(helix, thesisMemory.thesis_id, input.relatedDecisionIds);
		}

		const executionTimeMs = performance.now() - startTime;

		return {
			success: true,
			thesisMemory,
			embedding: embeddingResult.values,
			executionTimeMs,
		};
	} catch (error) {
		const executionTimeMs = performance.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		return {
			success: false,
			executionTimeMs,
			error: `Ingestion failed: ${errorMessage}`,
		};
	} finally {
		// Close clients if we created them
		if (!helixClient) {
			helix.close();
		}
	}
}

/**
 * Create THESIS_INCLUDES edges linking thesis to its decisions
 */
async function createThesisDecisionEdges(
	client: HelixClient,
	thesisId: string,
	decisionIds: string[]
): Promise<void> {
	for (const decisionId of decisionIds) {
		await createThesisIncludesEdge(client, {
			source_id: thesisId,
			target_id: decisionId,
		});
	}
}

// ============================================
// Batch Ingestion
// ============================================

/**
 * Batch ingest multiple closed theses.
 *
 * Useful for backfilling historical theses into HelixDB.
 *
 * @param inputs - Array of thesis ingestion inputs
 * @param helixClient - Optional HelixDB client
 * @param embeddingClient - Optional embedding client
 * @returns Batch ingestion result
 */
export async function batchIngestClosedTheses(
	inputs: ThesisIngestionInput[],
	helixClient?: HelixClient,
	embeddingClient?: EmbeddingClient
): Promise<BatchIngestionResult> {
	const startTime = performance.now();
	const successful: string[] = [];
	const failed: Array<{ thesisId: string; error: string }> = [];
	const skipped: Array<{ thesisId: string; reason: string }> = [];

	// Create shared clients for batch
	const helix = helixClient ?? createHelixClientFromEnv();
	const embedder = embeddingClient ?? createEmbeddingClient();

	try {
		for (const input of inputs) {
			const result = await ingestClosedThesis(input, helix, embedder);

			if (result.success) {
				successful.push(input.thesis.thesisId);
			} else if (result.skippedReason) {
				skipped.push({
					thesisId: input.thesis.thesisId,
					reason: result.skippedReason,
				});
			} else if (result.error) {
				failed.push({
					thesisId: input.thesis.thesisId,
					error: result.error,
				});
			}
		}
	} finally {
		// Close clients if we created them
		if (!helixClient) {
			helix.close();
		}
	}

	return {
		successful,
		failed,
		skipped,
		totalExecutionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Trigger on Thesis Close
// ============================================

/**
 * Handle thesis close event by triggering memory ingestion.
 *
 * This function should be called after a thesis is closed in Turso.
 * It runs as a background job to not block the main workflow.
 *
 * @param thesis - The closed thesis
 * @param entryRegime - Regime when thesis was entered
 * @param exitRegime - Regime when thesis was closed
 * @param relatedDecisionIds - IDs of related trade decisions
 *
 * @example
 * ```typescript
 * // In thesis close workflow
 * const closedThesis = await thesisRepo.close(thesisId, reason, exitPrice, pnl);
 *
 * // Trigger memory ingestion (fire-and-forget)
 * onThesisClose(closedThesis, currentRegime, currentRegime, decisionIds)
 *   .catch(err => logger.error("Thesis memory ingestion failed", err));
 * ```
 */
export async function onThesisClose(
	thesis: Thesis,
	entryRegime: string,
	exitRegime?: string,
	relatedDecisionIds?: string[]
): Promise<ThesisIngestionResult> {
	return ingestClosedThesis({
		thesis,
		entryRegime,
		exitRegime,
		relatedDecisionIds,
	});
}

// ============================================
// Statistics
// ============================================

/**
 * Statistics about thesis memories in HelixDB
 */
export interface ThesisMemoryStats {
	total: number;
	byOutcome: {
		WIN: number;
		LOSS: number;
		SCRATCH: number;
	};
	byCloseReason: Record<string, number>;
	avgHoldingDays: number;
	avgPnlPercent: number;
	winRate: number;
}

/**
 * Get statistics about thesis memories in HelixDB.
 *
 * @param client - HelixDB client
 * @param environment - Environment to filter by
 * @returns Thesis memory statistics
 */
export async function getThesisMemoryStats(
	client: HelixClient,
	environment: string
): Promise<ThesisMemoryStats> {
	const results = await client.query<ThesisMemoryStats>("GetThesisMemoryStats", { environment });

	// The query returns aggregate statistics with the expected shape
	// If data is missing, provide default values
	return (
		results.data ?? {
			total: 0,
			byOutcome: { WIN: 0, LOSS: 0, SCRATCH: 0 },
			byCloseReason: {},
			avgHoldingDays: 0,
			avgPnlPercent: 0,
			winRate: 0,
		}
	);
}
