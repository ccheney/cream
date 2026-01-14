/**
 * CBR Type Conversion
 *
 * Converts between HelixDB TradeDecision format and domain RetrievedCase format.
 *
 * @module
 */

import type { CaseResult, KeyOutcomes, RetrievedCase } from "@cream/domain";
import type { TradeDecision } from "../node-types.js";

/**
 * Convert a TradeDecision from HelixDB to a RetrievedCase for domain use.
 */
export function convertToRetrievedCase(
	decision: TradeDecision,
	similarityScore?: number
): RetrievedCase {
	const keyOutcomes = parseRealizedOutcome(decision.realized_outcome);
	const shortSummary = generateShortSummary(decision);

	return {
		caseId: decision.decision_id,
		shortSummary,
		keyOutcomes,
		asOfTimestamp: decision.created_at,
		ticker: decision.instrument_id,
		regime: decision.regime_label,
		similarityScore,
	};
}

/**
 * Generate a short summary from a trade decision.
 */
export function generateShortSummary(decision: TradeDecision): string {
	const action = decision.action;
	const instrument = decision.instrument_id;
	const regime = decision.regime_label;

	let rationalePreview = decision.rationale_text.split(".")[0] ?? decision.rationale_text;
	if (rationalePreview.length > 100) {
		rationalePreview = `${rationalePreview.slice(0, 97)}...`;
	}

	return `${action} ${instrument} (${regime}): ${rationalePreview}`;
}

function parseRealizedOutcome(realizedOutcome: string | undefined): KeyOutcomes {
	const defaultOutcome: KeyOutcomes = {
		result: "breakeven" as CaseResult,
		return: 0,
		durationHours: 0,
	};

	if (!realizedOutcome) {
		return defaultOutcome;
	}

	try {
		const outcome = JSON.parse(realizedOutcome) as {
			pnl?: number;
			return_pct?: number;
			holding_hours?: number;
			entry_price?: number;
			exit_price?: number;
			mae?: number;
			mfe?: number;
		};

		const result = determineResult(outcome.pnl);

		return {
			result,
			return: outcome.return_pct ?? 0,
			durationHours: outcome.holding_hours ?? 0,
			entryPrice: outcome.entry_price,
			exitPrice: outcome.exit_price,
			mae: outcome.mae,
			mfe: outcome.mfe,
		};
	} catch {
		return defaultOutcome;
	}
}

function determineResult(pnl: number | undefined): CaseResult {
	if (typeof pnl !== "number") {
		return "breakeven";
	}
	if (pnl > 0) {
		return "win";
	}
	if (pnl < 0) {
		return "loss";
	}
	return "breakeven";
}
