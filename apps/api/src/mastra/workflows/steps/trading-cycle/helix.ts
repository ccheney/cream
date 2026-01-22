/**
 * HelixDB Integration
 *
 * HelixDB orchestrator singleton and embedding client for the trading cycle.
 */

import { createEmbeddingClient, type EmbeddingClient } from "@cream/helix-schema";

import {
	createHelixOrchestrator,
	type HelixOrchestrator,
} from "../../../../../workflows/steps/helixOrchestrator.js";
import { getHelixClient } from "../../../../db.js";
import { log } from "./logger.js";

// ============================================
// Singletons
// ============================================

let embeddingClient: EmbeddingClient | null = null;
let helixOrchestrator: HelixOrchestrator | null = null;

// ============================================
// Embedding Client
// ============================================

/**
 * Get or create the embedding client singleton.
 * Returns null if initialization fails (missing API key, etc.).
 */
export function getEmbeddingClient(): EmbeddingClient | null {
	if (embeddingClient) {
		return embeddingClient;
	}

	try {
		embeddingClient = createEmbeddingClient();
		return embeddingClient;
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to create embedding client",
		);
		return null;
	}
}

// ============================================
// HelixDB Orchestrator
// ============================================

/**
 * Get or create the HelixDB orchestrator singleton.
 * Returns null if HelixDB client is unavailable.
 */
export function getHelixOrchestrator(): HelixOrchestrator | null {
	if (helixOrchestrator) {
		return helixOrchestrator;
	}

	const client = getHelixClient();
	if (!client) {
		return null;
	}

	helixOrchestrator = createHelixOrchestrator(client, {
		enabled: true,
		retrievalEnabled: true,
		memoryUpdateEnabled: true,
		fallbackOnError: true,
		performanceTargets: {
			retrievalMaxMs: 50,
			updateMaxMs: 100,
			lifecycleMaxMs: 50,
		},
	});

	return helixOrchestrator;
}

// ============================================
// Re-exports
// ============================================

export type { HelixOrchestrator };
