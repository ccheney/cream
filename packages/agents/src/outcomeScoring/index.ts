/**
 * Retrospective Outcome Scoring
 *
 * Evaluates completed trades to assess actual performance vs predictions.
 * Links to original forward-looking DecisionQualityScore to enable feedback.
 *
 * Key metrics:
 * - Realized return vs predicted
 * - Execution quality (slippage)
 * - Attribution (market, alpha, timing)
 *
 * @see docs/plans/01-architecture.md lines 107-118
 * @see docs/plans/10-research.md lines 230-242
 */

import type { DecisionQualityScore } from "../planScoring.js";

import { getOutcomeSummary } from "./aggregation.js";
import { OutcomeScorer } from "./scorer.js";
import type { CompletedTrade, OutcomeScore, OutcomeScoringConfig } from "./types.js";

// Re-export aggregation functions
export { getOutcomeSummary } from "./aggregation.js";
// Re-export attribution utilities
export { calculateAttribution, estimateTimingContribution } from "./attribution.js";
// Re-export calculation utilities
export {
	calculateEntrySlippage,
	calculateExitSlippage,
	calculateHoldingDuration,
	calculateMetrics,
	calculateRealizedPnL,
	calculateRealizedReturn,
} from "./calculations.js";
// Re-export execution utilities
export { scoreExecution } from "./execution.js";
// Re-export flag utilities
export { generateOutcomeFlags } from "./flags.js";
// Re-export the scorer class
export { OutcomeScorer } from "./scorer.js";
// Re-export scoring utilities
export { calculateOverallScore } from "./scoring.js";
// Re-export all types
export type {
	CompletedTrade,
	ExitReason,
	OutcomeFlag,
	OutcomeMetrics,
	OutcomeScore,
	OutcomeScoringConfig,
	OutcomeSummary,
	ReturnAttribution,
} from "./types.js";
// Re-export the default config
export { DEFAULT_OUTCOME_SCORING_CONFIG } from "./types.js";

/**
 * Score a single completed trade.
 */
export function scoreOutcome(
	trade: CompletedTrade,
	planScore?: DecisionQualityScore,
	config?: Partial<OutcomeScoringConfig>,
): OutcomeScore {
	const scorer = new OutcomeScorer(config);
	return scorer.scoreOutcome(trade, planScore);
}

/**
 * Score multiple completed trades.
 */
export function scoreOutcomes(
	trades: CompletedTrade[],
	planScores?: Map<string, DecisionQualityScore>,
	config?: Partial<OutcomeScoringConfig>,
): OutcomeScore[] {
	const scorer = new OutcomeScorer(config);
	return scorer.scoreOutcomes(trades, planScores);
}

export default {
	OutcomeScorer,
	scoreOutcome,
	scoreOutcomes,
	getOutcomeSummary,
};
