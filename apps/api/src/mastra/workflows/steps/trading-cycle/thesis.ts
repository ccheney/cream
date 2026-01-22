/**
 * Thesis Lifecycle Management
 *
 * Thesis state transitions and memory ingestion.
 */

import type { CloseReason, ThesisStateRepository } from "@cream/storage";
import {
	ingestClosedThesis,
	type ThesisIngestionInput,
} from "../../../../../workflows/steps/thesisMemoryIngestion.js";
import { getHelixClient, getThesisStateRepo } from "../../../../db.js";
import { getEmbeddingClient } from "./helix.js";
import { log } from "./logger.js";
import type { StopLoss, TakeProfit, ThesisUpdate } from "./types.js";

// ============================================
// Thesis Processing
// ============================================

/**
 * Process thesis state for a decision.
 * Creates new thesis for entries, updates state for transitions, closes for exits.
 */
export async function processThesisForDecision(
	repo: ThesisStateRepository,
	decision: {
		instrumentId: string;
		action: string;
		direction?: string;
		stopLoss?: StopLoss;
		takeProfit?: TakeProfit;
		rationale?: { summary?: string };
		confidence?: number;
	},
	environment: string,
	cycleId: string,
	currentPrice?: number,
): Promise<ThesisUpdate | null> {
	const { instrumentId, action, stopLoss, takeProfit, rationale, confidence } = decision;
	const stopPrice = stopLoss?.price;
	const targetPrice = takeProfit?.price;

	try {
		const activeThesis = await repo.findActiveForInstrument(instrumentId, environment);

		if (action === "BUY" || action === "SELL") {
			if (!activeThesis) {
				const thesis = await repo.create({
					instrumentId,
					state: "WATCHING",
					entryThesis: rationale?.summary ?? `${action} signal detected`,
					invalidationConditions: stopPrice ? `Stop loss at ${stopPrice}` : undefined,
					conviction: confidence,
					currentStop: stopPrice,
					currentTarget: targetPrice,
					environment,
					notes: { cycleId },
				});
				const thesisId = thesis.thesisId;

				if (currentPrice && stopPrice) {
					await repo.enterPosition(thesisId, currentPrice, stopPrice, targetPrice, cycleId);
					return {
						thesisId,
						instrumentId,
						fromState: null,
						toState: "ENTERED",
						action,
						reason: "New position entered",
					};
				}

				return {
					thesisId,
					instrumentId,
					fromState: null,
					toState: "WATCHING",
					action,
					reason: "New thesis created",
				};
			}

			if (activeThesis.state === "WATCHING" && currentPrice && stopPrice) {
				await repo.enterPosition(
					activeThesis.thesisId,
					currentPrice,
					stopPrice,
					targetPrice,
					cycleId,
				);
				return {
					thesisId: activeThesis.thesisId,
					instrumentId,
					fromState: "WATCHING",
					toState: "ENTERED",
					action,
					reason: "Position entered from watchlist",
				};
			}

			if (activeThesis.state === "ENTERED" && action === "BUY") {
				await repo.transitionState(activeThesis.thesisId, {
					toState: "ADDING",
					triggerReason: "Adding to position",
					cycleId,
					priceAtTransition: currentPrice,
				});
				return {
					thesisId: activeThesis.thesisId,
					instrumentId,
					fromState: "ENTERED",
					toState: "ADDING",
					action,
					reason: "Adding to position",
				};
			}
		} else if (action === "CLOSE" && activeThesis) {
			const closeReason = mapDecisionToCloseReason(decision);
			await repo.close(activeThesis.thesisId, closeReason, currentPrice, undefined, cycleId);
			return {
				thesisId: activeThesis.thesisId,
				instrumentId,
				fromState: activeThesis.state,
				toState: "CLOSED",
				action,
				reason: closeReason,
			};
		} else if (action === "HOLD" && !activeThesis) {
			const thesis = await repo.create({
				instrumentId,
				state: "WATCHING",
				entryThesis: rationale?.summary ?? "Monitoring for entry opportunity",
				environment,
				notes: { cycleId },
			});
			return {
				thesisId: thesis.thesisId,
				instrumentId,
				fromState: null,
				toState: "WATCHING",
				action,
				reason: "Added to watchlist",
			};
		}

		return null;
	} catch (error) {
		log.error(
			{
				instrumentId,
				action,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to process thesis for decision",
		);
		return null;
	}
}

/**
 * Map decision action/context to thesis close reason
 */
export function mapDecisionToCloseReason(decision: {
	action: string;
	rationale?: { summary?: string };
}): CloseReason {
	const summary = decision.rationale?.summary?.toLowerCase() ?? "";

	if (summary.includes("stop") || summary.includes("loss")) {
		return "STOP_HIT";
	}
	if (summary.includes("target") || summary.includes("profit")) {
		return "TARGET_HIT";
	}
	if (summary.includes("invalid") || summary.includes("broke")) {
		return "INVALIDATED";
	}
	if (summary.includes("time") || summary.includes("decay")) {
		return "TIME_DECAY";
	}
	return "MANUAL";
}

// ============================================
// Thesis Memory Ingestion
// ============================================

/**
 * Ingest closed theses into HelixDB memory.
 */
export async function ingestClosedThesesForCycle(
	cycleId: string,
	_environment: string,
	thesisUpdates: ThesisUpdate[],
): Promise<{ ingested: number; errors: string[] }> {
	const closedUpdates = thesisUpdates.filter((u) => u.toState === "CLOSED");
	if (closedUpdates.length === 0) {
		return { ingested: 0, errors: [] };
	}

	const client = getHelixClient();
	const embedder = getEmbeddingClient();
	if (!client || !embedder) {
		return { ingested: 0, errors: ["HelixDB or embedder not available"] };
	}

	const repo = await getThesisStateRepo();
	const errors: string[] = [];
	let ingested = 0;

	for (const update of closedUpdates) {
		try {
			const thesis = await repo.findById(update.thesisId);
			if (!thesis) {
				continue;
			}

			const currentRegime = "RANGE";

			const input: ThesisIngestionInput = {
				thesis,
				entryRegime: currentRegime,
				exitRegime: currentRegime,
				relatedDecisionIds: [],
			};

			const result = await ingestClosedThesis(input, client, embedder);
			if (result.success) {
				ingested++;
			} else if (result.skippedReason) {
				errors.push(`${update.thesisId}: ${result.skippedReason}`);
			}
		} catch (error) {
			errors.push(`${update.thesisId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	log.info({ cycleId, ingested, errors: errors.length }, "Thesis memory ingestion complete");
	return { ingested, errors };
}
