/**
 * Outcome Scoring Types
 *
 * Type definitions and interfaces for retrospective trade outcome scoring.
 */

import type { DecisionQualityScore } from "../planScoring.js";

/**
 * Trade direction.
 */
export type TradeDirection = "LONG" | "SHORT";

/**
 * Exit reason for a completed trade.
 */
export type ExitReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_CLOSE"
  | "TIME_EXIT"
  | "TRAILING_STOP"
  | "SIGNAL_EXIT";

/**
 * Completed trade data for outcome scoring.
 */
export interface CompletedTrade {
  /** Decision ID linking to original decision */
  decisionId: string;

  /** Instrument traded */
  instrumentId: string;

  /** Trade direction */
  direction: TradeDirection;

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
 * Default configuration values.
 */
export const DEFAULT_OUTCOME_SCORING_CONFIG: OutcomeScoringConfig = {
  assumedBeta: 1.0,
  returnWeight: 0.5,
  executionWeight: 0.25,
  predictionWeight: 0.25,
  slippageWarningThreshold: 0.5,
};
