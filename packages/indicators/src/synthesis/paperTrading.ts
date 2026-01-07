/**
 * Paper Trading Validation
 *
 * Validates indicators in live market conditions before production promotion.
 * Compares realized performance to backtested expectations over a minimum
 * 30-day period.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 889-1025)
 */

import { z } from "zod/v4";

// ============================================
// Constants and Defaults
// ============================================

/**
 * Default configuration for paper trading validation.
 */
export const PAPER_TRADING_DEFAULTS = {
  /** Minimum days of paper trading required */
  minimumDays: 30,
  /** Sharpe ratio tolerance (realized must be >= 70% of backtested) */
  sharpeTolerance: 0.7,
  /** Maximum drawdown multiplier (realized DD must be <= 2x backtested) */
  maxDrawdownMultiplier: 2.0,
  /** Annualization factor (trading days per year) */
  tradingDaysPerYear: 252,
  /** Minimum signals per day for valid evaluation */
  minSignalsPerDay: 1,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Configuration schema for paper trading validation.
 */
export const PaperTradingConfigSchema = z.object({
  /** Unique identifier for the indicator */
  indicatorId: z.string(),
  /** Start date of paper trading (ISO string) */
  startDate: z.string().datetime(),
  /** Minimum days of paper trading required */
  minimumDays: z.number().int().positive().optional().default(30),
  /** Sharpe tolerance (realized >= tolerance * backtested) */
  sharpeTolerance: z.number().min(0).max(1).optional().default(0.7),
  /** Max drawdown multiplier (realized DD <= multiplier * backtested) */
  maxDrawdownMultiplier: z.number().positive().optional().default(2.0),
});

export type PaperTradingConfig = z.input<typeof PaperTradingConfigSchema>;

/**
 * Schema for a single paper trading signal record.
 */
export const PaperSignalSchema = z.object({
  /** Date of the signal (ISO date string) */
  date: z.string(),
  /** Symbol the signal applies to */
  symbol: z.string(),
  /** Signal value (-1 to 1, direction and conviction) */
  signal: z.number(),
  /** Actual outcome/return (null if not yet known) */
  outcome: z.number().nullable(),
});

export type PaperSignal = z.infer<typeof PaperSignalSchema>;

/**
 * Schema for backtested metrics from validation pipeline.
 */
export const BacktestedMetricsSchema = z.object({
  /** Annualized Sharpe ratio from backtest */
  sharpe: z.number(),
  /** Maximum drawdown from backtest (as positive decimal, e.g., 0.15 = 15%) */
  maxDrawdown: z.number().min(0),
  /** Information Coefficient mean */
  icMean: z.number().optional(),
  /** ICIR from backtest */
  icir: z.number().optional(),
});

export type BacktestedMetrics = z.infer<typeof BacktestedMetricsSchema>;

/**
 * Schema for realized metrics from paper trading.
 */
export const RealizedMetricsSchema = z.object({
  /** Annualized Sharpe ratio from paper trading */
  sharpe: z.number(),
  /** Maximum drawdown from paper trading */
  maxDrawdown: z.number().min(0),
  /** Information Coefficient mean */
  icMean: z.number(),
  /** ICIR from paper trading */
  icir: z.number(),
  /** Total number of signals */
  totalSignals: z.number().int().nonnegative(),
  /** Number of signals with known outcomes */
  signalsWithOutcomes: z.number().int().nonnegative(),
  /** Hit rate (% of correct direction) */
  hitRate: z.number().min(0).max(1),
  /** Average daily turnover */
  avgDailyTurnover: z.number().nonnegative(),
});

export type RealizedMetrics = z.infer<typeof RealizedMetricsSchema>;

/**
 * Schema for paper trading evaluation result.
 */
export const PaperTradingResultSchema = z.object({
  /** Indicator identifier */
  indicatorId: z.string(),
  /** Start date of paper trading */
  startDate: z.string(),
  /** End date of evaluation */
  endDate: z.string(),
  /** Number of trading days */
  daysTraded: z.number().int().nonnegative(),

  /** Backtested metrics from validation */
  backtested: BacktestedMetricsSchema,
  /** Realized metrics from paper trading */
  realized: RealizedMetricsSchema,

  /** Sharpe ratio (realized / backtested) */
  sharpeRatio: z.number(),
  /** Drawdown ratio (realized / backtested) */
  drawdownRatio: z.number(),

  /** Whether paper trading passed */
  passed: z.boolean(),
  /** Status of paper trading */
  status: z.enum(["in_progress", "passed", "failed", "insufficient_data"]),
  /** Failure reason if not passed */
  failureReason: z.string().optional(),
  /** Recommendations for next steps */
  recommendations: z.array(z.string()),
});

export type PaperTradingResult = z.infer<typeof PaperTradingResultSchema>;

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate the number of trading days between two dates (inclusive).
 * Approximates by counting weekdays (excludes weekends).
 */
export function tradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    return 0;
  }

  let tradingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      tradingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return tradingDays;
}

/**
 * Calculate realized metrics from paper trading signals.
 */
export function calculateRealizedMetrics(signals: PaperSignal[]): RealizedMetrics {
  // Filter signals with known outcomes
  const signalsWithOutcomes = signals.filter((s) => s.outcome !== null);
  const totalSignals = signals.length;
  const nOutcomes = signalsWithOutcomes.length;

  if (nOutcomes === 0) {
    return {
      sharpe: 0,
      maxDrawdown: 0,
      icMean: 0,
      icir: 0,
      totalSignals,
      signalsWithOutcomes: 0,
      hitRate: 0,
      avgDailyTurnover: 0,
    };
  }

  // Calculate strategy returns (signal * outcome)
  const returns: number[] = signalsWithOutcomes.map((s) => Math.sign(s.signal) * (s.outcome ?? 0));

  // Calculate Sharpe ratio
  const sharpe = calculateAnnualizedSharpe(returns);

  // Calculate max drawdown
  const maxDrawdown = calculateMaxDrawdown(returns);

  // Calculate IC (correlation between signal and outcome)
  const signalValues = signalsWithOutcomes.map((s) => s.signal);
  const outcomeValues = signalsWithOutcomes.map((s) => s.outcome ?? 0);
  const { icMean, icir } = calculateICMetrics(signalValues, outcomeValues);

  // Calculate hit rate
  const correctPredictions = signalsWithOutcomes.filter(
    (s) => Math.sign(s.signal) === Math.sign(s.outcome ?? 0)
  ).length;
  const hitRate = correctPredictions / nOutcomes;

  // Calculate average daily turnover
  const uniqueDates = new Set(signalsWithOutcomes.map((s) => s.date));
  const avgDailyTurnover = uniqueDates.size > 0 ? nOutcomes / uniqueDates.size : 0;

  return {
    sharpe,
    maxDrawdown,
    icMean,
    icir,
    totalSignals,
    signalsWithOutcomes: nOutcomes,
    hitRate,
    avgDailyTurnover,
  };
}

/**
 * Calculate annualized Sharpe ratio from returns.
 */
function calculateAnnualizedSharpe(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);

  if (std < 1e-15) {
    return 0;
  }

  // Annualize assuming daily returns
  return (mean / std) * Math.sqrt(PAPER_TRADING_DEFAULTS.tradingDaysPerYear);
}

/**
 * Calculate maximum drawdown from returns.
 */
function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  // Calculate cumulative returns
  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;

  for (const r of returns) {
    cumulative *= 1 + r;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Calculate IC metrics (mean, std, ICIR) from signals and outcomes.
 */
function calculateICMetrics(
  signals: number[],
  outcomes: number[]
): { icMean: number; icStd: number; icir: number } {
  if (signals.length !== outcomes.length || signals.length < 2) {
    return { icMean: 0, icStd: 0, icir: 0 };
  }

  // Calculate Spearman rank correlation
  const n = signals.length;
  const signalRanks = computeRanks(signals);
  const outcomeRanks = computeRanks(outcomes);

  // Pearson correlation of ranks
  const meanSignal = signalRanks.reduce((a, b) => a + b, 0) / n;
  const meanOutcome = outcomeRanks.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = (signalRanks[i] ?? 0) - meanSignal;
    const dy = (outcomeRanks[i] ?? 0) - meanOutcome;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  const ic = denominator < 1e-15 ? 0 : sumXY / denominator;

  // For single IC value, std is 0 and ICIR is undefined
  // In practice, we'd calculate rolling ICs, but with single period data:
  const icMean = ic;
  const icStd = 0.1; // Placeholder - would need rolling windows for real std
  const icir = icStd > 0 ? icMean / icStd : 0;

  return { icMean, icStd, icir };
}

/**
 * Compute ranks for an array (with tie handling).
 */
function computeRanks(arr: number[]): number[] {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(n);
  let i = 0;

  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j]?.value === indexed[j + 1]?.value) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const idx = indexed[k]?.index;
      if (idx !== undefined) {
        ranks[idx] = avgRank;
      }
    }
    i = j + 1;
  }

  return ranks;
}

// ============================================
// Evaluation Functions
// ============================================

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

  // Calculate ratios
  const sharpeRatio = backtested.sharpe !== 0 ? realized.sharpe / backtested.sharpe : 0;
  const drawdownRatio =
    backtested.maxDrawdown > 0 ? realized.maxDrawdown / backtested.maxDrawdown : 0;

  // Determine status and pass/fail
  let status: "in_progress" | "passed" | "failed" | "insufficient_data";
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
    // Evaluate pass/fail criteria
    const sharpeCheck = sharpeRatio >= sharpeTolerance;
    const drawdownCheck = drawdownRatio <= maxDrawdownMultiplier;
    passed = sharpeCheck && drawdownCheck;
    status = passed ? "passed" : "failed";

    if (!passed) {
      const reasons: string[] = [];
      if (!sharpeCheck) {
        reasons.push(
          `Sharpe ratio ${sharpeRatio.toFixed(2)} < ${sharpeTolerance} (${(realized.sharpe).toFixed(2)} vs ${backtested.sharpe.toFixed(2)} backtested)`
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
export function determinePaperTradingAction(result: PaperTradingResult): {
  action: "promote" | "continue" | "retire" | "review";
  confidence: "high" | "medium" | "low";
  explanation: string;
} {
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
      // Check if close to passing
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
export function aggregatePaperTradingResults(results: PaperTradingResult[]): {
  total: number;
  passed: number;
  failed: number;
  inProgress: number;
  insufficientData: number;
  passRate: number;
  avgSharpeRatio: number;
  avgDrawdownRatio: number;
} {
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
