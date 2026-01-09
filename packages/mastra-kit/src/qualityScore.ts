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

export interface QualityScore {
  scoreId: string;
  targetId: string;
  scoreType: "DECISION" | "PLAN" | "OUTCOME" | "COMBINED";
  overall: number;
  planScore?: DecisionQualityScore | PlanQualityScore;
  outcomeScore?: OutcomeScore;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  predictionAccuracy?: PredictionAccuracy;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PredictionAccuracy {
  directionCorrect: boolean;
  returnDifferenceAbs: number;
  riskLevelCorrect: boolean;
  accuracyScore: number;
}

export interface QualityFeedback {
  decisionId: string;
  predictedReturn: number;
  actualReturn: number;
  preScore: number;
  postScore: number;
  accuracy: PredictionAccuracy;
  timestamp: string;
}

export interface QualitySystemConfig {
  decisionScoring?: Partial<DecisionScoringConfig>;
  outcomeScoring?: Partial<OutcomeScoringConfig>;
  planWeight: number;
  outcomeWeight: number;
  enableFeedback: boolean;
  maxFeedbackEntries: number;
}

const DEFAULT_CONFIG: QualitySystemConfig = {
  planWeight: 0.4,
  outcomeWeight: 0.6,
  enableFeedback: true,
  maxFeedbackEntries: 1000,
};

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

  scoreOutcome(trade: CompletedTrade): QualityScore {
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

    if (planScore && this.config.enableFeedback) {
      this.recordFeedback(planScore, outcomeScore);
    }

    return qualityScore;
  }

  scoreCombined(trade: CompletedTrade, preScore?: DecisionQualityScore): QualityScore {
    const planScore =
      preScore ??
      (this.scoreCache.get(trade.decisionId)?.planScore as DecisionQualityScore | undefined);
    const outcomeScore = this.outcomeScorer.scoreOutcome(trade, planScore);

    let combinedOverall: number;
    if (planScore) {
      combinedOverall = Math.round(
        planScore.overall * this.config.planWeight +
          outcomeScore.outcomeScore * this.config.outcomeWeight
      );
    } else {
      combinedOverall = outcomeScore.outcomeScore;
    }

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

    if (planScore && this.config.enableFeedback) {
      this.recordFeedback(planScore, outcomeScore);
    }

    return qualityScore;
  }

  getFeedbackHistory(): QualityFeedback[] {
    return [...this.feedbackHistory];
  }

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

  clearFeedbackHistory(): void {
    this.feedbackHistory.length = 0;
  }

  getOutcomeSummary(outcomes: OutcomeScore[]): OutcomeSummary {
    return getOutcomeSummary(outcomes);
  }

  private generateScoreId(): string {
    return `score-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private deriveRiskFromOutcome(outcome: OutcomeScore): QualityScore["riskLevel"] {
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

    const predictedReturn = planScore.expectedValue.netExpectedValue * 100;
    const actualReturn = outcomeScore.realizedReturn;
    const returnDifferenceAbs = Math.abs(predictedReturn - actualReturn);
    const riskLevelCorrect = planScore.riskLevel === this.deriveRiskFromOutcome(outcomeScore);

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

    if (this.feedbackHistory.length > this.config.maxFeedbackEntries) {
      this.feedbackHistory.shift();
    }
  }
}

export interface FeedbackSummary {
  totalEntries: number;
  directionAccuracyRate: number;
  averageReturnError: number;
  averagePreScore: number;
  averagePostScore: number;
  averageAccuracyScore: number;
  calibration: {
    highConfidenceCorrect: number;
    lowConfidenceCorrect: number;
    overconfidentRate: number;
  };
}

export function createQualityScoreService(
  config?: Partial<QualitySystemConfig>
): QualityScoreService {
  return new QualityScoreService(config);
}

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

export default {
  QualityScoreService,
  createQualityScoreService,
};
