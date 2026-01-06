/**
 * Quality Score Integration
 *
 * Provides a unified quality score system that integrates:
 * - Forward-looking plan scoring (pre-execution)
 * - Retrospective outcome scoring (post-execution)
 * - Feedback loop for improving predictions
 *
 * The quality score serves as a standardized signal for the decision process.
 *
 * @see docs/plans/01-architecture.md line 111
 */

import {
  type CompletedTrade,
  getOutcomeSummary,
  type OutcomeScore,
  OutcomeScorer,
  type OutcomeScoringConfig,
  type OutcomeSummary,
} from "./outcomeScoring.js";
import {
  type DecisionQualityScore,
  DecisionScorer,
  type DecisionScoringConfig,
  type MarketContext,
  type PlanQualityScore,
} from "./planScoring.js";
import type { Decision, DecisionPlan } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Unified quality score combining pre and post execution analysis.
 */
export interface QualityScore {
  /** Unique identifier for this score */
  scoreId: string;

  /** Decision or plan identifier */
  targetId: string;

  /** Type of score */
  scoreType: "DECISION" | "PLAN" | "OUTCOME" | "COMBINED";

  /** Overall quality score (0-100) */
  overall: number;

  /** Pre-execution score (if available) */
  planScore?: DecisionQualityScore | PlanQualityScore;

  /** Post-execution score (if available) */
  outcomeScore?: OutcomeScore;

  /** Risk assessment */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

  /** Prediction accuracy (if both plan and outcome available) */
  predictionAccuracy?: PredictionAccuracy;

  /** Timestamp */
  timestamp: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Prediction accuracy metrics.
 */
export interface PredictionAccuracy {
  /** Whether direction was predicted correctly */
  directionCorrect: boolean;

  /** Predicted vs actual return difference */
  returnDifferenceAbs: number;

  /** Risk level prediction accuracy */
  riskLevelCorrect: boolean;

  /** Overall accuracy score (0-100) */
  accuracyScore: number;
}

/**
 * Feedback entry for tracking prediction quality over time.
 */
export interface QualityFeedback {
  /** Decision ID */
  decisionId: string;

  /** Pre-execution predicted return */
  predictedReturn: number;

  /** Actual realized return */
  actualReturn: number;

  /** Pre-execution score */
  preScore: number;

  /** Post-execution score */
  postScore: number;

  /** Prediction accuracy */
  accuracy: PredictionAccuracy;

  /** Timestamp */
  timestamp: string;
}

/**
 * Quality system configuration.
 */
export interface QualitySystemConfig {
  /** Decision scoring config */
  decisionScoring?: Partial<DecisionScoringConfig>;

  /** Outcome scoring config */
  outcomeScoring?: Partial<OutcomeScoringConfig>;

  /** Weight for plan score in combined scoring */
  planWeight: number;

  /** Weight for outcome score in combined scoring */
  outcomeWeight: number;

  /** Enable feedback tracking */
  enableFeedback: boolean;

  /** Maximum feedback entries to retain */
  maxFeedbackEntries: number;
}

const DEFAULT_CONFIG: QualitySystemConfig = {
  planWeight: 0.4,
  outcomeWeight: 0.6,
  enableFeedback: true,
  maxFeedbackEntries: 1000,
};

// ============================================
// Quality Score Service
// ============================================

/**
 * Unified quality scoring service.
 */
export class QualityScoreService {
  private readonly config: QualitySystemConfig;
  private readonly decisionScorer: DecisionScorer;
  private readonly outcomeScorer: OutcomeScorer;
  private readonly feedbackHistory: QualityFeedback[] = [];
  private readonly scoreCache: Map<string, QualityScore> = new Map();

  constructor(config: Partial<QualitySystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.decisionScorer = new DecisionScorer(this.config.decisionScoring);
    this.outcomeScorer = new OutcomeScorer(this.config.outcomeScoring);
  }

  // ============================================
  // Pre-Execution Scoring
  // ============================================

  /**
   * Score a decision before execution.
   */
  scoreDecision(decision: Decision, portfolioValue: number, context?: MarketContext): QualityScore {
    const planScore = this.decisionScorer.scoreDecision(decision, portfolioValue, context);

    const qualityScore: QualityScore = {
      scoreId: this.generateScoreId(),
      targetId: decision.decisionId,
      scoreType: "DECISION",
      overall: planScore.overall,
      planScore,
      riskLevel: planScore.riskLevel,
      timestamp: new Date().toISOString(),
    };

    this.scoreCache.set(decision.decisionId, qualityScore);
    return qualityScore;
  }

  /**
   * Score an entire plan before execution.
   */
  scorePlan(plan: DecisionPlan, portfolioValue: number, context?: MarketContext): QualityScore {
    const planScore = this.decisionScorer.scorePlan(plan, portfolioValue, context);

    const qualityScore: QualityScore = {
      scoreId: this.generateScoreId(),
      targetId: plan.cycleId,
      scoreType: "PLAN",
      overall: planScore.overall,
      planScore,
      riskLevel: planScore.riskLevel,
      timestamp: new Date().toISOString(),
    };

    this.scoreCache.set(plan.cycleId, qualityScore);
    return qualityScore;
  }

  // ============================================
  // Post-Execution Scoring
  // ============================================

  /**
   * Score a completed trade.
   */
  scoreOutcome(trade: CompletedTrade): QualityScore {
    // Get cached plan score if available
    const cachedScore = this.scoreCache.get(trade.decisionId);
    const planScore = cachedScore?.planScore as DecisionQualityScore | undefined;

    const outcomeScore = this.outcomeScorer.scoreOutcome(trade, planScore);

    const qualityScore: QualityScore = {
      scoreId: this.generateScoreId(),
      targetId: trade.decisionId,
      scoreType: "OUTCOME",
      overall: outcomeScore.outcomeScore,
      outcomeScore,
      riskLevel: this.deriveRiskFromOutcome(outcomeScore),
      timestamp: new Date().toISOString(),
    };

    // Record feedback if we have pre-execution score
    if (planScore && this.config.enableFeedback) {
      this.recordFeedback(planScore, outcomeScore);
    }

    return qualityScore;
  }

  /**
   * Score a completed trade and combine with pre-execution score.
   */
  scoreCombined(trade: CompletedTrade, preScore?: DecisionQualityScore): QualityScore {
    const planScore =
      preScore ??
      (this.scoreCache.get(trade.decisionId)?.planScore as DecisionQualityScore | undefined);
    const outcomeScore = this.outcomeScorer.scoreOutcome(trade, planScore);

    // Calculate combined score
    let combinedOverall: number;
    if (planScore) {
      combinedOverall = Math.round(
        planScore.overall * this.config.planWeight +
          outcomeScore.outcomeScore * this.config.outcomeWeight
      );
    } else {
      combinedOverall = outcomeScore.outcomeScore;
    }

    // Calculate prediction accuracy if both scores available
    const predictionAccuracy = planScore
      ? this.calculatePredictionAccuracy(planScore, outcomeScore)
      : undefined;

    const qualityScore: QualityScore = {
      scoreId: this.generateScoreId(),
      targetId: trade.decisionId,
      scoreType: "COMBINED",
      overall: combinedOverall,
      planScore,
      outcomeScore,
      riskLevel: this.combineRiskLevels(planScore?.riskLevel, outcomeScore),
      predictionAccuracy,
      timestamp: new Date().toISOString(),
    };

    // Record feedback
    if (planScore && this.config.enableFeedback) {
      this.recordFeedback(planScore, outcomeScore);
    }

    return qualityScore;
  }

  // ============================================
  // Feedback and Analysis
  // ============================================

  /**
   * Get feedback history.
   */
  getFeedbackHistory(): QualityFeedback[] {
    return [...this.feedbackHistory];
  }

  /**
   * Get feedback summary statistics.
   */
  getFeedbackSummary(): FeedbackSummary {
    if (this.feedbackHistory.length === 0) {
      return {
        totalEntries: 0,
        directionAccuracyRate: 0,
        averageReturnError: 0,
        averagePreScore: 0,
        averagePostScore: 0,
        averageAccuracyScore: 0,
        calibration: {
          highConfidenceCorrect: 0,
          lowConfidenceCorrect: 0,
          overconfidentRate: 0,
        },
      };
    }

    const totalEntries = this.feedbackHistory.length;
    const directionCorrectCount = this.feedbackHistory.filter(
      (f) => f.accuracy.directionCorrect
    ).length;

    const avgReturnError =
      this.feedbackHistory.reduce((sum, f) => sum + f.accuracy.returnDifferenceAbs, 0) /
      totalEntries;

    const avgPreScore = this.feedbackHistory.reduce((sum, f) => sum + f.preScore, 0) / totalEntries;

    const avgPostScore =
      this.feedbackHistory.reduce((sum, f) => sum + f.postScore, 0) / totalEntries;

    const avgAccuracyScore =
      this.feedbackHistory.reduce((sum, f) => sum + f.accuracy.accuracyScore, 0) / totalEntries;

    // Calibration analysis
    const highConfidenceTrades = this.feedbackHistory.filter((f) => f.preScore >= 70);
    const lowConfidenceTrades = this.feedbackHistory.filter((f) => f.preScore < 50);

    const highConfidenceCorrect =
      highConfidenceTrades.length > 0
        ? highConfidenceTrades.filter((f) => f.actualReturn > 0).length /
          highConfidenceTrades.length
        : 0;

    const lowConfidenceCorrect =
      lowConfidenceTrades.length > 0
        ? lowConfidenceTrades.filter((f) => f.actualReturn > 0).length / lowConfidenceTrades.length
        : 0;

    // Overconfidence: high pre-score but negative outcome
    const overconfidentCount = this.feedbackHistory.filter(
      (f) => f.preScore >= 70 && f.actualReturn < 0
    ).length;

    return {
      totalEntries,
      directionAccuracyRate: directionCorrectCount / totalEntries,
      averageReturnError: avgReturnError,
      averagePreScore: avgPreScore,
      averagePostScore: avgPostScore,
      averageAccuracyScore: avgAccuracyScore,
      calibration: {
        highConfidenceCorrect,
        lowConfidenceCorrect,
        overconfidentRate: totalEntries > 0 ? overconfidentCount / totalEntries : 0,
      },
    };
  }

  /**
   * Clear feedback history.
   */
  clearFeedbackHistory(): void {
    this.feedbackHistory.length = 0;
  }

  /**
   * Get outcome summary from scored outcomes.
   */
  getOutcomeSummary(outcomes: OutcomeScore[]): OutcomeSummary {
    return getOutcomeSummary(outcomes);
  }

  // ============================================
  // Private Methods
  // ============================================

  private generateScoreId(): string {
    return `score-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private deriveRiskFromOutcome(outcome: OutcomeScore): QualityScore["riskLevel"] {
    // Derive risk level from outcome metrics
    if (outcome.realizedReturn < -10 || outcome.metrics.hitStopLoss) {
      return "HIGH";
    }
    if (outcome.realizedReturn < -5) {
      return "MEDIUM";
    }
    if (outcome.realizedReturn < 0) {
      return "LOW";
    }
    return "LOW";
  }

  private combineRiskLevels(
    planRisk: QualityScore["riskLevel"] | undefined,
    outcome: OutcomeScore
  ): QualityScore["riskLevel"] {
    const outcomeRisk = this.deriveRiskFromOutcome(outcome);

    // Use worst risk level
    const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
    const planLevel = planRisk ? riskOrder[planRisk] : 0;
    const outcomeLevel = riskOrder[outcomeRisk];

    const maxLevel = Math.max(planLevel, outcomeLevel);
    const levels: QualityScore["riskLevel"][] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
    return levels[maxLevel] ?? "LOW";
  }

  private calculatePredictionAccuracy(
    planScore: DecisionQualityScore,
    outcomeScore: OutcomeScore
  ): PredictionAccuracy {
    const predictedPositive = planScore.expectedValue.netExpectedValue > 0;
    const actualPositive = outcomeScore.realizedReturn > 0;
    const directionCorrect = predictedPositive === actualPositive;

    // Calculate return difference
    const predictedReturn = planScore.expectedValue.netExpectedValue * 100;
    const actualReturn = outcomeScore.realizedReturn;
    const returnDifferenceAbs = Math.abs(predictedReturn - actualReturn);

    // Risk level comparison
    const riskLevelCorrect = planScore.riskLevel === this.deriveRiskFromOutcome(outcomeScore);

    // Overall accuracy score
    let accuracyScore = 50;
    if (directionCorrect) {
      accuracyScore += 30;
    }
    if (riskLevelCorrect) {
      accuracyScore += 10;
    }
    if (returnDifferenceAbs < 5) {
      accuracyScore += 10;
    }

    return {
      directionCorrect,
      returnDifferenceAbs,
      riskLevelCorrect,
      accuracyScore: Math.min(100, accuracyScore),
    };
  }

  private recordFeedback(planScore: DecisionQualityScore, outcomeScore: OutcomeScore): void {
    const feedback: QualityFeedback = {
      decisionId: outcomeScore.decisionId,
      predictedReturn: planScore.expectedValue.netExpectedValue * 100,
      actualReturn: outcomeScore.realizedReturn,
      preScore: planScore.overall,
      postScore: outcomeScore.outcomeScore,
      accuracy: this.calculatePredictionAccuracy(planScore, outcomeScore),
      timestamp: new Date().toISOString(),
    };

    this.feedbackHistory.push(feedback);

    // Trim if exceeds max
    if (this.feedbackHistory.length > this.config.maxFeedbackEntries) {
      this.feedbackHistory.shift();
    }
  }
}

/**
 * Feedback summary statistics.
 */
export interface FeedbackSummary {
  /** Total feedback entries */
  totalEntries: number;

  /** Direction prediction accuracy rate */
  directionAccuracyRate: number;

  /** Average absolute return prediction error */
  averageReturnError: number;

  /** Average pre-execution score */
  averagePreScore: number;

  /** Average post-execution score */
  averagePostScore: number;

  /** Average accuracy score */
  averageAccuracyScore: number;

  /** Calibration metrics */
  calibration: {
    /** Win rate when pre-score was high (>=70) */
    highConfidenceCorrect: number;
    /** Win rate when pre-score was low (<50) */
    lowConfidenceCorrect: number;
    /** Rate of overconfident predictions */
    overconfidentRate: number;
  };
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a quality score service instance.
 */
export function createQualityScoreService(
  config?: Partial<QualitySystemConfig>
): QualityScoreService {
  return new QualityScoreService(config);
}

// ============================================
// Re-exports
// ============================================

export type {
  CompletedTrade,
  OutcomeScore,
  OutcomeSummary,
} from "./outcomeScoring.js";
export type {
  DecisionQualityScore,
  MarketContext,
  PlanQualityScore,
} from "./planScoring.js";

// ============================================
// Exports
// ============================================

export default {
  QualityScoreService,
  createQualityScoreService,
};
