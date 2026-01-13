/**
 * Outcome Scorer
 *
 * Main class that orchestrates outcome scoring for completed trades.
 */

import type { DecisionQualityScore } from "../planScoring.js";

import { calculateAttribution } from "./attribution.js";
import {
  calculateHoldingDuration,
  calculateMetrics,
  calculateRealizedPnL,
  calculateRealizedReturn,
} from "./calculations.js";
import { scoreExecution } from "./execution.js";
import { generateOutcomeFlags } from "./flags.js";
import { calculateOverallScore } from "./scoring.js";
import type { CompletedTrade, OutcomeFlag, OutcomeScore, OutcomeScoringConfig } from "./types.js";
import { DEFAULT_OUTCOME_SCORING_CONFIG } from "./types.js";

/**
 * Scores completed trades for retrospective analysis.
 */
export class OutcomeScorer {
  private readonly config: OutcomeScoringConfig;

  constructor(config: Partial<OutcomeScoringConfig> = {}) {
    this.config = { ...DEFAULT_OUTCOME_SCORING_CONFIG, ...config };
  }

  /**
   * Score a completed trade.
   */
  scoreOutcome(trade: CompletedTrade, planScore?: DecisionQualityScore): OutcomeScore {
    const flags: OutcomeFlag[] = [];

    const realizedReturn = calculateRealizedReturn(trade);
    const realizedPnL = calculateRealizedPnL(trade);
    const holdingDurationHours = calculateHoldingDuration(trade);

    const metrics = calculateMetrics(trade, this.config, flags);
    const executionQuality = scoreExecution(metrics);

    const attribution = calculateAttribution(trade, realizedReturn, this.config);

    const outcomeScore = calculateOverallScore(
      realizedReturn,
      executionQuality,
      planScore,
      trade,
      this.config
    );

    generateOutcomeFlags(trade, realizedReturn, metrics, flags);

    return {
      decisionId: trade.decisionId,
      planScore,
      realizedReturn,
      realizedPnL,
      holdingDurationHours,
      executionQuality,
      outcomeScore,
      attribution,
      flags,
      metrics,
    };
  }

  /**
   * Score multiple completed trades.
   */
  scoreOutcomes(
    trades: CompletedTrade[],
    planScores?: Map<string, DecisionQualityScore>
  ): OutcomeScore[] {
    return trades.map((trade) => this.scoreOutcome(trade, planScores?.get(trade.decisionId)));
  }
}
