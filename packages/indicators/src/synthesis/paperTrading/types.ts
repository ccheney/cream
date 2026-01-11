/**
 * Paper Trading Types and Schemas
 *
 * Type definitions and Zod schemas for paper trading validation.
 */

import { z } from "zod/v4";

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

/** Paper trading status values */
export type PaperTradingStatus = "in_progress" | "passed" | "failed" | "insufficient_data";

/** Paper trading action recommendations */
export type PaperTradingAction = "promote" | "continue" | "retire" | "review";

/** Confidence level for action recommendations */
export type ActionConfidence = "high" | "medium" | "low";

/** Action recommendation result */
export interface ActionRecommendation {
  action: PaperTradingAction;
  confidence: ActionConfidence;
  explanation: string;
}

/** Aggregated paper trading results */
export interface AggregatedResults {
  total: number;
  passed: number;
  failed: number;
  inProgress: number;
  insufficientData: number;
  passRate: number;
  avgSharpeRatio: number;
  avgDrawdownRatio: number;
}
