/**
 * Paper Trading Evaluation Functions
 *
 * Core evaluation logic for paper trading validation.
 */

import { calculateRealizedMetrics, tradingDaysBetween } from "./statistics.js";
import {
  type ActionRecommendation,
  type AggregatedResults,
  type BacktestedMetrics,
  PAPER_TRADING_DEFAULTS,
  type PaperSignal,
  type PaperTradingConfig,
  PaperTradingConfigSchema,
  type PaperTradingResult,
  type PaperTradingStatus,
} from "./types.js";

/**
 * Evaluate paper trading performance.
 */
export function evaluatePaperTrading(
  config: PaperTradingConfig,
  signals: PaperSignal[],
  backtested: BacktestedMetrics,
  endDate: string
): PaperTradingResult {
  const parsedConfig = PaperTradingConfigSchema.parse(config);
  const { indicatorId, startDate, minimumDays, sharpeTolerance, maxDrawdownMultiplier } =
    parsedConfig;

  const daysTraded = tradingDaysBetween(startDate, endDate);
  const realized = calculateRealizedMetrics(signals);

  const sharpeRatio = backtested.sharpe !== 0 ? realized.sharpe / backtested.sharpe : 0;
  const drawdownRatio =
    backtested.maxDrawdown > 0 ? realized.maxDrawdown / backtested.maxDrawdown : 0;

  let status: PaperTradingStatus;
  let passed = false;
  let failureReason: string | undefined;
  const recommendations: string[] = [];

  if (daysTraded < minimumDays) {
    status = "in_progress";
    failureReason = `Only ${daysTraded} trading days, need ${minimumDays} minimum`;
    recommendations.push(`Continue paper trading for ${minimumDays - daysTraded} more days`);
  } else if (realized.signalsWithOutcomes < minimumDays) {
    status = "insufficient_data";
    failureReason = `Only ${realized.signalsWithOutcomes} signals with outcomes, need ${minimumDays} minimum`;
    recommendations.push("Ensure outcomes are being recorded for signals");
  } else {
    const sharpeCheck = sharpeRatio >= sharpeTolerance;
    const drawdownCheck = drawdownRatio <= maxDrawdownMultiplier;
    passed = sharpeCheck && drawdownCheck;
    status = passed ? "passed" : "failed";

    if (!passed) {
      const reasons: string[] = [];
      if (!sharpeCheck) {
        reasons.push(
          `Sharpe ratio ${sharpeRatio.toFixed(2)} < ${sharpeTolerance} (${realized.sharpe.toFixed(2)} vs ${backtested.sharpe.toFixed(2)} backtested)`
        );
        recommendations.push("Review strategy logic or consider regime-specific models");
      }
      if (!drawdownCheck) {
        reasons.push(
          `Drawdown ratio ${drawdownRatio.toFixed(2)} > ${maxDrawdownMultiplier} (${(realized.maxDrawdown * 100).toFixed(1)}% vs ${(backtested.maxDrawdown * 100).toFixed(1)}% backtested)`
        );
        recommendations.push("Consider tighter position sizing or stop-loss rules");
      }
      failureReason = reasons.join("; ");
    } else {
      recommendations.push("Indicator ready for production deployment");
    }
  }

  return {
    indicatorId,
    startDate,
    endDate,
    daysTraded,
    backtested,
    realized,
    sharpeRatio,
    drawdownRatio,
    passed,
    status,
    failureReason,
    recommendations,
  };
}

/**
 * Check if paper trading can be evaluated (has minimum data).
 */
export function canEvaluatePaperTrading(
  startDate: string,
  endDate: string,
  signals: PaperSignal[],
  minimumDays: number = PAPER_TRADING_DEFAULTS.minimumDays
): boolean {
  const daysTraded = tradingDaysBetween(startDate, endDate);
  const signalsWithOutcomes = signals.filter((s) => s.outcome !== null).length;

  return daysTraded >= minimumDays && signalsWithOutcomes >= minimumDays;
}

/**
 * Determine the recommended action based on paper trading result.
 */
export function determinePaperTradingAction(result: PaperTradingResult): ActionRecommendation {
  switch (result.status) {
    case "passed":
      return {
        action: "promote",
        confidence: result.sharpeRatio >= 0.9 ? "high" : "medium",
        explanation: "Paper trading validation passed. Indicator ready for production.",
      };

    case "in_progress":
      return {
        action: "continue",
        confidence: "low",
        explanation: `Paper trading in progress. ${result.daysTraded} of ${PAPER_TRADING_DEFAULTS.minimumDays} days completed.`,
      };

    case "insufficient_data":
      return {
        action: "review",
        confidence: "low",
        explanation: "Insufficient data for evaluation. Check signal recording system.",
      };

    case "failed":
      if (result.sharpeRatio >= 0.6 && result.drawdownRatio <= 2.5) {
        return {
          action: "review",
          confidence: "medium",
          explanation: "Paper trading marginally failed. Consider parameter adjustments.",
        };
      }
      return {
        action: "retire",
        confidence: "high",
        explanation: "Paper trading failed significantly. Indicator not suitable for production.",
      };
  }
}

/**
 * Calculate days remaining until paper trading can be evaluated.
 */
export function daysUntilEvaluation(
  startDate: string,
  currentDate: string,
  minimumDays: number = PAPER_TRADING_DEFAULTS.minimumDays
): number {
  const daysTraded = tradingDaysBetween(startDate, currentDate);
  return Math.max(0, minimumDays - daysTraded);
}

/**
 * Aggregate paper trading results for multiple indicators.
 */
export function aggregatePaperTradingResults(results: PaperTradingResult[]): AggregatedResults {
  const total = results.length;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const inProgress = results.filter((r) => r.status === "in_progress").length;
  const insufficientData = results.filter((r) => r.status === "insufficient_data").length;

  const completedResults = results.filter((r) => r.status === "passed" || r.status === "failed");
  const passRate = completedResults.length > 0 ? passed / completedResults.length : 0;

  const avgSharpeRatio =
    completedResults.length > 0
      ? completedResults.reduce((sum, r) => sum + r.sharpeRatio, 0) / completedResults.length
      : 0;

  const avgDrawdownRatio =
    completedResults.length > 0
      ? completedResults.reduce((sum, r) => sum + r.drawdownRatio, 0) / completedResults.length
      : 0;

  return {
    total,
    passed,
    failed,
    inProgress,
    insufficientData,
    passRate,
    avgSharpeRatio,
    avgDrawdownRatio,
  };
}
