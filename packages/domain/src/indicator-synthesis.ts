/**
 * Indicator Synthesis Types
 *
 * Types for the Dynamic Indicator Synthesis system that generates, validates,
 * and manages technical indicators through automated discovery and testing.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import { z } from "zod";

// ============================================
// Indicator Category and Status Enums
// ============================================

/**
 * Category of technical indicator
 */
export const IndicatorCategory = z.enum(["momentum", "trend", "volatility", "volume", "custom"]);
export type IndicatorCategory = z.infer<typeof IndicatorCategory>;

/**
 * Lifecycle status of an indicator
 */
export const IndicatorStatus = z.enum([
	"staging", // Under development/validation
	"paper", // In paper trading validation
	"production", // Live in production
	"retired", // No longer in use
]);
export type IndicatorStatus = z.infer<typeof IndicatorStatus>;

// ============================================
// Validation Report Schema
// ============================================

/**
 * Walk-forward validation period results
 */
export const WalkForwardPeriodSchema = z.object({
	/** Period start date (ISO 8601) */
	startDate: z.string(),
	/** Period end date (ISO 8601) */
	endDate: z.string(),
	/** In-sample Sharpe ratio */
	inSampleSharpe: z.number(),
	/** Out-of-sample Sharpe ratio */
	outOfSampleSharpe: z.number(),
	/** Information coefficient for this period */
	informationCoefficient: z.number(),
});
export type WalkForwardPeriod = z.infer<typeof WalkForwardPeriodSchema>;

/**
 * Validation report with statistical rigor metrics
 * Based on DSR (Deflated Sharpe Ratio) framework by Bailey & Lopez de Prado
 */
export const ValidationReportSchema = z.object({
	/** Number of trials tested for DSR calculation */
	trialsCount: z.number().int().min(1),

	/** Raw (unadjusted) Sharpe ratio */
	rawSharpe: z.number(),

	/** Deflated Sharpe Ratio adjusting for multiple testing */
	deflatedSharpe: z.number(),

	/** Probability of Backtest Overfitting (0 to 1) */
	probabilityOfOverfit: z.number().min(0).max(1),

	/** Information Coefficient (correlation with future returns) */
	informationCoefficient: z.number(),

	/** IC standard deviation for significance testing */
	icStandardDev: z.number(),

	/** Maximum drawdown during backtest */
	maxDrawdown: z.number(),

	/** Calmar ratio (annual return / max drawdown) */
	calmarRatio: z.number().optional(),

	/** Sortino ratio (risk-adjusted return using downside deviation) */
	sortinoRatio: z.number().optional(),

	/** Walk-forward validation results */
	walkForwardPeriods: z.array(WalkForwardPeriodSchema),

	/** Validation timestamp (ISO 8601) */
	validatedAt: z.string(),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

// ============================================
// Paper Trading Report Schema
// ============================================

/**
 * Paper trading performance compared to backtest expectations
 */
export const PaperTradingReportSchema = z.object({
	/** Paper trading period start (ISO 8601) */
	periodStart: z.string(),

	/** Paper trading period end (ISO 8601) */
	periodEnd: z.string(),

	/** Number of trading days */
	tradingDays: z.number().int().min(1),

	/** Realized Sharpe ratio during paper trading */
	realizedSharpe: z.number(),

	/** Expected Sharpe from backtest */
	expectedSharpe: z.number(),

	/** Sharpe ratio tracking error */
	sharpeTrackingError: z.number(),

	/** Realized information coefficient */
	realizedIC: z.number(),

	/** Expected IC from backtest */
	expectedIC: z.number(),

	/** Number of signals generated */
	signalsGenerated: z.number().int(),

	/** Percentage of signals that were profitable */
	profitableSignalRate: z.number().min(0).max(1),

	/** Correlation between paper and backtest returns */
	returnCorrelation: z.number().min(-1).max(1),

	/** Pass/fail recommendation based on tracking */
	recommendation: z.enum(["PROMOTE", "EXTEND", "RETIRE"]),

	/** Report generation timestamp (ISO 8601) */
	generatedAt: z.string(),
});
export type PaperTradingReport = z.infer<typeof PaperTradingReportSchema>;

// ============================================
// Trial Parameters Schema
// ============================================

/**
 * Parameters tested in a trial for DSR calculation
 */
export const TrialParametersSchema = z.object({
	/** Lookback period in bars */
	lookback: z.number().int().optional(),

	/** Smoothing factor */
	smoothing: z.number().optional(),

	/** Upper/lower thresholds */
	upperThreshold: z.number().optional(),
	lowerThreshold: z.number().optional(),

	/** Any additional custom parameters */
	custom: z.record(z.string(), z.unknown()).optional(),
});
export type TrialParameters = z.infer<typeof TrialParametersSchema>;

// ============================================
// Indicator Entity Schema
// ============================================

/**
 * Full indicator entity with all metadata
 */
export const IndicatorSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Human-readable name (e.g., "RSI_Adaptive_14") */
	name: z.string(),

	/** Indicator category */
	category: IndicatorCategory,

	/** Lifecycle status */
	status: IndicatorStatus,

	// Generation metadata
	/** Economic hypothesis driving the indicator */
	hypothesis: z.string(),

	/** Economic rationale for why this indicator should work */
	economicRationale: z.string(),

	/** Generation timestamp (ISO 8601) */
	generatedAt: z.string(),

	/** Cycle ID that triggered generation */
	generatedBy: z.string(),

	// Code and implementation
	/** SHA256 hash of generated code for deduplication */
	codeHash: z.string().nullable(),

	/** Normalized AST signature for similarity detection */
	astSignature: z.string().nullable(),

	// Validation results
	/** Validation report with DSR, PBO, IC, walk-forward */
	validationReport: ValidationReportSchema.nullable(),

	/** Paper trading period start (ISO 8601) */
	paperTradingStart: z.string().nullable(),

	/** Paper trading period end (ISO 8601) */
	paperTradingEnd: z.string().nullable(),

	/** Paper trading performance report */
	paperTradingReport: PaperTradingReportSchema.nullable(),

	// Production tracking
	/** Promotion timestamp (ISO 8601) */
	promotedAt: z.string().nullable(),

	/** GitHub PR URL for production deployment */
	prUrl: z.string().nullable(),

	/** PR merge timestamp (ISO 8601) */
	mergedAt: z.string().nullable(),

	// Retirement
	/** Retirement timestamp (ISO 8601) */
	retiredAt: z.string().nullable(),

	/** Reason for retirement */
	retirementReason: z.string().nullable(),

	// Relationships
	/** ID of similar indicator this was derived from */
	similarTo: z.string().nullable(),

	/** ID of indicator this replaces */
	replaces: z.string().nullable(),

	// Timestamps
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Indicator = z.infer<typeof IndicatorSchema>;

// ============================================
// Indicator Trial Schema
// ============================================

/**
 * Individual trial for DSR calculation
 */
export const IndicatorTrialSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Parent indicator ID */
	indicatorId: z.string(),

	/** Trial sequence number */
	trialNumber: z.number().int().min(1),

	/** Hypothesis tested in this trial */
	hypothesis: z.string(),

	/** Parameter settings for this trial */
	parameters: TrialParametersSchema,

	// Results
	/** Sharpe ratio for this trial */
	sharpeRatio: z.number().nullable(),

	/** Information coefficient */
	informationCoefficient: z.number().nullable(),

	/** Maximum drawdown */
	maxDrawdown: z.number().nullable(),

	/** Calmar ratio */
	calmarRatio: z.number().nullable(),

	/** Sortino ratio */
	sortinoRatio: z.number().nullable(),

	/** Whether this trial was selected as the best */
	selected: z.boolean(),

	createdAt: z.string(),
});
export type IndicatorTrial = z.infer<typeof IndicatorTrialSchema>;

// ============================================
// IC History Schema
// ============================================

/**
 * Daily IC tracking for production indicators
 */
export const IndicatorICHistorySchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Parent indicator ID */
	indicatorId: z.string(),

	/** Date of measurement (ISO 8601 date only) */
	date: z.string(),

	/** Information coefficient value */
	icValue: z.number(),

	/** IC standard deviation */
	icStd: z.number(),

	/** Number of decisions using this indicator */
	decisionsUsedIn: z.number().int().min(0),

	/** Number of correct decisions */
	decisionsCorrect: z.number().int().min(0),

	createdAt: z.string(),
});
export type IndicatorICHistory = z.infer<typeof IndicatorICHistorySchema>;

// ============================================
// Create Input Schemas
// ============================================

/**
 * Input for creating a new indicator
 */
export const CreateIndicatorInputSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: IndicatorCategory,
	hypothesis: z.string(),
	economicRationale: z.string(),
	generatedBy: z.string(),
	codeHash: z.string().optional(),
	astSignature: z.string().optional(),
	similarTo: z.string().optional(),
	replaces: z.string().optional(),
});
export type CreateIndicatorInput = z.infer<typeof CreateIndicatorInputSchema>;

/**
 * Input for creating a new trial
 */
export const CreateIndicatorTrialInputSchema = z.object({
	id: z.string(),
	indicatorId: z.string(),
	trialNumber: z.number().int().min(1),
	hypothesis: z.string(),
	parameters: TrialParametersSchema,
});
export type CreateIndicatorTrialInput = z.infer<typeof CreateIndicatorTrialInputSchema>;

/**
 * Input for recording IC history
 */
export const CreateIndicatorICHistoryInputSchema = z.object({
	id: z.string(),
	indicatorId: z.string(),
	date: z.string(),
	icValue: z.number(),
	icStd: z.number(),
	decisionsUsedIn: z.number().int().min(0).optional(),
	decisionsCorrect: z.number().int().min(0).optional(),
});
export type CreateIndicatorICHistoryInput = z.infer<typeof CreateIndicatorICHistoryInputSchema>;

// ============================================
// Filter Schemas
// ============================================

/**
 * Filter options for querying indicators
 */
export const IndicatorFiltersSchema = z.object({
	status: IndicatorStatus.optional(),
	category: IndicatorCategory.optional(),
	generatedBy: z.string().optional(),
	codeHash: z.string().optional(),
});
export type IndicatorFilters = z.infer<typeof IndicatorFiltersSchema>;
