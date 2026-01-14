/**
 * CBR Case Retention
 *
 * Implements the "Retain" step of the CBR cycle for storing trade decisions
 * and updating outcomes.
 *
 * @module
 */

import type { TradeDecision } from "../node-types.js";
import type { CaseRetentionResult, HelixClient } from "./types.js";

/**
 * Store a new trade decision as a case for future retrieval.
 *
 * This implements the "Retain" step of the CBR cycle.
 * After a trade is closed, the decision and outcome should be
 * stored so similar situations can benefit from this experience.
 *
 * Note: HelixDB generates embeddings internally via InsertTradeDecision query.
 *
 * @param client - HelixDB client
 * @param decision - The trade decision to store
 * @returns Result indicating success or failure
 */
export async function retainCase(
	client: HelixClient,
	decision: TradeDecision
): Promise<CaseRetentionResult> {
	try {
		await client.query("InsertTradeDecision", {
			decision_id: decision.decision_id,
			cycle_id: decision.cycle_id,
			instrument_id: decision.instrument_id,
			underlying_symbol: decision.underlying_symbol ?? null,
			regime_label: decision.regime_label,
			action: decision.action,
			decision_json: decision.decision_json,
			rationale_text: decision.rationale_text,
			snapshot_reference: decision.snapshot_reference,
			created_at: decision.created_at,
			environment: decision.environment,
		});

		return {
			success: true,
			decisionId: decision.decision_id,
		};
	} catch (error) {
		return {
			success: false,
			decisionId: decision.decision_id,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Update a retained case with outcome data.
 *
 * Called after a trade is closed to update the case with realized P&L
 * and other outcome metrics. This enables the CBR system to learn from
 * the success or failure of past decisions.
 *
 * @param client - HelixDB client
 * @param decisionId - ID of the decision to update
 * @param outcome - Realized outcome data
 * @returns Whether update succeeded
 */
export async function updateCaseOutcome(
	client: HelixClient,
	decisionId: string,
	outcome: {
		pnl: number;
		returnPct: number;
		holdingHours: number;
		entryPrice?: number;
		exitPrice?: number;
		mae?: number;
		mfe?: number;
	}
): Promise<boolean> {
	try {
		const outcomeJson = JSON.stringify({
			pnl: outcome.pnl,
			return_pct: outcome.returnPct,
			holding_hours: outcome.holdingHours,
			entry_price: outcome.entryPrice,
			exit_price: outcome.exitPrice,
			mae: outcome.mae,
			mfe: outcome.mfe,
		});

		await client.query("UpdateDecisionOutcome", {
			decision_id: decisionId,
			realized_outcome: outcomeJson,
			closed_at: new Date().toISOString(),
		});

		return true;
	} catch (_error) {
		return false;
	}
}
