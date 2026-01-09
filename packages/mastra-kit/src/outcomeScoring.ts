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

import type { DecisionQualityScore } from "./planScoring.js";

/**
 * Completed trade data for outcome scoring.
 */
export interface CompletedTrade {
  /** Decision ID linking to original decision */
  decisionId: string;

  /** Instrument traded */
  instrumentId: string;

  /** Trade direction */
  direction: "LONG" | "SHORT";

  /** Entry price (actual fill) */
  entryPrice: number;

  /** Exit price (actual fill) */
  exitPrice: number;

  /** Expected entry price (from plan) */
  expectedEntryPrice: number;

  /** Expected exit price (take profit target) */
  expectedExitPrice: number;

  /** Position size */
  quantity: number;

  /** Entry timestamp */
  entryTime: string;

  /** Exit timestamp */
  exitTime: string;

  /** Original stop loss price */
  stopLossPrice?: number;

  /** Exit reason */
  exitReason: ExitReason;

  /** Benchmark return during holding period (e.g., SPY) */
  benchmarkReturn?: number;
}

export type ExitReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_CLOSE"
  | "TIME_EXIT"
  | "TRAILING_STOP"
  | "SIGNAL_EXIT";

/**
 * Attribution breakdown of trade return.
 */
export interface ReturnAttribution {
  /** Market contribution (beta * benchmark return) */
  marketContribution: number;

  /** Alpha contribution (skill-based return) */
  alphaContribution: number;

  /** Timing contribution (entry/exit timing impact) */
  timingContribution: number;

  /** Total return (should equal sum of contributions) */
  totalReturn: number;
}

/**
 * Outcome score result.
 */
export interface OutcomeScore {
  /** Decision ID */
  decisionId: string;

  /** Original forward-looking score (if available) */
  planScore?: DecisionQualityScore;

  /** Realized return percentage */
  realizedReturn: number;

  /** Realized P&L in dollars */
  realizedPnL: number;

  /** Holding duration in hours */
  holdingDurationHours: number;

  /** Execution quality score (0-100) */
  executionQuality: number;

  /** Overall outcome score (0-100) */
  outcomeScore: number;

  /** Attribution breakdown */
  attribution: ReturnAttribution;

  /** Outcome flags */
  flags: OutcomeFlag[];

  /** Detailed metrics */
  metrics: OutcomeMetrics;
}

/**
 * Flag indicating specific outcome observations.
 */
export interface OutcomeFlag {
  type: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  code: string;
  message: string;
}

/**
 * Detailed outcome metrics.
 */
export interface OutcomeMetrics {
  /** Entry slippage in percentage */
  entrySlippagePct: number;

  /** Exit slippage in percentage */
  exitSlippagePct: number;

  /** Total slippage impact on return */
  totalSlippagePct: number;

  /** Maximum favorable excursion (MFE) percentage */
  maxFavorableExcursion?: number;

  /** Maximum adverse excursion (MAE) percentage */
  maxAdverseExcursion?: number;

  /** Risk/reward achieved vs planned */
  achievedRiskRewardRatio?: number;

  /** Whether stop loss was hit */
  hitStopLoss: boolean;

  /** Whether take profit was hit */
  hitTakeProfit: boolean;
}

/**
 * Outcome scoring configuration.
 */
export interface OutcomeScoringConfig {
  /** Beta assumption for market attribution (default 1.0) */
  assumedBeta: number;

  /** Weight for return component in overall score */
  returnWeight: number;

  /** Weight for execution quality in overall score */
  executionWeight: number;

  /** Weight for prediction accuracy in overall score */
  predictionWeight: number;

  /** Slippage threshold for warnings (percentage) */
  slippageWarningThreshold: number;
}

const DEFAULT_CONFIG: OutcomeScoringConfig = {
  assumedBeta: 1.0,
  returnWeight: 0.5,
  executionWeight: 0.25,
  predictionWeight: 0.25,
  slippageWarningThreshold: 0.5,
};

/**
 * Scores completed trades for retrospective analysis.
 */
export class OutcomeScorer {
  private readonly config: OutcomeScoringConfig;

  constructor(config: Partial<OutcomeScoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Score a completed trade.
   */
  scoreOutcome(trade: CompletedTrade, planScore?: DecisionQualityScore): OutcomeScore {
    const flags: OutcomeFlag[] = [];

    const realizedReturn = this.calculateRealizedReturn(trade);
    const realizedPnL = this.calculateRealizedPnL(trade);
    const holdingDurationHours = this.calculateHoldingDuration(trade);

    const metrics = this.calculateMetrics(trade, flags);
    const executionQuality = this.scoreExecution(metrics, flags);

    const attribution = this.calculateAttribution(trade, realizedReturn);

    const outcomeScore = this.calculateOverallScore(
      realizedReturn,
      executionQuality,
      planScore,
      trade,
      flags
    );

    this.addOutcomeFlags(trade, realizedReturn, metrics, flags);

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

  /**
   * Calculate realized return percentage.
   */
  private calculateRealizedReturn(trade: CompletedTrade): number {
    const { entryPrice, exitPrice, direction } = trade;

    if (direction === "LONG") {
      return ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - exitPrice) / entryPrice) * 100;
    }
  }

  /**
   * Calculate realized P&L in dollars.
   */
  private calculateRealizedPnL(trade: CompletedTrade): number {
    const { entryPrice, exitPrice, quantity, direction } = trade;

    if (direction === "LONG") {
      return (exitPrice - entryPrice) * quantity;
    } else {
      return (entryPrice - exitPrice) * quantity;
    }
  }

  /**
   * Calculate holding duration in hours.
   */
  private calculateHoldingDuration(trade: CompletedTrade): number {
    const entry = new Date(trade.entryTime);
    const exit = new Date(trade.exitTime);
    const durationMs = exit.getTime() - entry.getTime();
    return durationMs / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Calculate detailed metrics.
   */
  private calculateMetrics(trade: CompletedTrade, flags: OutcomeFlag[]): OutcomeMetrics {
    const entrySlippagePct = this.calculateEntrySlippage(trade);
    const exitSlippagePct = this.calculateExitSlippage(trade);
    const totalSlippagePct = entrySlippagePct + exitSlippagePct;

    if (Math.abs(totalSlippagePct) > this.config.slippageWarningThreshold) {
      flags.push({
        type: "NEGATIVE",
        code: "HIGH_SLIPPAGE",
        message: `Total slippage ${totalSlippagePct.toFixed(2)}% exceeds threshold`,
      });
    }

    const hitStopLoss = trade.exitReason === "STOP_LOSS" || trade.exitReason === "TRAILING_STOP";
    const hitTakeProfit = trade.exitReason === "TAKE_PROFIT";

    let achievedRiskRewardRatio: number | undefined;
    if (trade.stopLossPrice && trade.expectedExitPrice) {
      const plannedRisk = Math.abs(trade.entryPrice - trade.stopLossPrice);
      const plannedReward = Math.abs(trade.expectedExitPrice - trade.entryPrice);
      const actualReturn = Math.abs(trade.exitPrice - trade.entryPrice);

      if (plannedRisk > 0) {
        const _plannedRR = plannedReward / plannedRisk;
        const achievedReturnInR = actualReturn / plannedRisk;

        // Positive if profitable, negative if loss
        const realizedReturn = this.calculateRealizedReturn(trade);
        achievedRiskRewardRatio = realizedReturn >= 0 ? achievedReturnInR : -achievedReturnInR;
      }
    }

    return {
      entrySlippagePct,
      exitSlippagePct,
      totalSlippagePct,
      achievedRiskRewardRatio,
      hitStopLoss,
      hitTakeProfit,
    };
  }

  /**
   * Calculate entry slippage.
   */
  private calculateEntrySlippage(trade: CompletedTrade): number {
    const { entryPrice, expectedEntryPrice, direction } = trade;

    if (direction === "LONG") {
      // For long, slippage is negative when we pay more than expected
      return ((entryPrice - expectedEntryPrice) / expectedEntryPrice) * 100;
    } else {
      // For short, slippage is negative when we sell for less than expected
      return ((expectedEntryPrice - entryPrice) / expectedEntryPrice) * 100;
    }
  }

  /**
   * Calculate exit slippage.
   */
  private calculateExitSlippage(trade: CompletedTrade): number {
    const { exitPrice, expectedExitPrice, direction } = trade;

    if (direction === "LONG") {
      // For long exit, slippage is negative when we get less than expected
      return ((expectedExitPrice - exitPrice) / expectedExitPrice) * 100;
    } else {
      // For short exit, slippage is negative when we pay more than expected
      return ((exitPrice - expectedExitPrice) / expectedExitPrice) * 100;
    }
  }

  /**
   * Score execution quality.
   */
  private scoreExecution(metrics: OutcomeMetrics, _flags: OutcomeFlag[]): number {
    const { totalSlippagePct } = metrics;
    const absSlippage = Math.abs(totalSlippagePct);

    // Perfect execution: 0 slippage = 100
    // Each 0.1% slippage reduces score by 10 points
    const slippagePenalty = absSlippage * 100;
    const score = Math.max(0, 100 - slippagePenalty);

    // Bonus for positive slippage (got better prices than expected)
    if (totalSlippagePct < 0) {
      return Math.min(100, score + 10);
    }

    return score;
  }

  /**
   * Calculate return attribution.
   */
  private calculateAttribution(trade: CompletedTrade, realizedReturn: number): ReturnAttribution {
    const benchmarkReturn = trade.benchmarkReturn ?? 0;

    // Market contribution = beta * benchmark return
    const marketContribution = this.config.assumedBeta * benchmarkReturn;

    // Timing contribution is harder to measure without intraday data
    // Estimate based on how close we are to optimal entry/exit
    const timingContribution = this.estimateTimingContribution(trade);

    // Alpha = total - market - timing
    const alphaContribution = realizedReturn - marketContribution - timingContribution;

    return {
      marketContribution,
      alphaContribution,
      timingContribution,
      totalReturn: realizedReturn,
    };
  }

  /**
   * Estimate timing contribution.
   */
  private estimateTimingContribution(trade: CompletedTrade): number {
    // Simple heuristic: timing contribution based on how close
    // actual entry/exit were to expected prices
    const entryDiff = (trade.expectedEntryPrice - trade.entryPrice) / trade.expectedEntryPrice;
    const exitDiff = (trade.exitPrice - trade.expectedExitPrice) / trade.expectedExitPrice;

    // Adjust sign based on direction
    if (trade.direction === "LONG") {
      // Good timing for long: bought lower, sold higher than expected
      return (entryDiff + exitDiff) * 100;
    } else {
      // Good timing for short: sold higher, bought back lower than expected
      return (-entryDiff - exitDiff) * 100;
    }
  }

  /**
   * Calculate overall outcome score.
   */
  private calculateOverallScore(
    realizedReturn: number,
    executionQuality: number,
    planScore: DecisionQualityScore | undefined,
    trade: CompletedTrade,
    _flags: OutcomeFlag[]
  ): number {
    // Return score: normalize return to 0-100 scale
    // Assume +10% return = 100, 0% = 50, -10% = 0
    const returnScore = Math.max(0, Math.min(100, 50 + realizedReturn * 5));

    // Prediction accuracy score: how well did plan predict outcome?
    let predictionScore = 50; // Default if no plan score

    if (planScore) {
      // Compare predicted vs actual
      const predictedPositive = planScore.expectedValue.netExpectedValue > 0;
      const actualPositive = realizedReturn > 0;

      if (predictedPositive === actualPositive) {
        // Correct direction prediction
        predictionScore = 70;

        // Bonus if we hit take profit when predicted positive EV
        if (trade.exitReason === "TAKE_PROFIT" && predictedPositive) {
          predictionScore = 90;
        }
      } else {
        // Wrong prediction
        predictionScore = 30;
      }
    }

    // Weighted combination
    const overall =
      returnScore * this.config.returnWeight +
      executionQuality * this.config.executionWeight +
      predictionScore * this.config.predictionWeight;

    return Math.round(overall);
  }

  /**
   * Add outcome-specific flags.
   */
  private addOutcomeFlags(
    trade: CompletedTrade,
    realizedReturn: number,
    metrics: OutcomeMetrics,
    flags: OutcomeFlag[]
  ): void {
    // Profitable trade
    if (realizedReturn > 0) {
      flags.push({
        type: "POSITIVE",
        code: "PROFITABLE",
        message: `Trade profitable with ${realizedReturn.toFixed(2)}% return`,
      });

      if (metrics.hitTakeProfit) {
        flags.push({
          type: "POSITIVE",
          code: "HIT_TARGET",
          message: "Take profit target reached",
        });
      }
    }

    // Losing trade
    if (realizedReturn < 0) {
      flags.push({
        type: "NEGATIVE",
        code: "LOSS",
        message: `Trade lost ${Math.abs(realizedReturn).toFixed(2)}%`,
      });

      if (metrics.hitStopLoss) {
        flags.push({
          type: "NEUTRAL",
          code: "STOP_LOSS_WORKED",
          message: "Stop loss protected from larger loss",
        });
      }
    }

    // Large winner
    if (realizedReturn > 5) {
      flags.push({
        type: "POSITIVE",
        code: "BIG_WINNER",
        message: `Exceptional trade with ${realizedReturn.toFixed(2)}% return`,
      });
    }

    // Large loser
    if (realizedReturn < -5) {
      flags.push({
        type: "NEGATIVE",
        code: "BIG_LOSER",
        message: `Large loss of ${Math.abs(realizedReturn).toFixed(2)}%`,
      });
    }

    // Good R:R achieved
    if (metrics.achievedRiskRewardRatio !== undefined) {
      if (metrics.achievedRiskRewardRatio >= 2) {
        flags.push({
          type: "POSITIVE",
          code: "GOOD_RR_ACHIEVED",
          message: `Achieved ${metrics.achievedRiskRewardRatio.toFixed(2)}R`,
        });
      } else if (metrics.achievedRiskRewardRatio < 0) {
        flags.push({
          type: "NEGATIVE",
          code: "NEGATIVE_RR",
          message: `Lost ${Math.abs(metrics.achievedRiskRewardRatio).toFixed(2)}R`,
        });
      }
    }

    // Exit reason flags
    if (trade.exitReason === "TIME_EXIT") {
      flags.push({
        type: "NEUTRAL",
        code: "TIME_EXIT",
        message: "Position closed due to time limit",
      });
    }
  }
}

/**
 * Summary statistics for a set of outcome scores.
 */
export interface OutcomeSummary {
  /** Total trades */
  totalTrades: number;

  /** Winning trades */
  winningTrades: number;

  /** Losing trades */
  losingTrades: number;

  /** Win rate */
  winRate: number;

  /** Average return */
  averageReturn: number;

  /** Total return */
  totalReturn: number;

  /** Average winner */
  averageWinner: number;

  /** Average loser */
  averageLoser: number;

  /** Profit factor (gross profit / gross loss) */
  profitFactor: number;

  /** Average outcome score */
  averageOutcomeScore: number;

  /** Average execution quality */
  averageExecutionQuality: number;

  /** Average holding duration (hours) */
  averageHoldingHours: number;

  /** Attribution summary */
  attribution: ReturnAttribution;
}

/**
 * Calculate summary statistics from outcome scores.
 */
export function getOutcomeSummary(scores: OutcomeScore[]): OutcomeSummary {
  if (scores.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageReturn: 0,
      totalReturn: 0,
      averageWinner: 0,
      averageLoser: 0,
      profitFactor: 0,
      averageOutcomeScore: 0,
      averageExecutionQuality: 0,
      averageHoldingHours: 0,
      attribution: {
        marketContribution: 0,
        alphaContribution: 0,
        timingContribution: 0,
        totalReturn: 0,
      },
    };
  }

  const winners = scores.filter((s) => s.realizedReturn > 0);
  const losers = scores.filter((s) => s.realizedReturn < 0);

  const grossProfit = winners.reduce((sum, s) => sum + s.realizedReturn, 0);
  const grossLoss = Math.abs(losers.reduce((sum, s) => sum + s.realizedReturn, 0));

  const avgWinner = winners.length > 0 ? grossProfit / winners.length : 0;

  const avgLoser = losers.length > 0 ? grossLoss / losers.length : 0;

  const totalAttribution = scores.reduce(
    (acc, s) => ({
      marketContribution: acc.marketContribution + s.attribution.marketContribution,
      alphaContribution: acc.alphaContribution + s.attribution.alphaContribution,
      timingContribution: acc.timingContribution + s.attribution.timingContribution,
      totalReturn: acc.totalReturn + s.attribution.totalReturn,
    }),
    { marketContribution: 0, alphaContribution: 0, timingContribution: 0, totalReturn: 0 }
  );

  return {
    totalTrades: scores.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: winners.length / scores.length,
    averageReturn: scores.reduce((sum, s) => sum + s.realizedReturn, 0) / scores.length,
    totalReturn: scores.reduce((sum, s) => sum + s.realizedReturn, 0),
    averageWinner: avgWinner,
    averageLoser: avgLoser,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    averageOutcomeScore: scores.reduce((sum, s) => sum + s.outcomeScore, 0) / scores.length,
    averageExecutionQuality: scores.reduce((sum, s) => sum + s.executionQuality, 0) / scores.length,
    averageHoldingHours: scores.reduce((sum, s) => sum + s.holdingDurationHours, 0) / scores.length,
    attribution: totalAttribution,
  };
}

/**
 * Score a single completed trade.
 */
export function scoreOutcome(
  trade: CompletedTrade,
  planScore?: DecisionQualityScore,
  config?: Partial<OutcomeScoringConfig>
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
  config?: Partial<OutcomeScoringConfig>
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
