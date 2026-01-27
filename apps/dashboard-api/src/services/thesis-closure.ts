/**
 * Thesis Closure Service
 *
 * Handles closing theses when their associated positions are closed.
 * Infers close reason from price levels, updates thesis state,
 * and ingests thesis memory to HelixDB for RAG-based learning.
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import {
	createEmbeddingClient,
	createThesisMemory,
	type EmbeddingClient,
	ingestThesisMemory,
	type ThesisCloseReason,
	type ThesisMemoryInput,
} from "@cream/helix-schema";
import type { CloseReason, Thesis } from "@cream/storage";
import { RegimeLabelsRepository, ThesisStateRepository } from "@cream/storage";
import log from "../logger.js";

export interface CloseThesisInput {
	thesisId: string;
	exitPrice: number;
	realizedPnl: number;
	side: "long" | "short";
}

let helixClient: HelixClient | null = null;
let embeddingClient: EmbeddingClient | null = null;
let helixAvailable = true;
let embeddingsAvailable = true;

/**
 * Get or create the HelixDB client.
 * Returns null if HelixDB is not available.
 */
function getHelixClient(): HelixClient | null {
	if (!helixAvailable) {
		return null;
	}

	if (!helixClient) {
		try {
			helixClient = createHelixClientFromEnv();
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"HelixDB not available, thesis memory ingestion disabled",
			);
			helixAvailable = false;
			return null;
		}
	}

	return helixClient;
}

/**
 * Get or create the embedding client.
 * Returns null if embeddings are not available.
 */
function getEmbeddingClient(): EmbeddingClient | null {
	if (!embeddingsAvailable) {
		return null;
	}

	if (!embeddingClient) {
		try {
			embeddingClient = createEmbeddingClient();
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Embedding client not available, thesis memory ingestion disabled",
			);
			embeddingsAvailable = false;
			return null;
		}
	}

	return embeddingClient;
}

/**
 * Get the current market regime label.
 */
async function getCurrentRegime(): Promise<string> {
	try {
		const regimeRepo = new RegimeLabelsRepository();
		let regimeData = await regimeRepo.getCurrent("_MARKET", "1d");
		if (!regimeData) {
			regimeData = await regimeRepo.getCurrent("SPY", "1d");
		}
		return regimeData?.regime ?? "UNKNOWN";
	} catch {
		return "UNKNOWN";
	}
}

/**
 * Infer the close reason based on exit price relative to stop/target levels.
 */
function inferCloseReason(thesis: Thesis, exitPrice: number, side: "long" | "short"): CloseReason {
	const { currentStop, currentTarget } = thesis;

	if (side === "long") {
		if (currentStop !== null && exitPrice <= currentStop) {
			return "STOP_HIT";
		}
		if (currentTarget !== null && exitPrice >= currentTarget) {
			return "TARGET_HIT";
		}
	} else {
		if (currentStop !== null && exitPrice >= currentStop) {
			return "STOP_HIT";
		}
		if (currentTarget !== null && exitPrice <= currentTarget) {
			return "TARGET_HIT";
		}
	}

	return "MANUAL";
}

/**
 * Ingest a closed thesis into HelixDB for RAG-based learning.
 * Handles errors gracefully - failure does not affect thesis closure.
 */
async function ingestThesisToHelix(thesis: Thesis, entryRegime: string): Promise<void> {
	const helix = getHelixClient();
	const embeddings = getEmbeddingClient();

	if (!helix || !embeddings) {
		return;
	}

	if (!thesis.entryThesis || !thesis.entryDate || !thesis.closedAt || !thesis.closeReason) {
		log.debug({ thesisId: thesis.thesisId }, "Thesis missing required fields for memory ingestion");
		return;
	}

	try {
		const memoryInput: ThesisMemoryInput = {
			thesisId: thesis.thesisId,
			instrumentId: thesis.instrumentId,
			entryThesis: thesis.entryThesis,
			pnlPercent: thesis.realizedPnlPct ?? 0,
			entryDate: thesis.entryDate,
			closedAt: thesis.closedAt,
			closeReason: thesis.closeReason as ThesisCloseReason,
			entryPrice: thesis.entryPrice ?? undefined,
			exitPrice: thesis.exitPrice ?? undefined,
			entryRegime,
			environment: thesis.environment,
		};

		const memory = createThesisMemory(memoryInput);
		await ingestThesisMemory(helix, embeddings, memory);

		log.info(
			{
				thesisId: thesis.thesisId,
				instrumentId: thesis.instrumentId,
				outcome: memory.outcome,
				pnlPercent: memory.pnl_percent,
			},
			"Ingested thesis memory to HelixDB",
		);
	} catch (error) {
		log.warn(
			{
				thesisId: thesis.thesisId,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to ingest thesis memory to HelixDB",
		);
	}
}

/**
 * Close a thesis when its associated position is closed.
 * Also ingests thesis memory to HelixDB for RAG-based learning.
 *
 * @param input - Position closure data
 * @returns The closed thesis, or null if thesis not found or already closed
 */
export async function closeThesisForPosition(input: CloseThesisInput): Promise<Thesis | null> {
	const thesisRepo = new ThesisStateRepository();

	const thesis = await thesisRepo.findById(input.thesisId);
	if (!thesis) {
		log.warn({ thesisId: input.thesisId }, "Thesis not found for position closure");
		return null;
	}

	if (thesis.state === "CLOSED") {
		log.debug({ thesisId: input.thesisId }, "Thesis already closed, skipping");
		return thesis;
	}

	const entryRegime = await getCurrentRegime();
	const closeReason = inferCloseReason(thesis, input.exitPrice, input.side);

	const closedThesis = await thesisRepo.close(
		input.thesisId,
		closeReason,
		input.exitPrice,
		input.realizedPnl,
	);

	log.info(
		{
			thesisId: input.thesisId,
			instrumentId: closedThesis.instrumentId,
			closeReason,
			exitPrice: input.exitPrice,
			realizedPnl: input.realizedPnl,
			realizedPnlPct: closedThesis.realizedPnlPct,
		},
		"Closed thesis for position",
	);

	await ingestThesisToHelix(closedThesis, entryRegime);

	return closedThesis;
}
